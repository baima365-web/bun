// bun:ffi's `CString`: a native String object (JSC::StringObject subclass) that carries the source
// pointer alongside the transcoded string. See JSFFICString.h for why this is a native class.

#include "root.h"

#include "JSFFICString.h"

#include "ZigGlobalObject.h"
#include "BunClientData.h"
#include <JavaScriptCore/JSArrayBuffer.h>
#include <JavaScriptCore/JSCInlines.h>
#include <JavaScriptCore/JSString.h>
#include <JavaScriptCore/Lookup.h>
#include <JavaScriptCore/ObjectConstructor.h>
#include <cmath>

// Rust side (src/runtime/ffi/FFIObject.rs). The pointer -> string transcoding and the ArrayBuffer
// view keep their single existing implementation (get_ptr_slice / new_cstring / to_array_buffer)
// so every validation rule and error message stays byte-identical to the old JS class.
//
// Legacy `Bun.FFI.CString(ptr, byteOffset?, byteLength?)` called WITHOUT `new`: returns the raw
// transcoder result (a string, or an Error value for a bad pointer).
extern "C" JSC::EncodedJSValue Bun__FFI__CString__call(JSC::JSGlobalObject*, JSC::CallFrame*);
// Transcodes the C string at `ptr` (+ optional byteOffset/byteLength) to a JS string; an invalid
// pointer yields an Error value (not a thrown exception), exactly like the legacy transcoder.
extern "C" JSC::EncodedJSValue Bun__FFI__CString__transcode(JSC::JSGlobalObject*, JSC::EncodedJSValue ptr, JSC::EncodedJSValue byteOffset, JSC::EncodedJSValue byteLength);
// `toArrayBuffer(ptr, byteOffset, byteLength)` -- backs the `arrayBuffer` accessor.
extern "C" JSC::EncodedJSValue Bun__FFI__CString__toArrayBuffer(JSC::JSGlobalObject*, JSC::EncodedJSValue ptr, JSC::EncodedJSValue byteOffset, JSC::EncodedJSValue byteLength);

