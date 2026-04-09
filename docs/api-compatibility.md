# API Compatibility Guidelines

The `@microsoft/vscode-fabric-api` package defines the contract between the core extension and satellite extensions. Some interfaces are implemented by satellites and consumed by the core (e.g., workflow hooks, artifact handlers, tree node providers), while others are implemented by the core and consumed by satellites (e.g., service collections, managers). Changes in either direction must maintain backward compatibility. The rules in this document apply to all API modifications.

## Version Mismatch Scenarios

The `@microsoft/vscode-fabric-api` package is a **build-time** dependency — it controls what satellites compile against, but it does not lock runtime versions together. A user may update the core extension without updating a satellite, or vice versa. This means any combination of core and satellite API versions can coexist at runtime.

The `apiVersion` check during `addExtension()` catches major version incompatibilities, but minor version skew within a compatible range is expected. The rules in this document are designed so that additive, non-breaking changes remain safe across version boundaries. If every API evolution follows the guidelines below, a version mismatch should not cause compile-time or runtime failures in either direction.

## Rules for Evolving Interfaces

### Prefer an options object over positional parameters

When a method may accumulate optional context over time, group those values in a single options object rather than appending positional parameters. This keeps signatures stable and lets new properties be added without changing the call site.

```typescript
// ✅ Options object — new properties are additive and non-breaking
export interface IGetDefinitionOptions {
    folder?: vscode.Uri;
    format?: string;
}

onBeforeGetDefinition?(artifact: IArtifact, options: IGetDefinitionOptions): Promise<IApiClientRequestOptions>;

// Adding a new capability later:
export interface IGetDefinitionOptions {
    folder?: vscode.Uri;
    format?: string;
    includeMetadata?: boolean;  // ← additive, no signature change
}
```

If a method already uses positional parameters, it can be migrated to an options object by deprecating the old signature and introducing a new one, or by appending the options object as a final optional parameter.

### Making a required parameter optional

Use `parameter?: Type`. TypeScript allows a function with a required parameter to satisfy an interface that declares the same parameter as optional, so existing satellite implementations continue to compile.

```typescript
// ✅ Backward compatible — existing implementations still match
onBeforeGetDefinition?(artifact: IArtifact, folder?: vscode.Uri, options?: IApiClientRequestOptions): Promise<IApiClientRequestOptions>;
```

Do **not** use `parameter: Type | undefined`. This forces every implementation to widen its parameter type, breaking existing satellites at compile time.

```typescript
// ❌ Breaking — existing implementations that declare `folder: vscode.Uri` no longer match
onBeforeGetDefinition?(artifact: IArtifact, folder: vscode.Uri | undefined, options: IApiClientRequestOptions): Promise<IApiClientRequestOptions>;
```

### Adding new parameters

Append them as optional. Never insert a required parameter into the middle of an existing signature. If the parameter list is already long (3+ optional params), consider introducing an options object instead (see above).

### Adding new methods to an interface

Declare them as optional (`method?()`) so that existing implementations satisfy the interface without modification. The core must check for the method's existence before calling it.

```typescript
export interface IGetArtifactDefinitionWorkflow {
    onBeforeGetDefinition?(...): Promise<...>;
    onAfterGetDefinition?(...): Promise<void>;
    onGetDefinitionError?(...): Promise<void>;  // ← new optional method, non-breaking
}
```

### Widening return types

A method may return a broader type (e.g., `string` → `string | undefined`) without breaking callers, but **narrowing** a return type (e.g., `string | undefined` → `string`) can break implementations that already return the wider type. Prefer widening or keeping stable.

### Removing or renaming parameters

Requires a deprecation path and CHANGELOG note (see `AGENTS.MD` §7). Mark the old signature with a `@deprecated` JSDoc tag and maintain it for at least one minor version before removal.

## Known Breaking Changes

The following changes **will** break existing satellite implementations and must be avoided without a major version bump and migration plan.

### Signature changes

- **Adding a required parameter** — existing implementations don't supply it.
- **Removing a parameter** — existing implementations that pass it get a compile error.
- **Reordering parameters** — existing callers/implementers pass values in the wrong positions.
- **Using `param: Type | undefined` instead of `param?: Type`** — forces implementations to widen their parameter type; existing `param: Type` signatures no longer satisfy the interface.

