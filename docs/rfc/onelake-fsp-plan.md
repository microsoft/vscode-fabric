# OneLake FileSystemProvider - Implementation Plan

## Context for New Chat Session

This document summarizes the findings and plan from a prior conversation. The goal is to implement an `OneLakeFileSystemProvider` that gives web users (vscode.dev) the same "local folder" experience that desktop users get via the native file system. The backing storage is a Fabric Lakehouse's OneLake Files section, accessed via the ADLS Gen2-compatible DFS API.

**Branch**: Start from `main`. This work is independent of the `dev/mwade/workspace-virtual-folder-azure-poc` branch (which has `fabric-definition://` FSP enhancements for inline tree-view editing - a separate feature).

---

## 1. Problem Statement

The extension's "Export" and "Import" flows let desktop users download item definitions to a local folder, edit them with full VS Code tooling (language servers, Copilot, Explorer), and publish changes back. On the web (`vscode.dev`), there is no local file system - these flows are disabled (`"enablement": "!isWeb"` in package.json). We need a cloud-backed file system that works identically from the web.

## 2. Key Architectural Finding

The existing export/import code is **already file-system-agnostic**. These classes all use `vscode.workspace.fs` (the `vscode.FileSystem` API) with `vscode.Uri` - they never call Node.js `fs` directly:

- **`ItemDefinitionWriter`** (`extension/src/itemDefinition/ItemDefinitionWriter.ts`): Writes definition parts to a destination `vscode.Uri` using `this.fileSystem.writeFile()`. Constructor takes `vscode.FileSystem`.
- **`ItemDefinitionReader`** (`extension/src/itemDefinition/ItemDefinitionReader.ts`): Reads files from a root `vscode.Uri` using `this.fileSystem.readFile()` and `this.fileSystem.readDirectory()`. Constructor takes `vscode.FileSystem`.
- **`downloadAndSaveArtifact`** (`extension/src/artifactManager/localFolderCommandHelpers.ts`): Downloads definition via `artifactManager.getArtifactDefinition()`, writes it using `ItemDefinitionWriter`.
- **`copyFolderContents`** (`extension/src/artifactManager/localFolderCommandHelpers.ts`): Uses `vscode.workspace.fs.readDirectory()`, `vscode.workspace.fs.copy()`.
- **`importArtifactCommand`** (`extension/src/localProject/importArtifactCommand.ts`): Reads definition from folder via `ItemDefinitionReader`, publishes via `artifactManager.createArtifactWithDefinition()` or `updateArtifactDefinition()`.

**This means**: if we register a `FileSystemProvider` for an `onelake://` scheme, all these flows work with zero changes - they just operate on `onelake://` URIs instead of `file://` URIs.

## 3. OneLake DFS API

OneLake exposes an ADLS Gen2-compatible REST API at `https://onelake.dfs.fabric.microsoft.com`. The URL pattern for Lakehouse files:

```
https://onelake.dfs.fabric.microsoft.com/{workspaceId}/{lakehouseId}/Files/{path}
```

Operations map to standard ADLS Gen2 calls:

| VS Code FSP Method | OneLake DFS Operation |
|---|---|
| `stat` | `HEAD` on path |
| `readFile` | `GET` on file path |
| `writeFile` | `PUT ?resource=file` + `PATCH ?action=append&position=0` + `PATCH ?action=flush&position={len}` |
| `delete` | `DELETE` on path (with `recursive=true` query param for dirs) |
| `readDirectory` | `GET ?resource=filesystem&directory={path}&recursive=false` |
| `createDirectory` | `PUT ?resource=directory` |
| `rename` | Can be done but could be left as unsupported initially |

Authentication uses the same OAuth token the extension already has. The existing `FabricApiClient` (`extension/src/fabric/FabricApiClient.ts`) can make these calls - it's a wrapper around `@azure/core-rest-pipeline` that handles auth header injection. The Fabric scopes (`https://analysis.windows.net/powerbi/api/.default`) cover OneLake access.

**Note**: `FabricEnvironmentSettings` (`util/src/settings/FabricEnvironment.ts`) currently has `sharedUri` and `portalUri` but no OneLake URI. The PROD OneLake DFS endpoint is always `https://onelake.dfs.fabric.microsoft.com` but custom environments may differ.

## 4. Implementation Plan

### Step 1: Create `OneLakeDfsClient`

