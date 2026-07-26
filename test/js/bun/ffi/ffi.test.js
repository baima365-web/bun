import { afterAll, describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { bunEnv, bunExe, compileFixture, isGlibcVersionAtLeast, isWindows, tempDir } from "harness";
import { platform } from "os";

import {
  dlopen as _dlopen,
  CFunction,
  CString,
  JSCallback,
  ptr,
  read,
  suffix,
  toArrayBuffer,
  toBuffer,
  viewSource,
  linkSymbols,
} from "bun:ffi";

// Build the C fixture with the host compiler at test time (every CI test host has `cc`), so
// this suite runs on every platform instead of being skipped for lack of a prebuilt library.
// On a compiler-less dev machine, only the fixture-dependent suite is skipped (below), not the file.
let FFI_FIXTURE_PATH = null;
let ABI_FIXTURE_PATH = null;
try {
  FFI_FIXTURE_PATH = compileFixture(import.meta.dir + "/ffi-test.c");
  ABI_FIXTURE_PATH = compileFixture(import.meta.dir + "/ffi-abi-fixture.c");
} catch (e) {
  console.warn(`[ffi.test] fixture-dependent tests skipped: ${e?.message ?? e}`);
}
const dlopen = (...args) => _dlopen(...args);

it("ffi print", async () => {
  await Bun.write(
    import.meta.dir + "/ffi.test.fixture.callback.c",
    viewSource(
      {
        returns: "bool",
        args: ["ptr"],
      },
      true,
    ),
  );
  await Bun.write(
    import.meta.dir + "/ffi.test.fixture.receiver.c",
    viewSource(
      {
        not_a_callback: {
          returns: "float",
          args: ["float"],
        },
      },
      false,
    )[0],
  );
  expect(
    viewSource(
      {
        returns: "int8_t",
        args: [],
      },
      true,
    ).length > 0,
  ).toBe(true);
  expect(
    viewSource(
      {
        a: {
          returns: "int8_t",
          args: [],
        },
      },
      false,
    ).length > 0,
  ).toBe(true);
});

function getTypes(fast) {
  const int64_t = fast ? "i64_fast" : "int64_t";
  const uint64_t = fast ? "u64_fast" : "uint64_t";
  return {
    returns_true: {
      returns: "bool",
      args: [],
    },
    returns_false: {
      returns: "bool",
      args: [],
    },
    returns_42_char: {
      returns: "char",
      args: [],
    },
    returns_42_float: {
      returns: "float",
      args: [],
    },
    returns_42_double: {
      returns: "double",
      args: [],
    },
    returns_42_uint8_t: {
      returns: "uint8_t",
      args: [],
    },
    returns_neg_42_int8_t: {
      returns: "int8_t",
      args: [],
    },
    returns_42_uint16_t: {
      returns: "uint16_t",
      args: [],
    },
    returns_42_uint32_t: {
      returns: "uint32_t",
      args: [],
    },
    returns_42_uint64_t: {
      returns: uint64_t,
      args: [],
    },
    returns_neg_42_int16_t: {
      returns: "int16_t",
      args: [],
    },
    returns_neg_42_int32_t: {
      returns: "int32_t",
      args: [],
    },
    returns_neg_42_int64_t: {
      returns: int64_t,
      args: [],
    },

    identity_char: {
      returns: "char",
      args: ["char"],
    },
    identity_float: {
      returns: "float",
      args: ["float"],
    },
    identity_bool: {
      returns: "bool",
      args: ["bool"],
    },
    identity_double: {
      returns: "double",
      args: ["double"],
    },
    identity_int8_t: {
      returns: "int8_t",
      args: ["int8_t"],
    },
    identity_int16_t: {
      returns: "int16_t",
      args: ["int16_t"],
    },
    identity_int32_t: {
      returns: "int32_t",
      args: ["int32_t"],
    },
    identity_int64_t: {
      returns: int64_t,
      args: [int64_t],
    },
    identity_uint8_t: {
      returns: "uint8_t",
      args: ["uint8_t"],
    },
    identity_uint16_t: {
      returns: "uint16_t",
      args: ["uint16_t"],
    },
    identity_uint32_t: {
      returns: "uint32_t",
      args: ["uint32_t"],
    },
    identity_uint64_t: {
      returns: uint64_t,
      args: [uint64_t],
    },

    add_char: {
      returns: "char",
      args: ["char", "char"],
    },
    add_float: {
      returns: "float",
      args: ["float", "float"],
    },
    add_double: {
      returns: "double",
      args: ["double", "double"],
    },
    add_int8_t: {
      returns: "int8_t",
      args: ["int8_t", "int8_t"],
    },
    add_int16_t: {
      returns: "int16_t",
      args: ["int16_t", "int16_t"],
    },
    add_int32_t: {
      returns: "int32_t",
      args: ["int32_t", "int32_t"],
    },
    add_int64_t: {
      returns: int64_t,
      args: [int64_t, int64_t],
    },
    add_uint8_t: {
      returns: "uint8_t",
      args: ["uint8_t", "uint8_t"],
    },
    add_uint16_t: {
      returns: "uint16_t",
      args: ["uint16_t", "uint16_t"],
    },
    add_uint32_t: {
      returns: "uint32_t",
      args: ["uint32_t", "uint32_t"],
    },

    is_null: {
      returns: "bool",
      args: ["ptr"],
    },

    does_pointer_equal_42_as_int32_t: {
      returns: "bool",
      args: ["ptr"],
    },

    ptr_should_point_to_42_as_int32_t: {
      returns: "ptr",
      args: [],
    },
    identity_ptr: {
      returns: "ptr",
      args: ["ptr"],
    },
    add_uint64_t: {
      returns: uint64_t,
      args: [uint64_t, uint64_t],
    },

    cb_identity_true: {
      returns: "bool",
      args: ["ptr"],
    },
    cb_identity_false: {
      returns: "bool",
      args: ["ptr"],
    },
    cb_identity_42_char: {
      returns: "char",
      args: ["ptr"],
    },
    cb_identity_42_float: {
      returns: "float",
      args: ["ptr"],
    },
    cb_identity_42_double: {
      returns: "double",
      args: ["ptr"],
    },
    cb_identity_42_uint8_t: {
      returns: "uint8_t",
      args: ["ptr"],
    },
    cb_identity_neg_42_int8_t: {
      returns: "int8_t",
      args: ["ptr"],
    },
    cb_identity_42_uint16_t: {
      returns: "uint16_t",
      args: ["ptr"],
    },
    cb_identity_42_uint32_t: {
      returns: "uint32_t",
      args: ["ptr"],
    },
    cb_identity_42_uint64_t: {
      returns: uint64_t,
      args: ["ptr"],
    },
    cb_identity_neg_42_int16_t: {
      returns: "int16_t",
      args: ["ptr"],
    },
    cb_identity_neg_42_int32_t: {
      returns: "int32_t",
      args: ["ptr"],
    },
    cb_identity_neg_42_int64_t: {
      returns: int64_t,
      args: ["ptr"],
    },

    return_a_function_ptr_to_function_that_returns_true: {
      returns: "ptr",
      args: [],
    },

    getDeallocatorCalledCount: {
      returns: "int32_t",
      args: [],
    },
    getDeallocatorCallback: {
      returns: "ptr",
      args: [],
    },
    getNoopDeallocatorCallback: {
      returns: "ptr",
      args: [],
    },
    getDeallocatorBuffer: {
      returns: "ptr",
      args: [],
    },
  };
}

function ffiRunner(fast) {
  describe("FFI runner" + (fast ? " (fast int)" : ""), () => {
    const types = getTypes(fast);
    const {
      symbols: {
        returns_true,
        returns_false,
        return_a_function_ptr_to_function_that_returns_true,
        returns_42_char,
        returns_42_float,
        returns_42_double,
        returns_42_uint8_t,
        returns_neg_42_int8_t,
        returns_42_uint16_t,
        returns_42_uint32_t,
        returns_42_uint64_t,
        returns_neg_42_int16_t,
        returns_neg_42_int32_t,
        returns_neg_42_int64_t,
        identity_char,
        identity_float,
        identity_bool,
        identity_double,
        identity_int8_t,
        identity_int16_t,
        identity_int32_t,
        identity_int64_t,
        identity_uint8_t,
        identity_uint16_t,
        identity_uint32_t,
        identity_uint64_t,
        add_char,
        add_float,
        add_double,
        add_int8_t,
        add_int16_t,
        add_int32_t,
        add_int64_t,
        add_uint8_t,
        add_uint16_t,
        identity_ptr,
        add_uint32_t,
        add_uint64_t,
        is_null,
        does_pointer_equal_42_as_int32_t,
        ptr_should_point_to_42_as_int32_t,
        getNoopDeallocatorCallback,
        cb_identity_true,
        cb_identity_false,
        cb_identity_42_char,
        cb_identity_42_float,
        cb_identity_42_double,
        cb_identity_42_uint8_t,
        cb_identity_neg_42_int8_t,
        cb_identity_42_uint16_t,
        cb_identity_42_uint32_t,
        cb_identity_42_uint64_t,
        cb_identity_neg_42_int16_t,
        cb_identity_neg_42_int32_t,
        cb_identity_neg_42_int64_t,
        getDeallocatorCalledCount,
        getDeallocatorCallback,
        getDeallocatorBuffer,
      },
      close,
    } = dlopen(FFI_FIXTURE_PATH, types);
    it("primitives", () => {
      Bun.gc(true);
      expect(returns_true()).toBe(true);
      Bun.gc(true);
      expect(returns_false()).toBe(false);

      expect(returns_42_char()).toBe(42);
      if (fast) expect(returns_42_uint64_t().valueOf()).toBe(42);
      else expect(returns_42_uint64_t().valueOf()).toBe(42n);
      Bun.gc(true);
      expect(Math.fround(returns_42_float())).toBe(Math.fround(42.41999804973602));
      expect(returns_42_double()).toBe(42.42);
      expect(returns_42_uint8_t()).toBe(42);
      expect(returns_neg_42_int8_t()).toBe(-42);
      expect(returns_42_uint16_t()).toBe(42);
      expect(returns_42_uint32_t()).toBe(42);
      if (fast) expect(returns_42_uint64_t()).toBe(42);
      else expect(returns_42_uint64_t()).toBe(42n);
      expect(returns_neg_42_int16_t()).toBe(-42);
      expect(returns_neg_42_int32_t()).toBe(-42);
      expect(identity_int32_t(10)).toBe(10);
      Bun.gc(true);
      if (fast) expect(returns_neg_42_int64_t()).toBe(-42);
      else expect(returns_neg_42_int64_t()).toBe(-42n);

      expect(identity_char(10)).toBe(10);

      expect(identity_float(10.199999809265137)).toBe(10.199999809265137);

      expect(identity_bool(true)).toBe(true);

      expect(identity_bool(false)).toBe(false);
      expect(identity_double(10.100000000000364)).toBe(10.100000000000364);

      expect(identity_int8_t(10)).toBe(10);
      expect(identity_int16_t(10)).toBe(10);

      if (fast) expect(identity_int64_t(10)).toBe(10);
      else expect(identity_int64_t(10)).toBe(10n);
      expect(identity_uint8_t(10)).toBe(10);
      expect(identity_uint16_t(10)).toBe(10);
      expect(identity_uint32_t(10)).toBe(10);
      if (fast) expect(identity_uint64_t(10)).toBe(10);
      else expect(identity_uint64_t(10)).toBe(10n);
      Bun.gc(true);
      var bigArray = new BigUint64Array(8);
      new Uint8Array(bigArray.buffer).fill(255);
      var bigIntArray = new BigInt64Array(bigArray.buffer);
      expect(identity_uint64_t(bigArray[0])).toBe(bigArray[0]);
      expect(identity_uint64_t(bigArray[0] - BigInt(1))).toBe(bigArray[0] - BigInt(1));
      if (fast) {
        expect(add_uint64_t(BigInt(-1) * bigArray[0], bigArray[0])).toBe(0);
        expect(add_uint64_t(BigInt(-1) * bigArray[0] + BigInt(10), bigArray[0])).toBe(10);
      } else {
        expect(add_uint64_t(BigInt(-1) * bigArray[0], bigArray[0])).toBe(0n);
        expect(add_uint64_t(BigInt(-1) * bigArray[0] + BigInt(10), bigArray[0])).toBe(10n);
      }
      if (fast) {
        expect(identity_uint64_t(0)).toBe(0);
        expect(identity_uint64_t(100)).toBe(100);
        expect(identity_uint64_t(BigInt(100))).toBe(100);

        expect(identity_int64_t(bigIntArray[0])).toBe(-1);
        expect(identity_int64_t(bigIntArray[0] - BigInt(1))).toBe(-2);
      } else {
        expect(identity_uint64_t(0)).toBe(0n);
        expect(identity_uint64_t(100)).toBe(100n);
        expect(identity_uint64_t(BigInt(100))).toBe(100n);

        expect(identity_int64_t(bigIntArray[0])).toBe(bigIntArray[0]);
        expect(identity_int64_t(bigIntArray[0] - BigInt(1))).toBe(bigIntArray[0] - BigInt(1));
      }
      Bun.gc(true);
      expect(add_char.native(1, 1)).toBe(2);

      expect(add_float(2.4, 2.8)).toBe(Math.fround(5.2));
      expect(add_double(4.2, 0.1)).toBe(4.3);
      expect(add_int8_t(1, 1)).toBe(2);
      expect(add_int16_t(1, 1)).toBe(2);
      expect(add_int32_t(1, 1)).toBe(2);
      if (fast) expect(add_int64_t(1, 1)).toBe(2);
      else expect(add_int64_t(1n, 1n)).toBe(2n);
      expect(add_uint8_t(1, 1)).toBe(2);
      expect(add_uint16_t(1, 1)).toBe(2);
      expect(add_uint32_t(1, 1)).toBe(2);
      Bun.gc(true);
      expect(is_null(null)).toBe(true);
      const cptr = ptr_should_point_to_42_as_int32_t();
      expect(cptr != 0).toBe(true);
      expect(typeof cptr === "number").toBe(true);
      expect(does_pointer_equal_42_as_int32_t(cptr)).toBe(true);
      // `cptr` points at STATIC C data (see the fixture: never heap-allocated, never freed).
      // toBuffer()/toArrayBuffer() ALWAYS install a deallocator -- mimalloc's mi_free by default,
      // which must never receive non-mimalloc memory (that is oven-sh/bun#35405, previously papered
      // over by pinning the view to process exit, which just moved the bogus mi_free to teardown).
      // So the views get the fixture's no-op deallocator. That callback is a raw code address into
      // this dlopen'd library, so the views are scoped and collected NOW, while it is loaded --
      // a fixture-address finalizer must never outlive its handle.
      const noopDeallocator = getNoopDeallocatorCallback();
      {
        const buffer = toBuffer(cptr, 0, 4, noopDeallocator);
        expect(buffer.readInt32(0)).toBe(42);
        expect(new DataView(toArrayBuffer(cptr, 0, 4, noopDeallocator), 0, 4).getInt32(0, true)).toBe(42);
        expect(ptr(buffer)).toBe(cptr);
      }
      Bun.gc(true); // collect the no-op-deallocator views while the library is still loaded
      expect(new CString(cptr, 0, 1).toString()).toBe("*");
      expect(identity_ptr(cptr)).toBe(cptr);
      const second_ptr = ptr(new Buffer(8));
      expect(identity_ptr(second_ptr)).toBe(second_ptr);
      expect(new CString(ptr(Buffer.from([97, 97, 97, 0, 97, 98, 99, 0, 0])), 4).toString()).toBe("abc");
      expect(new CString(ptr(Buffer.from([97, 97, 97, 0, 97, 98, 99, 0, 0])), 4, 2).toString()).toBe("ab");
    });

    it("CFunction", () => {
      var myCFunction = new CFunction({
        ptr: return_a_function_ptr_to_function_that_returns_true(),
        returns: "bool",
      });
      expect(myCFunction()).toBe(true);
    });

    const typeMap = {
      int8_t: -8,
      int16_t: -16,
      int32_t: -32,
      int64_t: -64n,
      uint8_t: 8,
      uint16_t: 16,
      uint32_t: 32,
      uint64_t: 64n,
      float: 32.5,
      double: 64.5,
      ptr: 0xdeadbeef,
      "void*": null,
    };

    it("JSCallback", () => {
      var toClose = new JSCallback(
        input => {
          return input;
        },
        {
          returns: "bool",
          args: ["bool"],
        },
      );
      expect(toClose.ptr > 0).toBe(true);
      toClose.close();
      expect(toClose.ptr === null).toBe(true);
    });

    describe("callbacks", () => {
      // Return types, 1 argument
      for (let [returnName, returnValue] of Object.entries(typeMap)) {
        it("fn(" + returnName + ") " + returnName, () => {
          var roundtripFunction = new CFunction({
            ptr: new JSCallback(
              input => {
                return input;
              },
              {
                returns: returnName,
                args: [returnName],
              },
            ).ptr,
            returns: returnName,
            args: [returnName],
          });
          expect(roundtripFunction(returnValue)).toBe(returnValue);
        });
      }
      // Return types, no args
      for (let [name, value] of Object.entries(typeMap)) {
        it("fn() " + name, () => {
          var roundtripFunction = new CFunction({
            ptr: new JSCallback(() => value, {
              returns: name,
            }).ptr,
            returns: name,
          });
          expect(roundtripFunction()).toBe(value);
        });
      }
    });

    describe("threadsafe callback", done => {
      // 1 arg, threadsafe
      for (let [name, value] of Object.entries(typeMap)) {
        // i64/u64 delivery is now correct: the engine copies the raw C argument slots on the
        // foreign thread and converts them to BigInt on the JS thread (previously the deferred
        // task's BigInt argument wasn't GC-rooted -- oven-sh/bun#35406, fixed by this change).
        it("fn(" + name + ") " + name, async () => {
          const cb = new JSCallback(
            arg1 => {
              expect(arg1).toBe(value);
            },
            {
              args: [name],
              threadsafe: true,
            },
          );
          var roundtripFunction = new CFunction({
            ptr: cb.ptr,
            returns: "void",
            args: [name],
          });
          roundtripFunction(value);
          await 1;
        });
      }
    });

    describe("integer identities work for all possible values", () => {
      const cases = [
        { type: "int8_t", min: -128, max: 127, fn: identity_int8_t },
        { type: "int16_t", min: -32768, max: 32767, fn: identity_int16_t },
        { type: "int32_t", min: -2147483648, max: 2147483647, fn: identity_int32_t },
        { type: "int64_t", min: -9223372036854775808n, max: 9223372036854775807n, fn: identity_int64_t },
        { type: "uint8_t", min: 0, max: 255, fn: identity_uint8_t },
        { type: "uint16_t", min: 0, max: 65535, fn: identity_uint16_t },
        { type: "uint32_t", min: 0, max: 4294967295, fn: identity_uint32_t },
        { type: "uint64_t", min: 0n, max: 18446744073709551615n, fn: identity_uint64_t },
      ];

      for (const { type, min, max, fn } of cases) {
        const bigint = typeof min === "bigint";
        const inc = bigint
          ? //
            (max - min) / 32768n
          : Math.ceil((max - min) / 32768);
        it(type, () => {
          expect(bigint ? BigInt(fn(min)) : fn(min)).toBe(min);
          expect(bigint ? BigInt(fn(max)) : fn(max)).toBe(max);
          expect(bigint ? BigInt(fn(0n)) : fn(0)).toBe(bigint ? 0n : 0);

          for (let i = min; i <= max; i += inc) {
            expect(bigint ? BigInt(fn(i)) : fn(i)).toBe(i);
          }
        });
      }
    });

    afterAll(() => {
      close();
    });
  });
}

it("read", () => {
  // The usage of globalThis is a GC thing we should really fix
  globalThis.buffer = new BigInt64Array(16);
  const dataView = new DataView(buffer.buffer);
  const addr = ptr(buffer);

  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = BigInt(i);
    expect(read.intptr(addr, i * 8)).toBe(Number(dataView.getBigInt64(i * 8, true)));
    expect(read.ptr(addr, i * 8)).toBe(Number(dataView.getBigUint64(i * 8, true)));
    expect(read.f64(addr, i + 8)).toBe(dataView.getFloat64(i + 8, true));
    expect(read.i64(addr, i * 8)).toBe(dataView.getBigInt64(i * 8, true));
    expect(read.u64(addr, i * 8)).toBe(dataView.getBigUint64(i * 8, true));
  }

  for (let i = 0; i < buffer.byteLength - 4; i++) {
    // read is intended to behave like DataView
    // but instead of doing
    //    new DataView(toArrayBuffer(myPtr)).getInt8(0, true)
    // you can do
    //    read.i8(myPtr, 0)
    expect(read.i8(addr, i)).toBe(dataView.getInt8(i, true));
    expect(read.i16(addr, i)).toBe(dataView.getInt16(i, true));
    expect(read.i32(addr, i)).toBe(dataView.getInt32(i, true));
    expect(read.u8(addr, i)).toBe(dataView.getUint8(i, true));
    expect(read.u16(addr, i)).toBe(dataView.getUint16(i, true));
    expect(read.u32(addr, i)).toBe(dataView.getUint32(i, true));
    expect(read.f32(addr, i)).toBe(dataView.getFloat32(i, true));
  }

  delete globalThis.buffer;
});