### Interface / type changes

- **Making an optional method required** (`method?()` → `method()`) — existing implementations that omit it no longer satisfy the interface.
- **Making an optional property required** in an options object — same effect as above.
- **Narrowing a return type** (`string | undefined` → `string`) — implementations that return the wider type no longer compile.
- **Narrowing a parameter type** (`string | number` → `string`) — callers that pass the removed variant break.
- **Removing a method or property from an interface** — implementations that reference it break.
- **Renaming an interface, method, or property** — all existing references become unresolved.

### Behavioral changes

- **Changing the semantic meaning of an existing parameter** without a new name — existing implementations continue to compile but silently do the wrong thing. This is the hardest category to catch.
- **Changing when or whether the core calls a workflow hook** — satellites that rely on the previous invocation contract may malfunction (e.g., a hook that previously ran for every artifact now only runs conditionally).
- **Changing the expected shape of the return value** — if the core starts inspecting a new property on the returned object that old implementations never set, it must treat absence as a valid case.

## Runtime Considerations

At runtime JavaScript does not enforce types. When the core passes `undefined` for a newly-optional parameter, an old satellite that declared it as required will simply receive `undefined`. If the satellite dereferences the value without a guard, it will throw — but this is a logical error in the satellite, not an API compatibility failure.

**Core implementations** should validate parameters they truly require:

```typescript
if (!options) {
    throw new Error('options parameter is required');
}
```

**Satellite implementations** should add defensive checks when adopting the new API:

```typescript
async onBeforeGetDefinition(
    artifact: IArtifact,
    folder?: vscode.Uri,
    options?: IApiClientRequestOptions
): Promise<IApiClientRequestOptions> {
    if (!options) {
        throw new Error('options parameter is required');
    }
    if (folder) {
        // local scenario
    } else {
        // remote view scenario
    }
    return options;
}
```

## Quick Reference

| Goal | Do | Don't |
|---|---|---|
| Anticipate growing parameters | Use an options object with optional properties | Add positional params one at a time |
| Make a required param optional | `param?: Type` | `param: Type \| undefined` |
| Add a new param | Append as optional, or add to options object | Insert required param in existing signature |
| Add a new method to an interface | `method?()` (optional) | `method()` (required — breaks existing impls) |
| Widen a return type | `string` → `string \| undefined` | Narrow: `string \| undefined` → `string` |
| Remove / rename a param | `@deprecated` + CHANGELOG, keep one minor version | Delete without warning |
| Handle optional params in core | Always pass the argument (even if `undefined`) | Silently skip the workflow hook |
| Handle optional params in satellite | Guard with `if (!param)` | Assume the value is always defined |

## Deprecated API Inventory

The following APIs in `@microsoft/vscode-fabric-api` were marked `@deprecated`. This section tracks removal progress and remaining items.

### Completed Removals

These deprecated APIs have been fully removed from the API package and all consuming code in both the core extension and (where applicable) the functions extension.