namespace Bun {

using namespace JSC;

static JSC_DECLARE_HOST_FUNCTION(callFFICString);
static JSC_DECLARE_HOST_FUNCTION(constructFFICString);

static JSC_DECLARE_CUSTOM_GETTER(jsFFICStringGetter_ptr);
static JSC_DECLARE_CUSTOM_SETTER(jsFFICStringSetter_ptr);
static JSC_DECLARE_CUSTOM_GETTER(jsFFICStringGetter_byteOffset);
static JSC_DECLARE_CUSTOM_SETTER(jsFFICStringSetter_byteOffset);
static JSC_DECLARE_CUSTOM_GETTER(jsFFICStringGetter_byteLength);
static JSC_DECLARE_CUSTOM_SETTER(jsFFICStringSetter_byteLength);
static JSC_DECLARE_CUSTOM_GETTER(jsFFICStringGetter_arrayBuffer);

// ─── JSFFICString ────────────────────────────────────────────────────────────

const ClassInfo JSFFICString::s_info = { "CString"_s, &Base::s_info, nullptr, nullptr, CREATE_METHOD_TABLE(JSFFICString) };

JSC::GCClient::IsoSubspace* JSFFICString::subspaceForImpl(JSC::VM& vm)
{
    return WebCore::subspaceForImpl<JSFFICString, WebCore::UseCustomHeapCellType::No>(
        vm,
        [](auto& spaces) { return spaces.m_clientSubspaceForFFICString.get(); },
        [](auto& spaces, auto&& space) { spaces.m_clientSubspaceForFFICString = std::forward<decltype(space)>(space); },
        [](auto& spaces) { return spaces.m_subspaceForFFICString.get(); },
        [](auto& spaces, auto&& space) { spaces.m_subspaceForFFICString = std::forward<decltype(space)>(space); });
}

Structure* JSFFICString::createStructure(VM& vm, JSGlobalObject* globalObject, JSValue prototype)
{
    return Structure::create(vm, globalObject, prototype, TypeInfo(DerivedStringObjectType, StructureFlags), info(), MayHaveIndexedAccessors);
}

JSFFICString* JSFFICString::create(VM& vm, Structure* structure, JSString* string, JSValue ptr, JSValue byteOffset, JSValue byteLength)
{
    JSFFICString* cell = new (NotNull, allocateCell<JSFFICString>(vm)) JSFFICString(vm, structure);
    cell->finishCreation(vm, string, ptr, byteOffset, byteLength);
    return cell;
}

void JSFFICString::finishCreation(VM& vm, JSString* string, JSValue ptr, JSValue byteOffset, JSValue byteLength)
{
    Base::finishCreation(vm, string);
    m_ptr.set(vm, this, ptr);
    m_byteOffset.set(vm, this, byteOffset);
    m_byteLength.set(vm, this, byteLength);
}

template<typename Visitor>
void JSFFICString::visitChildrenImpl(JSCell* cell, Visitor& visitor)
{
    JSFFICString* thisObject = uncheckedDowncast<JSFFICString>(cell);
    ASSERT_GC_OBJECT_INHERITS(thisObject, info());
    Base::visitChildren(thisObject, visitor);
    visitor.append(thisObject->m_ptr);
    visitor.append(thisObject->m_byteOffset);
    visitor.append(thisObject->m_byteLength);
    visitor.append(thisObject->m_cachedArrayBuffer);
}
DEFINE_VISIT_CHILDREN(JSFFICString);

// ─── Prototype ───────────────────────────────────────────────────────────────

// The three data-like accessors have setters too: on the old class `ptr` / `byteOffset` /
// `byteLength` were plain writable (and enumerable) own properties, so `cstr.byteLength = n` and
// `for (const key in cstr)` must keep working. `arrayBuffer` was a (non-enumerable) getter.
static const HashTableValue JSFFICStringPrototypeTableValues[] = {
    { "ptr"_s, static_cast<unsigned>(PropertyAttribute::CustomAccessor), NoIntrinsic, { HashTableValue::GetterSetterType, jsFFICStringGetter_ptr, jsFFICStringSetter_ptr } },
    { "byteOffset"_s, static_cast<unsigned>(PropertyAttribute::CustomAccessor), NoIntrinsic, { HashTableValue::GetterSetterType, jsFFICStringGetter_byteOffset, jsFFICStringSetter_byteOffset } },
    { "byteLength"_s, static_cast<unsigned>(PropertyAttribute::CustomAccessor), NoIntrinsic, { HashTableValue::GetterSetterType, jsFFICStringGetter_byteLength, jsFFICStringSetter_byteLength } },
    { "arrayBuffer"_s, static_cast<unsigned>(PropertyAttribute::CustomAccessor | PropertyAttribute::ReadOnly | PropertyAttribute::DontEnum), NoIntrinsic, { HashTableValue::GetterSetterType, jsFFICStringGetter_arrayBuffer, nullptr } },
};

const ClassInfo JSFFICStringPrototype::s_info = { "CString"_s, &Base::s_info, nullptr, nullptr, CREATE_METHOD_TABLE(JSFFICStringPrototype) };

void JSFFICStringPrototype::finishCreation(VM& vm, JSGlobalObject*)
{
    Base::finishCreation(vm);
    reifyStaticProperties(vm, JSFFICString::info(), JSFFICStringPrototypeTableValues, *this);
}

// A foreign receiver -- e.g. `Object.create(cstr)`, whose set is routed to this inherited setter --
// gets an own data property, which is what an assignment did when these were plain writable data
// properties (rather than failing the write and throwing in strict mode).
static bool setFFICStringAccessorOnForeignReceiver(JSGlobalObject* lexicalGlobalObject, EncodedJSValue thisValue, EncodedJSValue encodedValue, PropertyName propertyName)
{
    VM& vm = getVM(lexicalGlobalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    JSObject* receiver = JSValue::decode(thisValue).getObject();
    // Leave CString.prototype's own accessor alone.
    if (!receiver || receiver == defaultGlobalObject(lexicalGlobalObject)->JSFFICStringPrototype())
        return true;
    RELEASE_AND_RETURN(scope, receiver->createDataProperty(lexicalGlobalObject, propertyName, JSValue::decode(encodedValue), false));
}

// A getter on the prototype reached with a foreign `this` (e.g. `CString.prototype.ptr`) reads
// like the old data property looked up on the prototype: undefined.
#define BUN_FFI_CSTRING_ACCESSOR(name, getterMethod, setterMethod)                                                                                                         \
    JSC_DEFINE_CUSTOM_GETTER(jsFFICStringGetter_##name, (JSGlobalObject * globalObject, EncodedJSValue thisValue, PropertyName))                                           \
    {                                                                                                                                                                      \
        UNUSED_PARAM(globalObject);                                                                                                                                        \
        auto* thisObject = dynamicDowncast<JSFFICString>(JSValue::decode(thisValue));                                                                                      \
        if (!thisObject) [[unlikely]]                                                                                                                                      \
            return JSValue::encode(jsUndefined());                                                                                                                         \
        return JSValue::encode(thisObject->getterMethod());                                                                                                                \
    }                                                                                                                                                                      \
    JSC_DEFINE_CUSTOM_SETTER(jsFFICStringSetter_##name, (JSGlobalObject * globalObject, EncodedJSValue thisValue, EncodedJSValue encodedValue, PropertyName propertyName)) \
    {                                                                                                                                                                      \
        auto* thisObject = dynamicDowncast<JSFFICString>(JSValue::decode(thisValue));                                                                                      \
        if (!thisObject) [[unlikely]]                                                                                                                                      \
            return setFFICStringAccessorOnForeignReceiver(globalObject, thisValue, encodedValue, propertyName);                                                            \
        thisObject->setterMethod(getVM(globalObject), JSValue::decode(encodedValue));                                                                                      \
        return true;                                                                                                                                                       \
    }

BUN_FFI_CSTRING_ACCESSOR(ptr, ptr, setPtr)
BUN_FFI_CSTRING_ACCESSOR(byteOffset, byteOffset, setByteOffset)
BUN_FFI_CSTRING_ACCESSOR(byteLength, byteLength, setByteLength)

#undef BUN_FFI_CSTRING_ACCESSOR

// `arrayBuffer`: `if (!ptr) return new ArrayBuffer(0); return toArrayBuffer(ptr, byteOffset,
// byteLength)`, cached on the instance -- verbatim the old class's getter, minus the private
// field write (the cache slot is part of the cell).
static JSC_DEFINE_CUSTOM_GETTER(jsFFICStringGetter_arrayBuffer, (JSGlobalObject * globalObject, EncodedJSValue thisValue, PropertyName))
{
    VM& vm = getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    auto* thisObject = dynamicDowncast<JSFFICString>(JSValue::decode(thisValue));
    if (!thisObject) [[unlikely]]
        return throwVMTypeError(globalObject, scope, "CString.prototype.arrayBuffer getter can only be used on instances of CString"_s);

    if (JSValue cached = thisObject->cachedArrayBuffer())
        return JSValue::encode(cached);

    JSValue ptr = thisObject->ptr();
    bool hasPointer = ptr.toBoolean(globalObject);
    RETURN_IF_EXCEPTION(scope, {});

    JSValue result;
    if (!hasPointer) {
        auto buffer = ArrayBuffer::tryCreate(0U, 1U);
        if (!buffer) [[unlikely]] {
            throwOutOfMemoryError(globalObject, scope);
            return {};
        }
        result = JSArrayBuffer::create(vm, globalObject->arrayBufferStructure(), buffer.releaseNonNull());
    } else {
        result = JSValue::decode(Bun__FFI__CString__toArrayBuffer(globalObject, JSValue::encode(ptr), JSValue::encode(thisObject->byteOffset()), JSValue::encode(thisObject->byteLength())));
        RETURN_IF_EXCEPTION(scope, {});
    }

    thisObject->setCachedArrayBuffer(vm, result);
    return JSValue::encode(result);
}

// ─── Constructor ─────────────────────────────────────────────────────────────

const ClassInfo JSFFICStringConstructor::s_info = { "CString"_s, &Base::s_info, nullptr, nullptr, CREATE_METHOD_TABLE(JSFFICStringConstructor) };

JSFFICStringConstructor::JSFFICStringConstructor(VM& vm, Structure* structure)
    : Base(vm, structure, callFFICString, constructFFICString)
{
}

JSFFICStringConstructor* JSFFICStringConstructor::create(VM& vm, JSGlobalObject* globalObject, Structure* structure, JSFFICStringPrototype* prototype)
{
    JSFFICStringConstructor* constructor = new (NotNull, allocateCell<JSFFICStringConstructor>(vm)) JSFFICStringConstructor(vm, structure);
    constructor->finishCreation(vm, globalObject, prototype);
    return constructor;
}

void JSFFICStringConstructor::finishCreation(VM& vm, JSGlobalObject* globalObject, JSFFICStringPrototype* prototype)
{
    // (ptr, byteOffset?, byteLength?): the old JS class's constructor had three declared
    // parameters, so `CString.length` was 3.
    Base::finishCreation(vm, 3, "CString"_s, PropertyAdditionMode::WithoutStructureTransition);
    putDirectWithoutTransition(vm, vm.propertyNames->prototype, prototype, PropertyAttribute::DontEnum | PropertyAttribute::DontDelete | PropertyAttribute::ReadOnly);
    ASSERT_UNUSED(globalObject, inherits(info()));
}

// `Bun.FFI.CString(ptr, byteOffset?, byteLength?)` WITHOUT `new`: the legacy transcoder.
JSC_DEFINE_HOST_FUNCTION(callFFICString, (JSGlobalObject * globalObject, CallFrame* callFrame))
{
    return Bun__FFI__CString__call(globalObject, callFrame);
}

// Number.isSafeInteger()
static inline bool isSafeIntegerValue(JSValue value)
{
    if (value.isInt32())
        return true;
    if (!value.isDouble())
        return false;
    double number = value.asDouble();
    return std::isfinite(number) && std::trunc(number) == number && std::abs(number) <= maxSafeInteger();
}

// `new CString(ptr, byteOffset?, byteLength?)`. Mirrors the old class exactly:
//   super(ptr ? BunCString(ptr, byteOffset || 0[, byteLength if safe integer]) : "")
//   this.ptr = typeof ptr === "number" ? ptr : 0; this.byteOffset = byteOffset; this.byteLength = byteLength
JSC_DEFINE_HOST_FUNCTION(constructFFICString, (JSGlobalObject * lexicalGlobalObject, CallFrame* callFrame))
{
    auto* globalObject = defaultGlobalObject(lexicalGlobalObject);
    VM& vm = globalObject->vm();
    auto scope = DECLARE_THROW_SCOPE(vm);

    JSValue ptrValue = callFrame->argument(0);
    JSValue byteOffset = callFrame->argument(1);
    JSValue byteLength = callFrame->argument(2);

    JSString* string;
    bool hasPointer = ptrValue.toBoolean(lexicalGlobalObject);
    RETURN_IF_EXCEPTION(scope, {});
    if (hasPointer) {
        JSValue offsetArgument = byteOffset.toBoolean(lexicalGlobalObject) ? byteOffset : jsNumber(0); // byteOffset || 0
        RETURN_IF_EXCEPTION(scope, {});
        JSValue lengthArgument = isSafeIntegerValue(byteLength) ? byteLength : jsUndefined();
        JSValue transcoded = JSValue::decode(Bun__FFI__CString__transcode(lexicalGlobalObject, JSValue::encode(ptrValue), JSValue::encode(offsetArgument), JSValue::encode(lengthArgument)));
        RETURN_IF_EXCEPTION(scope, {});
        if (transcoded.isString()) [[likely]] {
            string = asString(transcoded);
        } else {
            // A validation failure comes back as an Error value; the old `super()` handed it to
            // the String constructor, i.e. the object was stringified.
            string = transcoded.toString(lexicalGlobalObject);
            RETURN_IF_EXCEPTION(scope, {});
        }
    } else {
        string = jsEmptyString(vm);
    }

    Structure* structure = globalObject->JSFFICStringStructure();
    JSValue newTarget = callFrame->newTarget();
    if (globalObject->JSFFICStringConstructor() != newTarget) [[unlikely]] {
        auto* functionGlobalObject = defaultGlobalObject(getFunctionRealm(lexicalGlobalObject, newTarget.getObject()));
        RETURN_IF_EXCEPTION(scope, {});
        structure = InternalFunction::createSubclassStructure(lexicalGlobalObject, newTarget.getObject(), functionGlobalObject->JSFFICStringStructure());
        RETURN_IF_EXCEPTION(scope, {});
    }

    RELEASE_AND_RETURN(scope, JSValue::encode(JSFFICString::create(vm, structure, string, ptrValue.isNumber() ? ptrValue : jsNumber(0), byteOffset, byteLength)));
}

// ─── Registration ────────────────────────────────────────────────────────────

void setupJSFFICStringClassStructure(LazyClassStructure::Initializer& init)
{
    // CString.prototype's [[Prototype]] is String.prototype (`class CString extends String`).
    auto* prototypeStructure = JSFFICStringPrototype::createStructure(init.vm, init.global, init.global->stringPrototype());
    auto* prototype = JSFFICStringPrototype::create(init.vm, init.global, prototypeStructure);

    // ... and the constructor's own [[Prototype]] is the String constructor (static inheritance),
    // so `Object.getPrototypeOf(CString) === String` and inherited statics keep resolving.
    JSValue stringConstructor = init.global->stringPrototype()->getDirect(init.vm, init.vm.propertyNames->constructor);
    JSValue constructorPrototype = stringConstructor.isObject() ? stringConstructor : JSValue(init.global->functionPrototype());
    auto* constructorStructure = JSFFICStringConstructor::createStructure(init.vm, init.global, constructorPrototype);
    auto* constructor = JSFFICStringConstructor::create(init.vm, init.global, constructorStructure, prototype);

    auto* structure = JSFFICString::createStructure(init.vm, init.global, prototype);
    init.setPrototype(prototype);
    init.setStructure(structure);
    init.setConstructor(constructor);
}

} // namespace Bun

// Handed to the Rust `Bun.FFI` object builder so `Bun.FFI.CString` and bun:ffi's `CString` are
// this one constructor.
extern "C" JSC::EncodedJSValue Bun__FFI__CStringConstructor(JSC::JSGlobalObject* globalObject)
{
    return JSC::JSValue::encode(defaultGlobalObject(globalObject)->JSFFICStringConstructor());
}
