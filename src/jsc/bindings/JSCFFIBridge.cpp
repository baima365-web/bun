// bun:ffi -> JavaScriptCore-native FFI bridge.
//
// Bun's dlopen()/linkSymbols()/CFunction()/JSCallback historically JIT'd a C trampoline per
// symbol with TinyCC. When the WebKit fork provides the engine-native FFI machinery
// (JSC::JSFFIFunction / JSC::JSFFICallback under USE(BUN_JSC_ADDITIONS), described in
// WebKit's docs/ffi/SPEC.md), Bun creates those instead: no TinyCC state per symbol, no
// per-argument JS coercion wrappers, and DFG/FTL integration of the call sites. This is the ONLY
// implementation for dlopen()/linkSymbols()/CFunction() symbols and for JSCallback (including
// threadsafe callbacks); TinyCC remains solely as cc()'s C compiler.

#include "root.h"

#include <JavaScriptCore/BunFFI.h>
#include <JavaScriptCore/FFISignature.h>
#include <JavaScriptCore/FFIType.h>
#include <JavaScriptCore/FFIContext.h>
#include <JavaScriptCore/JSFFICallback.h>
#include <JavaScriptCore/JSFFIFunction.h>
#include "ScriptExecutionContext.h"
#include <JavaScriptCore/JSCJSValueInlines.h>
#include <JavaScriptCore/JSCast.h>
#include <JavaScriptCore/JSObject.h>

#include "ZigGlobalObject.h"
#include "headers-handwritten.h"

// The engine's FFI::Type tags are wire-compatible with Bun's FFIType / abi_type.rs ABIType tags
// (both fixed at char=0 .. buffer=20); assert the shared endpoints so a drift is a build break
// rather than a runtime miscompile.
static_assert(static_cast<uint8_t>(JSC::FFI::Type::Char) == 0, "FFI::Type tag drift");
static_assert(static_cast<uint8_t>(JSC::FFI::Type::Pointer) == 12, "FFI::Type tag drift");
static_assert(static_cast<uint8_t>(JSC::FFI::Type::JSValue) == 19, "FFI::Type tag drift"); // was NapiValue: same tag, engine renamed it
static_assert(static_cast<uint8_t>(JSC::FFI::Type::Buffer) == 20, "FFI::Type tag drift");

// Creates a JSC-native FFI function for `target` with the given Bun ABIType tags. Returns the
// encoded JSFFIFunction, or an empty value with an exception pending on failure (invalid
// signature, executable-memory exhaustion). `argTypes` may be null when `argCount` is 0.
// `owner`: the JS object that owns the underlying resource (the dlopen'd library). The engine
// keeps it alive via a write barrier for as long as ANY function referencing it is reachable, so
// the owner's finalizer (dlclose) can only run once its last function is unreachable.
extern "C" JSC::EncodedJSValue Bun__CreateJSCFFIFunction(
    Zig::GlobalObject* globalObject,
    const ZigString* symbolName,
    const uint8_t* argTypes,
    unsigned argCount,
    uint8_t returnType,
    void* target,
    JSC::EncodedJSValue ownerValue)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    Vector<JSC::FFI::Type, 8> arguments;
    arguments.reserveInitialCapacity(argCount);
    for (unsigned i = 0; i < argCount; ++i)
        arguments.append(static_cast<JSC::FFI::Type>(argTypes[i]));

    RefPtr<JSC::FFI::Signature> signature = JSC::FFI::Signature::tryCreate(arguments.span(), static_cast<JSC::FFI::Type>(returnType));
    if (!signature) {
        JSC::throwTypeError(globalObject, scope, "bun:ffi: unsupported signature"_s);
        RELEASE_AND_RETURN(scope, {});
    }

    JSC::JSObject* owner = JSC::JSValue::decode(ownerValue).getObject(); // nullable

    WTF::String name = symbolName ? Zig::toStringCopy(*symbolName) : WTF::String();
    JSC::JSFFIFunction* function = JSC::JSFFIFunction::create(vm, globalObject, globalObject->ffiFunctionStructure(), signature.releaseNonNull(), target, name, owner, nullptr);
    RETURN_IF_EXCEPTION(scope, {});
    if (!function)
        RELEASE_AND_RETURN(scope, {});

    // `.ptr` (the resolved native pointer, for CFunction()/linkSymbols() and for passing a
    // function as a pointer argument) is an INTRINSIC property of JSFFIFunction served by the
    // engine. Deliberately NOT set here: a putDirect would transition the cell's Structure and cost
    // ~2.5x on every polymorphic (non-devirtualized) call site.

    RELEASE_AND_RETURN(scope, JSC::JSValue::encode(function));
}