| Removed API | Category | Notes |
|---|---|---|
| `LocalProjectTreeNodeProvider` | Class (`treeView.ts`) | Migrated to `@microsoft/vscode-fabric-util` equivalent |
| `selectArtifact()` | `IArtifactManager` method | Replaced by `IReadArtifactWorkflow` |
| `openArtifact()` | `IArtifactManager` method + command | Replaced by `getArtifactDefinition()`. Also removed command registration, context menus, `ArtifactDesignerActions.open` |
| `getArtifactData()` | `IArtifactManager` method | Removed from API, implementation, mocks, tests |
| `getArtifactPayload()` | `IArtifactManager` method | Removed from API, implementation, mocks, tests |
| `OperationRequestType.create` | Enum value | Removed then **restored** — still used by functions extension |
| `createArtifactDeprecated()` | `ArtifactManager` internal | Removed along with `shouldUseDeprecatedCommand()` |
| `doContextMenuItem()` | `IArtifactManager` method | Migrated satellite commands (database, notebook) to inline `withErrorHandling`/`doFabricAction` |
| `updateArtifactDeprecated()` | `IArtifactManagerInternal` method | Verified unused, removed |
| `IArtifactManagerInternal` | Interface | Empty after removals; ~37 references across 16 files migrated to `IArtifactManager` |
| `IDisposable` | Interface (`IDisposable.ts`) | File deleted; `AccountProvider` and `TokenAcquisitionService` migrated to `vscode.Disposable` |
| `ILocalFileSystem` | Interface (`fabricExtension.ts`) | Removed — zero usage in either extension |
| `InputTypeAttribute` | Type alias (`FabricApiClient.ts`) | Removed — zero usage in either extension |
| `ArtifactAttributes` | Type alias (`FabricApiClient.ts`) | Removed along with `IArtifact.attributes` field — zero usage in either extension |
| `getLocalFolderForFabricWorkspace()` | `IWorkspaceManager` method | Removed from API, `WorkspaceManager` implementation, and test mock |
| `DefaultArtifactHandler` | Class (`extension/src/`) | Deleted — zero callers; only implemented the removed `onAfterRequest` path |
| `ILocalFolderManager` | Interface + implementations | Deleted `ILocalFolderManager.ts`, `LocalFolderManager.ts`, `WebLocalFolderManager.ts`, unit test, DI registrations. All usage was dead code after `getLocalFolderForFabricWorkspace` removal |
| `showLocalFolderQuickPick` | Utility function | Deleted source + test — no-op stub with zero production callers |

### Remaining — Used by Functions Extension (requires coordination)

These deprecated APIs are still actively consumed by the `vscode-fabric-functions` extension and cannot be removed from the API package without a coordinated migration.

| Deprecated API | Location | Functions Usage |
|---|---|---|
| `OperationRequestType` | `fabricExtension.ts` | 3 files: `GraphQLArtifactHandler`, `SQLDatabaseArtifactHandler`, `mockArtifactHandlers` |
| `IOpenArtifactOptions` | `fabricExtension.ts` | Extended by `IOpenFunctionSetOptions` (2 files) |
| `onBeforeRequest()` | `IArtifactHandler` | Implemented by `GraphQLArtifactHandler`, `SQLDatabaseArtifactHandler`, `mockArtifactHandlers` (3 files) |
| `onOpen()` | `IArtifactHandler` | Implemented by `FunctionSetArtifactHandler` + integration tests |
| `ArtifactDesignerActions.publish` | `satelliteFabricExtension.ts` | 1 file |
| `RuntimeType` | `FabricApiClient.ts` | **Heavy** — 30+ uses across 9 src files |
| `InputType` | `FabricApiClient.ts` | **Moderate** — `FunctionSetBase`, `FunctionSetOnOpen`, tests |
| `BindingType` | `FabricApiClient.ts` | **Light** — 1 use in `FunctionSetBase` |
| `BindingTypeToInputTypeMapping` | `FabricApiClient.ts` | **Light** — 1 use in `FunctionSetBase` |
| `RuntimeAttribute` | `FabricApiClient.ts` | **Moderate** — `FunctionSetArtifactHandler`, `FunctionSetOnOpen`, `FunctionSetUtils` |
| `IArtifact.attributes` | `FabricApiClient.ts` | **Heavy** — 30+ uses in `FunctionSetBase`, `FunctionSetOnOpen`, many tests |

### Remaining — Core-Only (isolated to vscode-fabric repo)

These deprecated APIs exist in the API package and are only consumed within the core extension. They can be removed without coordinating with the functions extension.

| Deprecated API | Location | Core Usage |
|---|---|---|
| `onAfterRequest()` | `IArtifactHandler` (`satelliteFabricExtension.ts`) | `MockArtifactManager` only (2 call sites) |

### Key Observations

- **Functions-dependent items** are deeply embedded (150+ total occurrences across ~30 files). Removal requires migration work in the functions repo first.
- **`OperationRequestType.create`** was temporarily removed but had to be restored because the functions extension still uses it.
- **`onAfterRequest`** is the only remaining core-only deprecated API. It is used in `MockArtifactManager` (test infrastructure) and could be removed once that mock is updated.