// describe.skipIf still evaluates its callback to enumerate tests, and ffiRunner() dlopens the
// fixture at collection time -- so guard the BODY (not just the runner) for a compiler-less host.
describe.skipIf(!FFI_FIXTURE_PATH)("run ffi", () => {
  if (!FFI_FIXTURE_PATH) return;
  ffiRunner(false);
  ffiRunner(true);
});

it("dlopen throws an error instead of returning it", () => {
  let err;
  try {
    dlopen("nonexistent", { x: {} });
  } catch (error) {
    err = error;
  }
  expect(err).toBeTruthy();
});

// Windows: dlopen must accept paths with non-ASCII characters. Previously the
// path was handed to LoadLibraryA as UTF-8, which the OS decodes as the system
// ANSI codepage, so any non-ASCII byte mangled the path.
it.skipIf(!isWindows)("dlopen accepts non-ASCII library paths on Windows", async () => {
  const fixture = `
    const { dlopen, FFIType } = require("bun:ffi");
    const { mkdirSync, copyFileSync } = require("node:fs");
    const { join } = require("node:path");

    const src = join(process.env.SystemRoot || "C:\\\\Windows", "System32", "version.dll");
    const results = {};
    for (const name of ["caf\\u00e9", "\\u65e5\\u672c\\u8a9e"]) {
      const dir = join(process.env.FIXTURE_DIR, "bun-ffi-" + name);
      mkdirSync(dir, { recursive: true });
      const dll = join(dir, "version.dll");
      copyFileSync(src, dll);
      const lib = dlopen(dll, {
        GetFileVersionInfoSizeW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.u32 },
      });
      results[name] = typeof lib.symbols.GetFileVersionInfoSizeW;
      lib.close();
    }
    console.log(JSON.stringify(results));
  `;
  using dir = tempDir("ffi-dlopen-unicode", {});
  await using proc = Bun.spawn({
    cmd: [bunExe(), "-e", fixture],
    env: { ...bunEnv, FIXTURE_DIR: String(dir) },
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  const results = stdout.startsWith("{") ? JSON.parse(stdout) : stdout;
  expect({ results, stderr, exitCode }).toMatchObject({
    results: { "caf\u00e9": "function", "\u65e5\u672c\u8a9e": "function" },
    exitCode: 0,
  });
});

it('suffix does not start with a "."', () => {
  expect(suffix).not.toMatch(/^\./);
});

it(".ptr is not leaked", () => {
  for (let fn of [Bun.password.hash, Bun.password.verify, it]) {
    expect(fn).not.toHaveProperty("ptr");
    expect(fn.ptr).toBeUndefined();
  }
});

// CString is a native class: a String object whose ptr / byteOffset / byteLength / arrayBuffer
// are prototype accessors backed by the cell (no per-instance own properties). These pin down that
// it stays string-like and API-compatible with the old `class CString extends String`.
describe("CString", () => {
  const hello = Buffer.from("Hello, world!\0", "utf8");
  // A bun:ffi pointer does not root the memory it points at, and `hello` is otherwise reached only
  // through `helloPtr` (a plain number). Keep the Buffer strongly reachable for the whole run so a
  // GC between tests cannot free it out from under the CString reads below.
  // (JS-allocated, mimalloc-owned Buffer: pinning it is a plain liveness guard so a GC between
  // tests cannot free it out from under the raw `helloPtr` reads below.)
  (globalThis.__ffiTestPinnedBuffers ??= []).push(hello);
  const helloPtr = ptr(hello);

  it("is string-like", () => {
    const cs = new CString(helloPtr);
    expect(String(cs)).toBe("Hello, world!");
    expect(cs.toString()).toBe("Hello, world!");
    expect(cs.valueOf()).toBe("Hello, world!");
    expect(cs.length).toBe(13);
    expect(cs[0]).toBe("H");
    expect(cs + "").toBe("Hello, world!");
    expect(cs + "!").toBe("Hello, world!!");
    expect(`${cs}?`).toBe("Hello, world!?");
    // eslint-disable-next-line eqeqeq
    expect(cs == "Hello, world!").toBe(true);
    expect(cs === "Hello, world!").toBe(false);
    expect(cs.slice(7)).toBe("world!");
    expect(cs.toUpperCase()).toBe("HELLO, WORLD!");
    expect(JSON.stringify(cs)).toBe('"Hello, world!"');
    expect(Object.prototype.toString.call(cs)).toBe("[object String]");
    expect(typeof cs).toBe("object");
  });

  it("is an instance of CString and of String", () => {
    const cs = new CString(helloPtr);
    expect(cs).toBeInstanceOf(CString);
    expect(cs).toBeInstanceOf(String);
    expect(cs.constructor).toBe(CString);
    expect(Object.getPrototypeOf(cs)).toBe(CString.prototype);
    expect(Object.getPrototypeOf(CString.prototype)).toBe(String.prototype);
    expect(Object.getPrototypeOf(CString)).toBe(String);
    expect(CString.name).toBe("CString");
  });

  it("exposes ptr, byteOffset, byteLength through prototype accessors", () => {
    const cs = new CString(helloPtr, 7, 5);
    expect(String(cs)).toBe("world");
    expect(cs.ptr).toBe(helloPtr);
    expect(cs.byteOffset).toBe(7);
    expect(cs.byteLength).toBe(5);

    // Not own properties any more: the values live in the cell, the accessors on the prototype.
    expect(Object.prototype.hasOwnProperty.call(cs, "ptr")).toBe(false);
    for (const key of ["ptr", "byteOffset", "byteLength", "arrayBuffer"]) {
      expect(Object.getOwnPropertyDescriptor(CString.prototype, key)?.get).toBeFunction();
    }
    expect("ptr" in cs).toBe(true);

    const bare = new CString(helloPtr);
    expect(bare.byteOffset).toBeUndefined();
    expect(bare.byteLength).toBeUndefined();

    // Still writable, like the old own data properties.
    const writable = new CString(helloPtr);
    writable.byteLength = 5;
    expect(writable.byteLength).toBe(5);
  });

  it("arrayBuffer views the source memory and is cached", () => {
    const cs = new CString(helloPtr, 0, 5);
    expect(String(cs)).toBe("Hello");
    expect(cs.arrayBuffer.byteLength).toBe(5);
    expect(new TextDecoder().decode(cs.arrayBuffer)).toBe("Hello");
    expect(cs.arrayBuffer).toBe(cs.arrayBuffer);
    expect(new CString(0).arrayBuffer.byteLength).toBe(0);
  });

  it("a falsy pointer yields an empty string with ptr 0", () => {
    for (const value of [0, null, undefined]) {
      const cs = new CString(value);
      expect(String(cs)).toBe("");
      expect(cs.ptr).toBe(0);
      expect(cs.length).toBe(0);
    }
  });

  it("Bun.FFI.CString is the same constructor, callable with and without new", () => {
    expect(Bun.FFI.CString).toBe(CString);
    expect(String(new Bun.FFI.CString(helloPtr, 0, 5))).toBe("Hello");
    expect(Bun.FFI.CString(helloPtr, 0, 5)).toBe("Hello");
  });

  it("can be subclassed", () => {
    class MyCString extends CString {
      shout() {
        return `${this}!`.toUpperCase();
      }
    }
    const cs = new MyCString(helloPtr);
    expect(cs).toBeInstanceOf(MyCString);
    expect(cs).toBeInstanceOf(CString);
    expect(cs.shout()).toBe("HELLO, WORLD!!");
    expect(cs.ptr).toBe(helloPtr);
  });
});

describe("CFunction", () => {
  it("returns the engine-native callable with a working .close()", () => {
    const callback = new JSCallback(() => 42, { returns: "int32_t", args: [] });
    try {
      const fn = new CFunction({ ptr: callback.ptr, returns: "int32_t", args: [] });
      expect(typeof fn).toBe("function");
      expect(fn()).toBe(42);
      expect(fn()).toBe(42);
      expect(fn.close).toBeFunction();
      expect(fn.close()).toBeUndefined();
      // Idempotent: closing an already-closed CFunction is a no-op.
      expect(fn.close()).toBeUndefined();
    } finally {
      callback.close();
    }
  });

  it("passes arguments and marshals the return value", () => {
    const add = new JSCallback((a, b) => a + b, { returns: "int32_t", args: ["int32_t", "int32_t"] });
    try {
      const fn = new CFunction({ ptr: add.ptr, returns: "int32_t", args: ["int32_t", "int32_t"] });
      expect(fn(40, 2)).toBe(42);
      expect(fn(-1, 1)).toBe(0);
      fn.close();
    } finally {
      add.close();
    }
  });

  it("reports a missing ptr the same way linkSymbols() does", () => {
    expect(() => new CFunction({ returns: "int32_t", args: [] })).toThrow(/CFunction.*ptr.*(linkSymbols|CFunction)/);
  });
});

// Runs in a subprocess: `bun test`'s exit path does not finalize the CFunction's native handle,
// which the ASan lane's leak checker then reports against this file.
it("JSCallback exceptions propagate out of the native call", async () => {
  await using proc = Bun.spawn({
    cmd: [
      bunExe(),
      "-e",
      `import { CFunction, JSCallback } from "bun:ffi";
      const callback = new JSCallback(
        () => {
          throw new Error("boom");
        },
        { returns: "int32_t", args: [] },
      );
      const call = new CFunction({ ptr: callback.ptr, returns: "int32_t", args: [] });
      try {
        call();
        console.log("did not throw");
      } catch (e) {
        console.log("caught", e.message);
      }
      call.close();
      callback.close();`,
    ],
    env: bunEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  expect({ stdout, stderr, exitCode }).toEqual({
    stdout: "caught boom\n",
    stderr: "",
    exitCode: 0,
  });
});

// worker.terminate() delivered inside a threadsafe JSCallback used to trip
// "ASSERTION FAILED: !isTerminationException(exception) || hasTerminationRequest()"
// in JSC::VM::setException on the worker thread and re-enter the terminated VM.
it("JSCallback tolerates worker.terminate() arriving inside the callback", async () => {
  using dir = tempDir("ffi-jscallback-terminate", {
    "main.js": `
      import { join } from "node:path";
      import { Worker } from "node:worker_threads";

      const sab = new SharedArrayBuffer(4);
      const flag = new Int32Array(sab);

      const worker = new Worker(join(import.meta.dir, "worker.js"), { workerData: sab });
      let terminating = false;
      worker.on("error", err => {
        console.error("worker error:", err);
        process.exit(1);
      });
      worker.on("exit", code => {
        if (!terminating) {
          console.error("worker exited early:", code);
          process.exit(1);
        }
      });

      // Wait until the worker thread is inside the native -> JS callback frame.
      await Atomics.waitAsync(flag, 0, 0).value;

      terminating = true;
      await worker.terminate();
      console.log("done");
    `,
    "worker.js": `
      import { CFunction, JSCallback } from "bun:ffi";
      import { workerData } from "node:worker_threads";

      const flag = new Int32Array(workerData);

      const callback = new JSCallback(
        () => {
          // Tell the parent we are inside the native -> JS callback frame, then
          // spin until worker.terminate() delivers the TerminationException.
          Atomics.store(flag, 0, 1);
          Atomics.notify(flag, 0);
          while (true) {}
        },
        { returns: "void", args: [], threadsafe: true },
      );

      // CFunction makes the callback's native function pointer callable from JS. A threadsafe
      // JSCallback enqueues a task instead of running synchronously, so the callback runs at
      // the top of the worker's event loop once this module finishes evaluating.
      const fire = new CFunction({ ptr: callback.ptr, returns: "void", args: [] });
      fire();

      // Keep the worker alive until the queued callback task runs.
      setInterval(() => {}, 1000);
    `,
  });

  await using proc = Bun.spawn({
    cmd: [bunExe(), "main.js"],
    env: bunEnv,
    cwd: String(dir),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  expect({ stdout, stderr, exitCode, signalCode: proc.signalCode }).toEqual({
    stdout: "done\n",
    stderr: "",
    exitCode: 0,
    signalCode: null,
  });
});

const libPath =
  platform() === "darwin"
    ? "/usr/lib/libSystem.B.dylib"
    : existsSync("/lib/x86_64-linux-gnu/libc.so.6") && isGlibcVersionAtLeast("2.36.0")
      ? "/lib/x86_64-linux-gnu/libc.so.6"
      : null;

const libSymbols = {
  memchr: {
    returns: "ptr",
    args: ["ptr", "int", "usize"],
  },
  strcpy: {
    returns: "ptr",
    args: ["ptr", "ptr"],
  },
  strcat: {
    returns: "ptr",
    args: ["ptr", "ptr"],
  },
  strncat: {
    returns: "ptr",
    args: ["ptr", "ptr", "usize"],
  },
  strcmp: {
    returns: "int",
    args: ["ptr", "ptr"],
  },
  strncmp: {
    returns: "int",
    args: ["ptr", "ptr", "usize"],
  },
  strcoll: {
    returns: "int",
    args: ["ptr", "ptr"],
  },
  strxfrm: {
    returns: "int",
    args: ["ptr", "ptr", "usize"],
  },
  strchr: {
    returns: "ptr",
    args: ["ptr", "int"],
  },
  strrchr: {
    returns: "ptr",
    args: ["ptr", "int"],
  },
  strcspn: {
    returns: "usize",
    args: ["ptr", "ptr"],
  },
  strspn: {
    returns: "usize",
    args: ["ptr", "ptr"],
  },
  strpbrk: {
    returns: "ptr",
    args: ["ptr", "ptr"],
  },
  strstr: {
    returns: "ptr",
    args: ["ptr", "ptr"],
  },
  strtok: {
    returns: "ptr",
    args: ["ptr", "ptr"],
  },
  strerror: {
    returns: "ptr",
    args: ["int"],
  },
  strerror_r: {
    returns: "ptr",
    args: ["int", "ptr", "usize"],
  },
  strsep: {
    returns: "ptr",
    args: ["ptr", "ptr"],
  },
  strsignal: {
    returns: "ptr",
    args: ["int"],
  },
  stpcpy: {
    returns: "ptr",
    args: ["ptr", "ptr"],
  },
  stpncpy: {
    returns: "ptr",
    args: ["ptr", "ptr", "usize"],
  },
  basename: {
    returns: "ptr",
    args: ["ptr"],
  },
  bcmp: {
    returns: "int",
    args: ["ptr", "ptr", "usize"],
  },
  getdate: {
    returns: "ptr",
    args: ["ptr"],
  },
  gmtime: {
    returns: "ptr",
    args: ["ptr"],
  },
  localtime: {
    returns: "ptr",
    args: ["ptr"],
  },
  ctime: {
    returns: "ptr",
    args: ["ptr"],
  },
  asctime: {
    returns: "ptr",
    args: ["ptr"],
  },
  strftime: {
    returns: "usize",
    args: ["ptr", "usize", "ptr", "ptr"],
  },
  strptime: {
    returns: "ptr",
    args: ["ptr", "ptr", "ptr"],
  },
  asctime_r: {
    returns: "ptr",
    args: ["ptr", "ptr"],
  },
  ctime_r: {
    returns: "ptr",
    args: ["ptr", "ptr"],
  },
  gmtime_r: {
    returns: "ptr",
    args: ["ptr", "ptr"],
  },
  localtime_r: {
    returns: "ptr",
    args: ["ptr", "ptr"],
  },
  bcopy: {
    returns: "int",
    args: ["ptr", "ptr", "usize"],
  },
  bzero: {
    returns: "void",
    args: ["ptr", "usize"],
  },
  index: {
    returns: "ptr",
    args: ["ptr", "int"],
  },
  rindex: {
    returns: "ptr",
    args: ["ptr", "int"],
  },
  ffs: {
    returns: "int",
    args: ["int"],
  },
  strcasecmp: {
    returns: "int",
    args: ["ptr", "ptr"],
  },
  strncasecmp: {
    returns: "int",
    args: ["ptr", "ptr", "usize"],
  },
  pthread_attr_init: {
    returns: "int",
    args: ["ptr"],
  },
  pthread_attr_destroy: {
    returns: "int",
    args: ["ptr"],
  },
  pthread_attr_getdetachstate: {
    returns: "int",
    args: ["ptr", "ptr"],
  },
  pthread_attr_setdetachstate: {
    returns: "int",
    args: ["ptr", "int"],
  },
  pthread_attr_getguardsize: {
    returns: "int",
    args: ["ptr", "ptr"],
  },
  pthread_attr_setguardsize: {
    returns: "int",
    args: ["ptr", "usize"],
  },
  pthread_attr_getschedparam: {
    returns: "int",
    args: ["ptr", "ptr"],
  },
  pthread_attr_setschedparam: {
    returns: "int",
    args: ["ptr", "ptr"],
  },
  pthread_attr_getschedpolicy: {
    returns: "int",
    args: ["ptr", "ptr"],
  },
  pthread_attr_setschedpolicy: {
    returns: "int",
    args: ["ptr", "int"],
  },
  pthread_attr_getinheritsched: {
    returns: "int",
    args: ["ptr", "ptr"],
  },
  pthread_attr_setinheritsched: {
    returns: "int",
    args: ["ptr", "int"],
  },
  pthread_attr_getscope: {
    returns: "int",
    args: ["ptr", "ptr"],
  },
  pthread_attr_setscope: {
    returns: "int",
    args: ["ptr", "int"],
  },
  pthread_attr_getstackaddr: {
    returns: "int",
    args: ["ptr", "ptr"],
  },
  pthread_attr_setstackaddr: {
    returns: "int",
    args: ["ptr", "ptr"],
  },
  pthread_attr_getstacksize: {
    returns: "int",
    args: ["ptr", "ptr"],
  },
  pthread_attr_setstacksize: {
    returns: "int",
    args: ["ptr", "usize"],
  },
  pthread_attr_getstack: {
    returns: "int",
    args: ["ptr", "ptr", "ptr"],
  },
  pthread_attr_setstack: {
    returns: "int",
    args: ["ptr", "ptr", "usize"],
  },
  login_tty: {
    returns: "int",
    args: ["int"],
  },
  login: {
    returns: "int",
    args: ["ptr"],
  },
  logout: {
    returns: "int",
    args: ["ptr"],
  },
  strlen: {
    returns: "usize",
    args: ["ptr"],
  },
};

describe.if(!!libPath)("can open more than 63 symbols via", () => {
  for (const [description, libFn] of [
    // For file: URLs since one might do import.meta.resolve()
    ["URL", () => Bun.pathToFileURL(libPath)],

    // file: URLs as a string
    ["file: URL", () => Bun.pathToFileURL(libPath).href],

    // For embedding files since one might do Bun.file(embeddedFile)
    ["Bun.file", () => Bun.file(libPath)],

    // For file path strings
    ["string", () => libPath],
  ]) {
    it(description, () => {
      const libPath = libFn();
      const lib = dlopen(libPath, libSymbols);
      expect(Object.keys(lib.symbols).length).toBe(Object.keys(libSymbols).length);
      expect(lib.symbols.strcasecmp(Buffer.from("ciro\0"), Buffer.from("CIRO\0"))).toBe(0);
      expect(lib.symbols.strlen(Buffer.from("bunbun\0", "ascii"))).toBe(6n);
    });
  }
});

// ── Regression coverage for the engine-native FFI (the single implementation behind
// dlopen/linkSymbols/CFunction/JSCallback). Merged from the standalone file per CLAUDE.md.
describe.skipIf(!FFI_FIXTURE_PATH)("engine-native FFI (single implementation)", () => {
  const lib = FFI_FIXTURE_PATH;
  // linkSymbols() is one of the four engine-native entry points (dlopen / linkSymbols / CFunction
  // / JSCallback all route to the same JSFFIFunction machinery). CFunction() used to reach
  // FFI::link_symbols transitively; that indirection is gone, so cover its happy path directly:
  // take the raw addresses of dlopen'd symbols and re-bind them through linkSymbols.
  it("linkSymbols() binds and calls symbols from raw pointers", () => {
    const {
      symbols: { returns_true, add_int32_t, identity_ptr },
    } = dlopen(lib, {
      returns_true: { args: [], returns: "bool" },
      add_int32_t: { args: ["i32", "i32"], returns: "i32" },
      identity_ptr: { args: ["ptr"], returns: "ptr" },
    });
    const linked = linkSymbols({
      isTrue: { ptr: returns_true.ptr, args: [], returns: "bool" },
      sum: { ptr: add_int32_t.ptr, args: ["i32", "i32"], returns: "i32" },
      echoPtr: { ptr: identity_ptr.ptr, args: ["ptr"], returns: "ptr" },
    });
    expect(linked.symbols.isTrue()).toBe(true);
    expect(linked.symbols.sum(40, 2)).toBe(42);
    expect(linked.symbols.sum(-1, -2)).toBe(-3);
    expect(linked.symbols.echoPtr(1234)).toBe(1234);
    // The bound functions carry the same intrinsic surface as dlopen'd ones.
    expect(typeof linked.symbols.sum.ptr).toBe("number");
    linked.close();
  });

  it("u32 arguments >= 2^31 are not sign-flipped (#7007)", () => {
    const {
      symbols: { identity_uint32_t },
    } = dlopen(lib, { identity_uint32_t: { args: ["u32"], returns: "u32" } });
    expect(identity_uint32_t(2 ** 31)).toBe(2 ** 31);
    expect(identity_uint32_t(2 ** 32 - 1)).toBe(2 ** 32 - 1);
    expect(identity_uint32_t(0)).toBe(0);
  });

  it("integer parameters WRAP to width instead of clamping", () => {
    const {
      symbols: { identity_uint8_t },
    } = dlopen(lib, { identity_uint8_t: { args: ["u8"], returns: "u8" } });
    expect(identity_uint8_t(256)).toBe(0);
    expect(identity_uint8_t(257)).toBe(1);
    expect(identity_uint8_t(-1)).toBe(255);
  });

  it("pointers above 2^53 round-trip as exact BigInt (#28068) and BigInt addresses are accepted (#22751)", () => {
    const {
      symbols: { identity_ptr },
    } = dlopen(lib, { identity_ptr: { args: ["ptr"], returns: "ptr" } });
    const big = (1n << 60n) + 7n; // not representable as an exact double
    const round = identity_ptr(big);
    expect(typeof round).toBe("bigint");
    expect(round).toBe(big);
    // small addresses stay numbers
    expect(identity_ptr(1024)).toBe(1024);
    // a null pointer is null
    expect(identity_ptr(null)).toBe(null);
  });

  it("numeric strings for numeric parameters throw (intentional behavior change)", () => {
    const {
      symbols: { identity_int32_t },
    } = dlopen(lib, { identity_int32_t: { args: ["i32"], returns: "i32" } });
    expect(() => identity_int32_t("42")).toThrow();
    expect(identity_int32_t(42)).toBe(42);
  });

  // (JS-string -> cstring parameter conversion is covered in the engine's own stress tests;
  //  ffi-test.c has no cstring-taking fixture, so it is not duplicated here.)

  it("dlopen symbols expose intrinsic .ptr (a real address) and .native", () => {
    const {
      symbols: { returns_true },
    } = dlopen(lib, { returns_true: { args: [], returns: "bool" } });
    expect(typeof returns_true.ptr).toBe("number");
    expect(returns_true.ptr).toBeGreaterThan(0);
    expect(returns_true.native).toBe(returns_true);
    expect(returns_true()).toBe(true);
  });

  it("CFunction returns the engine cell itself with a callable close()", () => {
    const {
      symbols: { returns_42_char },
    } = dlopen(lib, { returns_42_char: { args: [], returns: "char" } });
    const fn = new CFunction({ ptr: returns_42_char.ptr, args: [], returns: "char" });
    expect(fn()).toBe(42);
    expect(typeof fn.close).toBe("function");
    fn.close(); // no-op on the engine path, must not throw
    expect(fn()).toBe(42);
  });

  it("passing a JSCallback OBJECT (not .ptr) as a function-typed argument works", () => {
    const {
      symbols: { cb_identity_42_double },
    } = dlopen(lib, { cb_identity_42_double: { args: ["callback"], returns: "double" } });
    const cb = new JSCallback(() => 42.42, { returns: "double", args: [] });
    try {
      expect(cb_identity_42_double(cb.ptr)).toBe(42.42);
      // the documented object form:
      expect(cb_identity_42_double(cb)).toBe(42.42);
    } finally {
      cb.close();
    }
  });

  it("a JSCallback instance is the engine cell (instanceof + own ptr) and close() is idempotent", () => {
    const cb = new JSCallback(a => a * 2, { args: ["i32"], returns: "i32" });
    expect(cb instanceof JSCallback).toBe(true);
    expect(typeof cb.ptr).toBe("number");
    expect(cb.threadsafe).toBe(false);
    cb.close();
    cb.close(); // idempotent
  });

  it("an omitted callback argument throws instead of calling through NULL", () => {
    const {
      symbols: { cb_identity_true },
    } = dlopen(lib, { cb_identity_true: { args: ["callback"], returns: "bool" } });
    // undefined for a function-typed parameter must be a TypeError, not a segfault
    expect(() => cb_identity_true(undefined)).toThrow(TypeError);
  });

  it("napi_env / napi_value are rejected outside cc()", () => {
    // `returns_true` is a real fixture symbol so the failure is the napi rejection itself, not
    // "symbol not found".
    expect(() => dlopen(lib, { returns_true: { args: ["napi_env"], returns: "napi_value" } })).toThrow(
      /napi_env \/ napi_value are only supported in bun:ffi cc\(\)/,
    );
    expect(() => new CFunction({ ptr: 1, args: ["napi_env"], returns: "void" })).toThrow(
      /napi_env \/ napi_value are only supported in bun:ffi cc\(\)/,
    );
    expect(() => new JSCallback(() => {}, { args: ["napi_env"], returns: "void" })).toThrow(
      /napi_env \/ napi_value are only supported in bun:ffi cc\(\)/,
    );
  });

  it("a hot polymorphic call site stays correct across tiers (CallFFI)", () => {
    const {
      symbols: { identity_int32_t },
    } = dlopen(lib, { identity_int32_t: { args: ["i32"], returns: "i32" } });
    const wrappers = [() => identity_int32_t(7), () => identity_int32_t(9)];
    let sum = 0;
    for (let i = 0; i < 400000; ++i) sum += wrappers[i & 1]();
    expect(sum).toBe(200000 * 7 + 200000 * 9);
  });
});

// ── ABI conformance (external, black-box): a fixture compiled at test time whose functions
// return POSITION-WEIGHTED combinations of their arguments, so any calling-convention error
// (register vs stack, stack stride/packing, sign/zero-extension, positional-vs-separate int/float
// register counting) changes the observable result. Runs on every CI platform.
describe.skipIf(!ABI_FIXTURE_PATH)("ABI conformance", () => {
  if (!ABI_FIXTURE_PATH) return;
  const w = (vals, big = false) =>
    big ? vals.reduce((s, v, i) => s + BigInt(v) * BigInt(i + 1), 0n) : vals.reduce((s, v, i) => s + v * (i + 1), 0);

  it("integer widths and signedness at their boundaries", () => {
    const { symbols: s } = dlopen(ABI_FIXTURE_PATH, {
      abi_i8: { args: ["i8"], returns: "i8" },
      abi_u8: { args: ["u8"], returns: "u8" },
      abi_i16: { args: ["i16"], returns: "i16" },
      abi_u16: { args: ["u16"], returns: "u16" },
      abi_i32: { args: ["i32"], returns: "i32" },
      abi_u32: { args: ["u32"], returns: "u32" },
      abi_i64: { args: ["i64"], returns: "i64" },
      abi_u64: { args: ["u64"], returns: "u64" },
      abi_bool: { args: ["bool"], returns: "bool" },
      abi_char: { args: ["char"], returns: "char" },
    });
    for (const v of [-128, -1, 0, 1, 127]) expect(s.abi_i8(v)).toBe(v);
    for (const v of [0, 1, 127, 128, 255]) expect(s.abi_u8(v)).toBe(v);
    for (const v of [-32768, -1, 0, 32767]) expect(s.abi_i16(v)).toBe(v);
    for (const v of [0, 32767, 32768, 65535]) expect(s.abi_u16(v)).toBe(v);
    for (const v of [-2147483648, -1, 0, 2147483647]) expect(s.abi_i32(v)).toBe(v);
    for (const v of [0, 2147483647, 2147483648, 4294967295]) expect(s.abi_u32(v)).toBe(v); // #7007: >= 2^31 must not sign-flip
    for (const v of [-(2n ** 63n), -1n, 0n, 2n ** 63n - 1n]) expect(s.abi_i64(v)).toBe(v);
    for (const v of [0n, 2n ** 63n, 2n ** 64n - 1n]) expect(s.abi_u64(v)).toBe(v);
    expect(s.abi_bool(true)).toBe(false);
    expect(s.abi_bool(false)).toBe(true);
    for (const v of [0, 65, 127]) expect(s.abi_char(v)).toBe(v);
  });

  it("i32 args past the register count (stack spill, all ABIs)", () => {
    const {
      symbols: { abi_sum_i32_x10 },
    } = dlopen(ABI_FIXTURE_PATH, { abi_sum_i32_x10: { args: Array(10).fill("i32"), returns: "i64" } });
    const cases = [
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [-1, -2, -3, -4, -5, -6, -7, -8, -9, -10],
      [2147483647, -2147483648, 0, 1, -1, 7, 7, 7, 7, 7],
      [100000, 4, 5, -1, 6, 8, 1, 2, 2, 3],
    ];
    for (const a of cases) expect(abi_sum_i32_x10(...a)).toBe(w(a, true));
  });

  it("i64 args past the register count", () => {
    const {
      symbols: { abi_sum_i64_x10 },
    } = dlopen(ABI_FIXTURE_PATH, { abi_sum_i64_x10: { args: Array(10).fill("i64"), returns: "i64" } });
    const a = [1n, -2n, 3n, 2n ** 40n, -(2n ** 40n), 5n, 6n, -7n, 8n, 9n];
    expect(abi_sum_i64_x10(...a)).toBe(w(a, true));
  });

  it("f64 args past the FP register count", () => {
    const {
      symbols: { abi_sum_f64_x10 },
    } = dlopen(ABI_FIXTURE_PATH, { abi_sum_f64_x10: { args: Array(10).fill("f64"), returns: "f64" } });
    const a = [0.5, 1.25, -2.5, 3.125, 4, -5.5, 6.75, 7, 8.5, -9.25];
    expect(abi_sum_f64_x10(...a)).toBeCloseTo(w(a), 9);
  });

  it("f32 args past the FP register count (single-precision handling)", () => {
    const {
      symbols: { abi_sum_f32_x10 },
    } = dlopen(ABI_FIXTURE_PATH, { abi_sum_f32_x10: { args: Array(10).fill("f32"), returns: "f64" } });
    const a = [0.5, 1.25, -2.5, 3.125, 4, -5.5, 6.75, 7, 8.5, -9.25]; // all exactly representable as f32
    expect(abi_sum_f32_x10(...a)).toBeCloseTo(w(a), 5);
  });

  it("mixed alternating int/float, 12 args (Win64 positional vs SysV/AAPCS64 separate)", () => {
    const args = ["i32", "f64", "i32", "f64", "i32", "f64", "i32", "f64", "i32", "f64", "i32", "f64"];
    const {
      symbols: { abi_mix12 },
    } = dlopen(ABI_FIXTURE_PATH, { abi_mix12: { args, returns: "f64" } });
    const a = [1, 0.5, -3, 1.5, 5, -2.5, 7, 3.5, -9, 4.5, 11, -5.5];
    expect(abi_mix12(...a)).toBeCloseTo(w(a), 9);
    const b = [2147483647, 1e-3, -2147483648, 1e6, 3, 4.25, -6, 7.75, 8, -9.5, 10, 0.125];
    expect(abi_mix12(...b)).toBeCloseTo(w(b), 6);
  });

  it("mixed i64/f64 past the register count", () => {
    const args = ["i64", "f64", "i64", "f64", "i64", "f64", "i64", "f64", "i64", "f64"];
    const {
      symbols: { abi_mix_i64f64 },
    } = dlopen(ABI_FIXTURE_PATH, { abi_mix_i64f64: { args, returns: "i64" } });
    // choose f64 values whose weighted products are integral so the C-side truncation is exact
    const a = [10n, 2, 30n, 4, 50n, 6, 70n, 8, 90n, 10];
    const expected = a.reduce((s, v, i) => s + (typeof v === "bigint" ? v * BigInt(i + 1) : BigInt(v * (i + 1))), 0n);
    expect(abi_mix_i64f64(...a)).toBe(expected);
  });

  it("u8 args past the register count (sub-word stack packing / Darwin natural alignment)", () => {
    const {
      symbols: { abi_sum_u8_x12 },
    } = dlopen(ABI_FIXTURE_PATH, { abi_sum_u8_x12: { args: Array(12).fill("u8"), returns: "i64" } });
    const a = [255, 1, 128, 0, 200, 3, 17, 254, 99, 42, 7, 250];
    expect(abi_sum_u8_x12(...a)).toBe(w(a, true));
  });

  it("i8 args past the register count (stacked byte sign-extension)", () => {
    const {
      symbols: { abi_sum_i8_x12 },
    } = dlopen(ABI_FIXTURE_PATH, { abi_sum_i8_x12: { args: Array(12).fill("i8"), returns: "i64" } });
    const a = [-128, 127, -1, 0, -100, 3, 17, -2, 99, -42, 7, -50];
    expect(abi_sum_i8_x12(...a)).toBe(w(a, true));
  });

  it("i16 args past the register count", () => {
    const {
      symbols: { abi_sum_i16_x12 },
    } = dlopen(ABI_FIXTURE_PATH, { abi_sum_i16_x12: { args: Array(12).fill("i16"), returns: "i64" } });
    const a = [-32768, 32767, -1, 0, -1000, 3, 1717, -2, 9999, -4242, 7, -50];
    expect(abi_sum_i16_x12(...a)).toBe(w(a, true));
  });

  it("bool args past the register count (each exactly 0/1)", () => {
    const {
      symbols: { abi_bools_x10 },
    } = dlopen(ABI_FIXTURE_PATH, { abi_bools_x10: { args: Array(10).fill("bool"), returns: "i32" } });
    const bits = [true, false, true, true, false, false, true, false, true, true];
    expect(abi_bools_x10(...bits)).toBe(bits.reduce((s, b, i) => s + (b ? 1 << i : 0), 0));
  });

  it("callback direction: C invokes JS callbacks with many-arg shapes", () => {
    const { symbols: s } = dlopen(ABI_FIXTURE_PATH, {
      abi_cb_i32_x10: { args: ["callback", "i32"], returns: "i64" },
      abi_cb_f64_x10: { args: ["callback", "f64"], returns: "f64" },
      abi_cb_mix12: { args: ["callback", "i32", "f64"], returns: "f64" },
      abi_cb_i64_x10: { args: ["callback", "i64"], returns: "i64" },
    });
    const cbI = new JSCallback((...a) => a.reduce((t, v, i) => t + BigInt(v) * BigInt(i + 1), 0n), {
      args: Array(10).fill("i32"),
      returns: "i64",
    });
    const cbF = new JSCallback((...a) => a.reduce((t, v, i) => t + v * (i + 1), 0), {
      args: Array(10).fill("f64"),
      returns: "f64",
    });
    const cbM = new JSCallback((...a) => a.reduce((t, v, i) => t + v * (i + 1), 0), {
      args: ["i32", "f64", "i32", "f64", "i32", "f64", "i32", "f64", "i32", "f64", "i32", "f64"],
      returns: "f64",
    });
    const cbL = new JSCallback((...a) => a.reduce((t, v, i) => t + BigInt(v) * BigInt(i + 1), 0n), {
      args: Array(10).fill("i64"),
      returns: "i64",
    });
    try {
      const ki = 5;
      const ai = Array.from({ length: 10 }, (_, i) => ki + i);
      expect(s.abi_cb_i32_x10(cbI, ki)).toBe(w(ai, true));
      const kf = 1.5;
      const af = Array.from({ length: 10 }, (_, i) => kf + i * 0.5);
      expect(s.abi_cb_f64_x10(cbF, kf)).toBeCloseTo(w(af), 9);
      const i0 = 7,
        d0 = 2.5;
      const am = [i0, d0, i0 + 1, d0 + 1, i0 + 2, d0 + 2, i0 + 3, d0 + 3, i0 + 4, d0 + 4, i0 + 5, d0 + 5];
      expect(s.abi_cb_mix12(cbM, i0, d0)).toBeCloseTo(w(am), 9);
      const kl = 2n ** 40n;
      const al = Array.from({ length: 10 }, (_, i) => kl + BigInt(i));
      expect(s.abi_cb_i64_x10(cbL, kl)).toBe(w(al, true));
    } finally {
      cbI.close();
      cbF.close();
      cbM.close();
      cbL.close();
    }
  });
});