// ---- threadsafe callback dispatch ----
// The engine calls this (possibly from a FOREIGN thread) when a threadsafe JSFFICallback is
// entered natively. It carries only refcounted C data: the raw copied argument slots plus the
// embedderContext we passed at creation, which is this callback's ScriptExecutionContext id.
// We queue it to that context's JS thread and there call FFI::runThreadsafeInvocation, which
// converts the slots to JS values and invokes the function -- so no JS value is ever created
// off-thread. Refs the record across the queue; released when the task (or the drop on a dead
// context) completes.
static void Bun__jscFFIThreadsafeDispatch(JSC::FFI::ThreadsafeInvocation& invocation)
{
    // ScriptExecutionContextIdentifier is a uint32_t here: it round-trips losslessly through
    // the opaque embedder-context pointer.
    static_assert(sizeof(WebCore::ScriptExecutionContextIdentifier) <= sizeof(void*));
    auto contextId = static_cast<WebCore::ScriptExecutionContextIdentifier>(reinterpret_cast<uintptr_t>(invocation.embedderContext()));
    // Ref only once the context is found live (inside the map lock); the task adopts it, so the
    // last deref happens on the JS thread. On a dead/terminating context nothing is queued.
    WebCore::ScriptExecutionContext::postTaskTo(contextId, [&invocation] { invocation.ref(); }, [invocation = &invocation](WebCore::ScriptExecutionContext&) mutable {
        Ref protectedInvocation = adoptRef(*invocation);
        JSC::FFI::runThreadsafeInvocation(protectedInvocation.get()); });
}

// Creates a JSC::JSFFICallback wrapping `callable` (threadsafe or not, per the flag) and
// returns it encoded; its read-only "ptr" property is the native entry point handed to C code.
extern "C" JSC::EncodedJSValue Bun__CreateJSCFFICallback(
    Zig::GlobalObject* globalObject,
    JSC::EncodedJSValue callableValue,
    const uint8_t* argTypes,
    unsigned argCount,
    uint8_t returnType,
    bool threadsafe)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    if (threadsafe) {
        // One process-wide dispatch; registered on first threadsafe creation (idempotent).
        static std::once_flag registerDispatch;
        std::call_once(registerDispatch, [] {
            JSC::FFI::FFIContext::setThreadsafeDispatch(Bun__jscFFIThreadsafeDispatch);
        });
    }

    JSC::JSObject* callable = JSC::JSValue::decode(callableValue).getObject();
    if (!callable || !callable->isCallable()) [[unlikely]] {
        JSC::throwTypeError(globalObject, scope, "bun:ffi: JSCallback requires a function"_s);
        RELEASE_AND_RETURN(scope, {});
    }

    Vector<JSC::FFI::Type, 8> arguments;
    arguments.reserveInitialCapacity(argCount);
    for (unsigned i = 0; i < argCount; ++i)
        arguments.append(static_cast<JSC::FFI::Type>(argTypes[i]));

    RefPtr<JSC::FFI::Signature> signature = JSC::FFI::Signature::tryCreate(arguments.span(), static_cast<JSC::FFI::Type>(returnType));
    if (!signature) {
        JSC::throwTypeError(globalObject, scope, "bun:ffi: unsupported callback signature"_s);
        RELEASE_AND_RETURN(scope, {});
    }

    void* embedderContext = nullptr;
    if (threadsafe) {
        // The context id is a small integral identifier: pass it through the engine as the
        // opaque embedder pointer; Bun__jscFFIThreadsafeDispatch reads it back on the foreign
        // thread without touching any JS state.
        auto* scriptExecutionContext = globalObject->scriptExecutionContext();
        if (!scriptExecutionContext) [[unlikely]] {
            JSC::throwTypeError(globalObject, scope, "bun:ffi: no script execution context for a threadsafe JSCallback"_s);
            RELEASE_AND_RETURN(scope, {});
        }
        embedderContext = reinterpret_cast<void*>(static_cast<uintptr_t>(scriptExecutionContext->identifier()));
    }
    JSC::JSFFICallback* callback = JSC::FFI::createCallback(globalObject, signature.releaseNonNull(), callable, threadsafe, embedderContext);
    RETURN_IF_EXCEPTION(scope, {});
    if (!callback)
        RELEASE_AND_RETURN(scope, {});

    RELEASE_AND_RETURN(scope, JSC::JSValue::encode(callback));
}

// Close a JSC-native callback created by Bun__CreateJSCFFICallback (idempotent).
extern "C" void Bun__JSCFFICallbackClose(JSC::EncodedJSValue callbackValue)
{
    if (auto* callback = dynamicDowncast<JSC::JSFFICallback>(JSC::JSValue::decode(callbackValue)))
        callback->close();
}
