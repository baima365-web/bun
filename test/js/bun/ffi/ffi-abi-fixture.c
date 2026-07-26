// ABI conformance fixture for bun:ffi. Each function returns a POSITION-WEIGHTED combination of
// its arguments so a mis-ordered, mis-strided, truncated, or wrong-register argument changes the
// observable result. Covers: every integer width & signedness, floats, many-arg stack spills
// (int and float), mixed int/float positional-vs-separate register allocation (Win64 vs SysV/
// AAPCS64), sub-word stack packing (Darwin arm64 natural alignment), and the callback direction.
#include <stdint.h>
#include <stdbool.h>
#ifdef _WIN32
#define FFI_EXPORT __declspec(dllexport)
#else
#define FFI_EXPORT __attribute__((visibility("default")))
#endif

// ---- width / signedness (boundary values are chosen JS-side) ----
FFI_EXPORT int8_t   abi_i8(int8_t x)   { return x; }
FFI_EXPORT uint8_t  abi_u8(uint8_t x)  { return x; }
FFI_EXPORT int16_t  abi_i16(int16_t x) { return x; }
FFI_EXPORT uint16_t abi_u16(uint16_t x){ return x; }
FFI_EXPORT int32_t  abi_i32(int32_t x) { return x; }
FFI_EXPORT uint32_t abi_u32(uint32_t x){ return x; }
FFI_EXPORT int64_t  abi_i64(int64_t x) { return x; }
FFI_EXPORT uint64_t abi_u64(uint64_t x){ return x; }
FFI_EXPORT float    abi_f32(float x)   { return x; }
FFI_EXPORT double   abi_f64(double x)  { return x; }
FFI_EXPORT bool     abi_bool(bool x)   { return !x; }
FFI_EXPORT char     abi_char(char x)   { return x; }

