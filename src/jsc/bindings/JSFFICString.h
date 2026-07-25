// The native class behind bun:ffi's `CString`.
//
// A CString is a String object (it must stay string-like: String(cs), cs.length, `${cs}`,
// cs == "text", cs instanceof CString/String all keep working) that additionally remembers the
// pointer it was read from. Historically this was a JS `class CString extends String` whose
// constructor wrote `this.ptr` / `this.byteOffset` / `this.byteLength` as own properties -- three
// property adds, hence per-instance Structure transitions, on the hot `returns: "cstring"` path.
// This cell stores those in the object itself and serves them through prototype accessors, so a
// construction does no property adds and every instance shares one Structure.

#pragma once

#include "root.h"

#include <JavaScriptCore/InternalFunction.h>
#include <JavaScriptCore/LazyClassStructure.h>
#include <JavaScriptCore/StringObject.h>
#include <JavaScriptCore/WriteBarrier.h>

namespace Zig {
class GlobalObject;
}

namespace Bun {

using namespace JSC;

class JSFFICString final : public JSC::StringObject {
public:
    using Base = JSC::StringObject;
    static constexpr unsigned StructureFlags = Base::StructureFlags;
    static constexpr JSC::DestructionMode needsDestruction = JSC::DoesNotNeedDestruction;

    DECLARE_INFO;
    DECLARE_VISIT_CHILDREN;

    template<typename, JSC::SubspaceAccess mode> static JSC::GCClient::IsoSubspace* subspaceFor(JSC::VM& vm)
    {
        if constexpr (mode == JSC::SubspaceAccess::Concurrently)
            return nullptr;
        return subspaceForImpl(vm);
    }
    static JSC::GCClient::IsoSubspace* subspaceForImpl(JSC::VM& vm);

    static size_t allocationSize(Checked<size_t> inlineCapacity)
    {
        ASSERT_UNUSED(inlineCapacity, !inlineCapacity);
        return sizeof(JSFFICString);
    }

    // A `class extends String` instance is a DerivedStringObjectType; using the same type keeps
    // every StringObject fast path (inherits<StringObject> is the [StringObjectType,
    // DerivedStringObjectType] range) and matches what the old JS subclass produced.
    static JSC::Structure* createStructure(JSC::VM&, JSC::JSGlobalObject*, JSC::JSValue prototype);

    static JSFFICString* create(JSC::VM&, JSC::Structure*, JSC::JSString*, JSC::JSValue ptr, JSC::JSValue byteOffset, JSC::JSValue byteLength);

    JSC::JSValue ptr() const { return m_ptr.get(); }
    JSC::JSValue byteOffset() const { return m_byteOffset.get(); }
    JSC::JSValue byteLength() const { return m_byteLength.get(); }
    JSC::JSValue cachedArrayBuffer() const { return m_cachedArrayBuffer.get(); }

    void setPtr(JSC::VM& vm, JSC::JSValue value) { m_ptr.set(vm, this, value); }
    void setByteOffset(JSC::VM& vm, JSC::JSValue value) { m_byteOffset.set(vm, this, value); }
    void setByteLength(JSC::VM& vm, JSC::JSValue value) { m_byteLength.set(vm, this, value); }
    void setCachedArrayBuffer(JSC::VM& vm, JSC::JSValue value) { m_cachedArrayBuffer.set(vm, this, value); }

private:
    JSFFICString(JSC::VM& vm, JSC::Structure* structure)
        : Base(vm, structure)
    {
    }
    void finishCreation(JSC::VM&, JSC::JSString*, JSC::JSValue ptr, JSC::JSValue byteOffset, JSC::JSValue byteLength);

    // `ptr` / `byteOffset` / `byteLength` (read AND write, exactly like the old own properties)
    // and the lazily-created `arrayBuffer` view. They live here instead of as own properties so
    // that no instance ever transitions away from the shared Structure.
    JSC::WriteBarrier<JSC::Unknown> m_ptr;
    JSC::WriteBarrier<JSC::Unknown> m_byteOffset;
    JSC::WriteBarrier<JSC::Unknown> m_byteLength;
    JSC::WriteBarrier<JSC::Unknown> m_cachedArrayBuffer;
};

class JSFFICStringPrototype final : public JSC::JSNonFinalObject {
public:
    using Base = JSC::JSNonFinalObject;
    static constexpr unsigned StructureFlags = Base::StructureFlags;

    DECLARE_INFO;

    template<typename CellType, JSC::SubspaceAccess>
    static JSC::GCClient::IsoSubspace* subspaceFor(JSC::VM& vm)
    {
        STATIC_ASSERT_ISO_SUBSPACE_SHARABLE(JSFFICStringPrototype, Base);
        return &vm.plainObjectSpace();
    }

    static JSC::Structure* createStructure(JSC::VM& vm, JSC::JSGlobalObject* globalObject, JSC::JSValue prototype)
    {
        auto* structure = JSC::Structure::create(vm, globalObject, prototype, JSC::TypeInfo(JSC::ObjectType, StructureFlags), info());
        structure->setMayBePrototype(true);
        return structure;
    }

    static JSFFICStringPrototype* create(JSC::VM& vm, JSC::JSGlobalObject* globalObject, JSC::Structure* structure)
    {
        JSFFICStringPrototype* prototype = new (NotNull, JSC::allocateCell<JSFFICStringPrototype>(vm)) JSFFICStringPrototype(vm, structure);
        prototype->finishCreation(vm, globalObject);
        return prototype;
    }

private:
    JSFFICStringPrototype(JSC::VM& vm, JSC::Structure* structure)
        : Base(vm, structure)
    {
    }
    void finishCreation(JSC::VM&, JSC::JSGlobalObject*);
};

// `CString` / `Bun.FFI.CString`. Constructing (`new CString(ptr, byteOffset?, byteLength?)`)
// yields a JSFFICString; calling it as a plain function (legacy `Bun.FFI.CString(ptr, ...)`)
// keeps returning the transcoded JS string primitive as it always has.
class JSFFICStringConstructor final : public JSC::InternalFunction {
public:
    using Base = JSC::InternalFunction;
    static constexpr unsigned StructureFlags = Base::StructureFlags;
    static constexpr JSC::DestructionMode needsDestruction = JSC::DoesNotNeedDestruction;

    DECLARE_INFO;

    static JSFFICStringConstructor* create(JSC::VM&, JSC::JSGlobalObject*, JSC::Structure*, JSFFICStringPrototype*);

    static JSC::Structure* createStructure(JSC::VM& vm, JSC::JSGlobalObject* globalObject, JSC::JSValue prototype)
    {
        return JSC::Structure::create(vm, globalObject, prototype, JSC::TypeInfo(JSC::InternalFunctionType, StructureFlags), info());
    }

private:
    JSFFICStringConstructor(JSC::VM& vm, JSC::Structure* structure);
    void finishCreation(JSC::VM&, JSC::JSGlobalObject*, JSFFICStringPrototype*);
};

void setupJSFFICStringClassStructure(JSC::LazyClassStructure::Initializer& init);

} // namespace Bun