A helper class that wraps raw ADLS Gen2 REST calls. Uses `IFabricApiClient.sendRequest()` for all HTTP operations.

**Location**: `extension/src/onelake/OneLakeDfsClient.ts`

```typescript
export interface IOneLakeDfsClient {
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, content: Uint8Array): Promise<void>;
    deleteFile(path: string, recursive?: boolean): Promise<void>;
    listDirectory(path: string): Promise<{ name: string; isDirectory: boolean; contentLength: number }[]>;
    getProperties(path: string): Promise<{ contentLength: number; isDirectory: boolean; lastModified: Date } | undefined>;
    createDirectory(path: string): Promise<void>;
}
```

Key implementation details:
- `writeFile` is a three-step ADLS Gen2 operation: create file, append content, flush
- `listDirectory` parses the JSON response from the filesystem list API
- Binary content needs `streamResponseStatusCodes` for efficient handling
- The `sendRequest` call needs the raw token and custom `url` (not `pathTemplate`, since OneLake is a different base URL from the Fabric API)

### Step 2: Create `OneLakeFileSystemProvider`

A full `vscode.FileSystemProvider` implementation that delegates to `OneLakeDfsClient`.

**Location**: `extension/src/onelake/OneLakeFileSystemProvider.ts`  
**Scheme**: `onelake`

URI format: `onelake:///{workspaceId}/{lakehouseId}/{path}`

The provider:
- Parses URIs to extract workspace ID, lakehouse ID, and file path
- Translates VS Code FSP calls to `OneLakeDfsClient` calls
- Fires `onDidChangeFile` events after mutations
- Optional: in-memory read cache with short TTL to reduce API calls during rapid reads (e.g., when `ItemDefinitionReader` scans a directory)

### Step 3: Register the FSP

In extension activation, register the provider:

```typescript
const oneLakeProvider = new OneLakeFileSystemProvider(dfsClient, logger);
context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('onelake', oneLakeProvider, { isCaseSensitive: true })
);
```

### Step 4: Adapt `ILocalFolderService` for Web

**Location**: `extension/src/artifactManager/LocalFolderService.ts` (likely)

The `ILocalFolderService.getLocalFolder()` method currently shows a native folder picker. For web:
- Do not show a folder picker - destination is deterministic from configured OneLake storage + artifact metadata
- Return an `onelake://` URI instead of a `file://` URI
- The rest of the export flow (download, write, open) works unchanged

Web UX differences for PoC:
- User is prompted to choose **Open in current window** or **Open in new window** after download
- **Do nothing** is not offered in web flow
- User is not asked to remember folder location
- **Change local folder** is not available in web flow

### Step 5: Configuration

Add a setting for the target Lakehouse (PoC approach):

```jsonc
"Fabric.oneLakeStorage": {
    "workspaceId": "...",
    "lakehouseId": "..."
}
```

Later this could auto-detect the first Lakehouse in the user's workspace or provide a picker UI.

### Step 5a: Deterministic OneLake Destination Path (PoC)

To support multiple artifacts safely, keep storage identity and source artifact identity distinct:

- Storage identity (from config): `{storageWorkspaceId}`, `{storageLakehouseId}`
- Source identity (from artifact): `{sourceWorkspaceId}`, `{artifactType}`, `{artifactId}`

URI pattern for export target folder:

```text
onelake:///{storageWorkspaceId}/{storageLakehouseId}/fabric-definitions/{sourceWorkspaceId}/{artifactType}/{artifactId}/{displayName}.{artifactType}
```

Notes:
- `displayName.{artifactType}` is kept as the visible leaf folder to stay consistent with local-folder naming
- Unique identity does not depend on display name; identity is encoded by source workspace + type + artifact ID in parent path
- This avoids collisions and supports multi-artifact PoC storage in a single configured Lakehouse

### Step 6: Tests

- Unit tests for `OneLakeDfsClient` (mock the `IFabricApiClient`)
- Unit tests for `OneLakeFileSystemProvider` (mock the `IOneLakeDfsClient`)
- The existing `ItemDefinitionWriter` and `ItemDefinitionReader` tests should continue passing since they're already file-system-agnostic

## 5. Files You'll Need to Reference

