import { CString, dlopen, ptr } from "bun:ffi";
import { bench, group, run } from "../runner.mjs";

const { napiNoop, napiHash, napiString } = require(import.meta.dir + "/src/ffi_napi_bench.node");

const {
  symbols: {
    ffi_noop: { native: ffi_noop },
    ffi_hash: { native: ffi_hash },
    ffi_string: { native: ffi_string },
    ffi_strlen: { native: ffi_strlen },
  },
} = dlopen(import.meta.dir + "/src/ffi_napi_bench.node", {
  ffi_noop: { args: [], returns: "void" },
  ffi_string: { args: [], returns: "ptr" },
  ffi_hash: { args: ["ptr", "u32"], returns: "u32" },
  // Measures the JS-string -> const char* INPUT path (a 36-char string, like a UUID).
  ffi_strlen: { args: ["cstring"], returns: "u32" },
});

const bytes = new Uint8Array(64);
// The four ways to feed a string INTO an FFI call (the "String arguments" table).
const str36 = "550e8400-e29b-41d4-a716-446655440000"; // 36 chars, no NUL
const cachedCString = new CString(ptr(Buffer.from(str36 + "\0", "utf8"))); // pre-encoded, reusable
const strBuf = Buffer.from(str36 + "\0", "utf8"); // caller-owned NUL-terminated buffer
const strPtr = ptr(strBuf); // its raw address

group("bun:ffi", () => {
  bench("noop", () => ffi_noop());
  bench("hash", () => ffi_hash(ptr(bytes), bytes.byteLength));

  bench("c string", () => new CString(ffi_string()));

  // String ARGUMENTS: strlen of a 36-char string via each input form.
  bench("string arg: JS string", () => ffi_strlen(str36)); // engine encodes into the call arena
  bench("string arg: cached CString", () => ffi_strlen(cachedCString)); // zero re-encode
  bench("string arg: raw pointer", () => ffi_strlen(strPtr)); // caller-managed buffer
  bench("string arg: TypedArray", () => ffi_strlen(strBuf)); // Deno-style
});

if (process.env.SHOW_NAPI)
  group("bun:napi", () => {
    bench("noop", () => napiNoop());
    bench("hash", () => napiHash(bytes));

    bench("string", () => napiString());
  });

await run();