// ---- many-arg integer: 10 x i32 -> the last two spill to the stack on every 64-bit ABI ----
FFI_EXPORT int64_t abi_sum_i32_x10(int32_t a0,int32_t a1,int32_t a2,int32_t a3,int32_t a4,int32_t a5,int32_t a6,int32_t a7,int32_t a8,int32_t a9) {
  return (int64_t)a0*1+(int64_t)a1*2+(int64_t)a2*3+(int64_t)a3*4+(int64_t)a4*5+(int64_t)a5*6+(int64_t)a6*7+(int64_t)a7*8+(int64_t)a8*9+(int64_t)a9*10;
}
// ---- many-arg 64-bit ----
FFI_EXPORT int64_t abi_sum_i64_x10(int64_t a0,int64_t a1,int64_t a2,int64_t a3,int64_t a4,int64_t a5,int64_t a6,int64_t a7,int64_t a8,int64_t a9) {
  return a0*1+a1*2+a2*3+a3*4+a4*5+a5*6+a6*7+a7*8+a8*9+a9*10;
}
// ---- many-arg float: 10 x f64 -> exceeds the 8 XMM/V registers on every ABI ----
FFI_EXPORT double abi_sum_f64_x10(double a0,double a1,double a2,double a3,double a4,double a5,double a6,double a7,double a8,double a9) {
  return a0*1+a1*2+a2*3+a3*4+a4*5+a5*6+a6*7+a7*8+a8*9+a9*10;
}
// ---- many-arg f32 (single-precision register/stack handling) ----
FFI_EXPORT double abi_sum_f32_x10(float a0,float a1,float a2,float a3,float a4,float a5,float a6,float a7,float a8,float a9) {
  return (double)a0*1+(double)a1*2+(double)a2*3+(double)a3*4+(double)a4*5+(double)a5*6+(double)a6*7+(double)a7*8+(double)a8*9+(double)a9*10;
}
// ---- mixed int/float, 12 args, alternating: Win64 assigns registers POSITIONALLY (shared
//      RCX/XMM0 slots) while SysV/AAPCS64 count int and float args separately. A wrong model
//      of either puts values in the wrong registers/slots. ----
FFI_EXPORT double abi_mix12(int32_t a0,double a1,int32_t a2,double a3,int32_t a4,double a5,int32_t a6,double a7,int32_t a8,double a9,int32_t a10,double a11) {
  return (double)a0*1+a1*2+(double)a2*3+a3*4+(double)a4*5+a5*6+(double)a6*7+a7*8+(double)a8*9+a9*10+(double)a10*11+a11*12;
}
// ---- 64-bit ints past the register count (i64 stack args) ----
FFI_EXPORT int64_t abi_mix_i64f64(int64_t a0,double a1,int64_t a2,double a3,int64_t a4,double a5,int64_t a6,double a7,int64_t a8,double a9) {
  return a0*1+(int64_t)(a1*2)+a2*3+(int64_t)(a3*4)+a4*5+(int64_t)(a5*6)+a6*7+(int64_t)(a7*8)+a8*9+(int64_t)(a9*10);
}
// ---- sub-word stack packing: 12 x u8. On Darwin/arm64 the 9th..12th are packed at 1-byte
//      natural alignment on the stack (not 8- or 4-byte slots). ----
FFI_EXPORT int64_t abi_sum_u8_x12(uint8_t a0,uint8_t a1,uint8_t a2,uint8_t a3,uint8_t a4,uint8_t a5,uint8_t a6,uint8_t a7,uint8_t a8,uint8_t a9,uint8_t a10,uint8_t a11) {
  return (int64_t)a0*1+(int64_t)a1*2+(int64_t)a2*3+(int64_t)a3*4+(int64_t)a4*5+(int64_t)a5*6+(int64_t)a6*7+(int64_t)a7*8+(int64_t)a8*9+(int64_t)a9*10+(int64_t)a10*11+(int64_t)a11*12;
}
// ---- sub-word signed: 12 x i8 (sign-extension of stacked bytes) ----
FFI_EXPORT int64_t abi_sum_i8_x12(int8_t a0,int8_t a1,int8_t a2,int8_t a3,int8_t a4,int8_t a5,int8_t a6,int8_t a7,int8_t a8,int8_t a9,int8_t a10,int8_t a11) {
  return (int64_t)a0*1+(int64_t)a1*2+(int64_t)a2*3+(int64_t)a3*4+(int64_t)a4*5+(int64_t)a5*6+(int64_t)a6*7+(int64_t)a7*8+(int64_t)a8*9+(int64_t)a9*10+(int64_t)a10*11+(int64_t)a11*12;
}
// ---- 16-bit stack packing: 12 x i16 ----
FFI_EXPORT int64_t abi_sum_i16_x12(int16_t a0,int16_t a1,int16_t a2,int16_t a3,int16_t a4,int16_t a5,int16_t a6,int16_t a7,int16_t a8,int16_t a9,int16_t a10,int16_t a11) {
  return (int64_t)a0*1+(int64_t)a1*2+(int64_t)a2*3+(int64_t)a3*4+(int64_t)a4*5+(int64_t)a5*6+(int64_t)a6*7+(int64_t)a7*8+(int64_t)a8*9+(int64_t)a9*10+(int64_t)a10*11+(int64_t)a11*12;
}
// ---- bool as an argument past the registers (byte-sized, must be exactly 0/1) ----
FFI_EXPORT int32_t abi_bools_x10(bool a0,bool a1,bool a2,bool a3,bool a4,bool a5,bool a6,bool a7,bool a8,bool a9) {
  return (a0?1:0)*1+(a1?1:0)*2+(a2?1:0)*4+(a3?1:0)*8+(a4?1:0)*16+(a5?1:0)*32+(a6?1:0)*64+(a7?1:0)*128+(a8?1:0)*256+(a9?1:0)*512;
}

// ---- callback direction: C invokes the JS callback with the same weighted-arg shapes ----
FFI_EXPORT int64_t abi_cb_i32_x10(int64_t (*cb)(int32_t,int32_t,int32_t,int32_t,int32_t,int32_t,int32_t,int32_t,int32_t,int32_t), int32_t k) {
  return cb(k, k+1, k+2, k+3, k+4, k+5, k+6, k+7, k+8, k+9);
}
FFI_EXPORT double abi_cb_f64_x10(double (*cb)(double,double,double,double,double,double,double,double,double,double), double k) {
  return cb(k, k+0.5, k+1, k+1.5, k+2, k+2.5, k+3, k+3.5, k+4, k+4.5);
}
FFI_EXPORT double abi_cb_mix12(double (*cb)(int32_t,double,int32_t,double,int32_t,double,int32_t,double,int32_t,double,int32_t,double), int32_t i, double d) {
  return cb(i, d, i+1, d+1, i+2, d+2, i+3, d+3, i+4, d+4, i+5, d+5);
}
FFI_EXPORT int64_t abi_cb_i64_x10(int64_t (*cb)(int64_t,int64_t,int64_t,int64_t,int64_t,int64_t,int64_t,int64_t,int64_t,int64_t), int64_t k) {
  return cb(k, k+1, k+2, k+3, k+4, k+5, k+6, k+7, k+8, k+9);
}