| File | Why |
|------|-----|
| `extension/src/fabric/FabricApiClient.ts` | HTTP client for REST calls - reuse for OneLake DFS |
| `extension/src/itemDefinition/ItemDefinitionWriter.ts` | Writes definitions to `vscode.Uri` - uses `vscode.FileSystem` |
| `extension/src/itemDefinition/ItemDefinitionReader.ts` | Reads definitions from `vscode.Uri` - uses `vscode.FileSystem` |
| `extension/src/artifactManager/exportArtifactCommand.ts` | Export flow - calls `downloadAndSaveArtifact` |
| `extension/src/artifactManager/localFolderCommandHelpers.ts` | `downloadAndSaveArtifact`, `copyFolderContents`, folder action helpers |
| `extension/src/localProject/importArtifactCommand.ts` | Import flow - reads from folder, publishes to Fabric |
| `util/src/settings/FabricEnvironment.ts` | `FabricEnvironmentSettings` type - may need OneLake URI field |
| `util/src/settings/FabricEnvironmentProvider.ts` | Provides current environment config |
| `extension/src/workspace/DefinitionFileSystemProvider.ts` | Existing FSP for reference (different purpose but similar patterns) |
| `AGENTS.MD` | Codebase conventions (DI, layering, util-first helpers, testing) |

## 6. Codebase Conventions (from AGENTS.MD)

- **Layering**: API (contracts) -> Util (helpers) -> Extension (VS Code behaviors). New helpers that could be reused belong in `util`, not `extension`.
- **DI**: Uses `@wessberg/di`. Keep constructors slim.
- **Error handling**: Use `FabricError`, `withErrorHandling`, `doFabricAction` from util.
- **Telemetry**: Use `TelemetryService`, `TelemetryActivity` from util.
- **Testing**: moq.ts for mocks, sinon for stubs, mocha runner, assert.
- **Build**: `npm run compile` (all), `npm run test:unit -w extension` (unit tests).
- **Localization**: `%extension.*%` keys in `package.nls.json`. Run `npm run localization -w extension` after string changes.
- **Comment style**: Use '-' not '—' in comments.

## 7. Questions Already Answered

- **Push timing**: Not yet decided. Options are push-on-save (every save publishes to Fabric API) vs. explicit publish (save only writes to OneLake, user manually publishes). This is independent of the FSP implementation.
- **Lakehouse selection**: Start with manual configuration setting (PoC), evolve to auto-detect or picker later.
- **Web support**: OneLake DFS is standard HTTPS REST - works from `vscode.dev` with no local filesystem dependency.
- **Conflict handling**: Last-writer-wins for PoC. Real conflict resolution would need ETags.

## 8. What This Does NOT Include

- The `fabric-definition://` FSP enhancements (inline tree-view editing, create/delete commands) - that's separate work on the `dev/mwade/workspace-virtual-folder-azure-poc` branch
- Virtual workspace folders added to VS Code Explorer
- Any changes to the Fabric tree view

## 9. Phase 1 PoC Checklist (Compact)

Use this as the execution checklist for a minimal proof-of-concept.

- [ ] Keep scope to web import/export via `onelake://` only (no tree-view or virtual workspace work)
- [ ] Add minimal OneLake DFS client in `extension/src/onelake/OneLakeDfsClient.ts`
- [ ] Implement only required operations: `readFile`, `writeFile`, `readDirectory`, `stat`, `createDirectory`, `delete`
- [ ] Add `OneLakeFileSystemProvider` in `extension/src/onelake/OneLakeFileSystemProvider.ts`
- [ ] Support core FSP methods needed by existing flows; return `NotSupported` for `rename`
- [ ] Register `onelake` provider during extension activation
- [ ] Add minimal config for PoC target (`workspaceId`, `lakehouseId`) and use a fixed/default OneLake DFS endpoint
- [ ] Update web local-folder path to return `onelake://` URI from config
- [ ] Use deterministic destination path: `fabric-definitions/{sourceWorkspaceId}/{artifactType}/{artifactId}/{displayName}.{artifactType}`
- [ ] In web flow, offer only: Open in current window / Open in new window (no Do nothing)
- [ ] In web flow, skip remember-location prompt and disable Change local folder
- [ ] Keep existing export/import orchestration unchanged; route through `vscode.workspace.fs`
- [ ] Manual smoke test only: export -> edit -> import using `onelake://`

### Deferred Until After PoC

- Automated tests
- Telemetry instrumentation
- Advanced error handling/retry policy and detailed error taxonomy
- Conflict resolution (ETags), caching, and performance tuning
- Environment-specific OneLake endpoint discovery
- Lakehouse picker UX and auto-detection
