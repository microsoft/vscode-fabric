# RFC 007: Persist and Restore Remote Workspace Tree Expansion State

## Summary

Persist and restore the expand/collapse state of the Microsoft Fabric “Remote Workspaces” tree view (`vscode-fabric.view.workspace`) across VS Code restarts. Achieve this primarily by assigning stable `TreeItem.id` values to all nodes so VS Code’s built‑in view state can restore expansion automatically. Optionally, persist a lightweight, top‑level expansion state in the extension’s settings for a flicker‑free startup. Keep a full explicit persist/restore path as a fallback only if deeper restoration is needed.

## Background

Current behavior does not retain expansion state after reload because nodes are reconstructed without stable identifiers and no view state is stored. The tree is provided by `FabricWorkspaceDataProvider` with the following structure:

- Root: `RootTreeNode` (displays “Microsoft Fabric”)
- Optional Tenant: `TenantTreeNode` (if a tenant is selected)
- Workspaces: `ListViewWorkspaceTreeNode` or `TreeViewWorkspaceTreeNode` (depending on display style)
- Artifact groups (Tree style): `ArtifactTypeTreeNode`
- Artifacts: `ArtifactTreeNode`

There is no persisted view state today. `TreeViewState.needsUpdate` triggers re-fetching but does not address UI state.

## Goals

- Preserve user expand/collapse across VS Code restarts and extension reloads
- Keep solution robust across environments/tenants/switches
- Minimize code changes and complexity
- Avoid noticeable flicker at startup where practical

## Non‑Goals

- Persist selection or scroll position
- Persist local projects view expansion (this RFC focuses on remote workspaces)
- Change data loading behavior beyond what’s needed to restore expansion

## Proposal

### Option A (Primary): Stable `TreeItem.id` for Built‑In Restoration

Assign durable, unique `id` values to every node. VS Code uses `TreeItem.id` to restore view state automatically across sessions for the same view.

Proposed ID schema (examples):

- Root: `root`
- Tenant: `tenant:${tenantId}`
- Workspace: `ws:${env}:${tenantIdOrNone}:${workspaceId}`
- Artifact group (Tree style): `grp:${env}:${tenantIdOrNone}:${workspaceId}:${artifactType}`
- Artifact: `art:${env}:${tenantIdOrNone}:${workspaceId}:${artifactType}:${artifactId}`

Key points:

- Include environment and tenant to avoid collisions when switching contexts
- Artifact nodes already carry `artifact.fabricEnvironment`, `artifact.workspaceId`, `artifact.type`, `artifact.id` (available to build stable IDs)
- For Tree style, pass `workspaceId` to `ArtifactTypeTreeNode` so the group’s ID is stable
- For List style, artifact nodes still need stable IDs; no group node exists

Changes at a glance (illustrative):

- `RootTreeNode`: set `this.id = 'root'`
- `TenantTreeNode`: set `this.id =`tenant:${tenant.tenantId}`
- `ListViewWorkspaceTreeNode`/`TreeViewWorkspaceTreeNode`: set `this.id =`ws:${env}:${tenantIdOrNone}:${workspace.objectId}`
- `ArtifactTypeTreeNode`: accept `workspaceId` in ctor; set `this.id =`grp:${env}:${tenantIdOrNone}:${workspaceId}:${artifactType}`
- `ArtifactTreeNode` (in `api`): set `this.id =`art:${artifact.fabricEnvironment}:${artifact.workspaceId}:${artifact.type}:${artifact.id}`

Implementation notes:

- Provide `env` and `tenantId` via constructor parameters or a shared “id context” object passed from the provider at node creation time
- Keep IDs stable across refreshes while the logical entity remains the same
- No additional persistence is required; VS Code handles expansion state

Pros:

- Minimal code, leverages VS Code capabilities
- Works across reloads with no bespoke storage

Cons:

- Requires careful ID design and propagation of `env`/`tenantId`
- If node hierarchy changes significantly between sessions, built‑in restoration can be partial

### Option C (Hybrid): Top‑Level Expansion in Extension Settings

Persist just the top‑level intent (workspace expanded, and in Tree style which artifact groups are expanded) for a flicker‑free startup. Use existing `IFabricExtensionsSettingStorage` scoped by environment and tenant.

Storage shape (example):

```ts
interface IFabricViewState {
  // Expanded workspaces by env/tenant
  expandedWorkspaces: string[]; // [ws:${env}:${tenant}:${wsId}, ...]
  // In Tree style, expanded artifact groups per workspace
  expandedGroupsByWorkspace: { [workspaceKey: string]: string[] };
}
```

Behavior:

- On node creation, set `collapsibleState` to `Expanded` when its ID is present in stored state; otherwise `Collapsed`
- Hook `onDidExpandElement`/`onDidCollapseElement` to update storage and `await storage.save()`
- Bump `fabricWorkspaceSettingsVersion` as needed

Pros:

- Very simple runtime behavior, minimal UI flicker
- Integrates with existing settings storage model

Cons:

- Only restores top‑level and artifact‑group expansion (not deep per‑artifact child nodes)
- Still benefits from stable IDs for consistency

### Option B (Fallback): Explicit Persist/Restore + `reveal()`

For full control (including deeper levels), persist the set of expanded node IDs in `context.globalState` and programmatically restore them via `treeView.reveal(node, { expand: true })` after data loads.

Behavior:

- Listen to `onDidExpandElement`/`onDidCollapseElement` and maintain a per‑context set of expanded IDs
- After initial population, iterate saved IDs and call `reveal` to expand nodes
- Requires an accurate `getParent()` for all node types so the workbench can traverse ancestors

Pros:

- Deterministic deep restore

Cons:

- More code and edge‑case handling (timing, throttling, hierarchy changes)
- Sensitive to correctness of `getParent()` implementations

## Recommendation

1) Implement Option A (Stable IDs) first. This is the lowest complexity solution and often sufficient for robust persistence across reloads.

2) If we observe undesirable startup flicker or VS Code’s built‑in restore is insufficient for our UX goals, add Option C for a lightweight, top‑level persisted state (workspace and artifact‑group expansion). Keep IDs from Option A.

3) Use Option B only if we need precise, deep restoration beyond what A/C provide. This requires validating `getParent()` for all nodes.

## Implementation Plan

Phase 1 — Stable IDs

- Add `id` to nodes listed below and plumb `env`/`tenantId` where needed
  - `extension/src/workspace/treeNodes/RootTreeNode.ts`
  - `extension/src/workspace/treeNodes/TenantTreeNode.ts`
  - `extension/src/workspace/treeNodes/ListViewWorkspaceTreeNode.ts`
  - `extension/src/workspace/treeNodes/TreeViewWorkspaceTreeNode.ts`
  - `extension/src/workspace/treeNodes/ArtifactTypeTreeNode.ts` (new `workspaceId` param)
  - `api/src/treeView.ts` (`ArtifactTreeNode` ctor sets `id`)
- Provide an “ID context” object `{ env, tenantId?: string }` from `FabricWorkspaceDataProvider` to node constructors
- Validate no collisions across environment/tenant switches

Phase 1b — Verify Built‑In Restore

- Manual: expand some nodes, reload window (Developer: Reload Window), confirm expansion persists
- UI test (optional): assert persisted expansion across activation cycles

Phase 2 (Optional) — Top‑Level State in Settings

- Extend `IFabricExtensionSettings` with `viewState` (see Option C)
- Update `FabricExtensionsSettingStorage` to read/write `viewState` per env/tenant; bump `fabricWorkspaceSettingsVersion`
- Wire `onDidExpandElement`/`onDidCollapseElement` in `extension.ts` to keep settings in sync
- Set initial `collapsibleState` based on stored state during node construction

Phase 3 (Fallback) — Explicit Reveal‑Based Restore

- Persist expanded IDs in `context.globalState` keyed by `viewId + env + tenant + displayStyle`
- Maintain an ID→node map during `getChildren()` population to support `reveal()`
- Ensure `getParent()` returns accurate parents for all nodes

## Notes on `getParent()`

Explicit reveal (Option B) depends on correct `getParent()` for all node types. Current implementation has gaps:

- `ArtifactTypeTreeNode` should return its owning `WorkspaceTreeNode`, not the root
- `ArtifactTreeNode` needs a reliable way to find its parent (workspace or artifact group depending on display style); current code path does not return a value

If Option B is pursued, fix `getParent()` accordingly and/or maintain an ID→node index inside the provider to resolve parents reliably.

## Risks & Mitigations

- ID collisions across env/tenant: include `env` and `tenantId` in IDs
- Workspace rename: use immutable IDs (objectId), not names
- Hierarchy changes between sessions: partial restore is acceptable; Option B can fully restore if required
- Performance and flicker: Option C can provide flicker‑free top‑level restoration

## Success Metrics

- Expansion state persists across reloads for typical scenarios (tenant selected or not)
- No ID collisions observed when switching tenants or environments
- Minimal UI flicker on startup (with Option C enabled if needed)
- No regressions in tree interactions (refresh, create/delete items)

## Alternatives Considered

- Persist everything only via explicit reveal: more control but more complexity; reserved as fallback (Option B)
- Do nothing: status quo with poor UX on reload

## Open Questions

- Do we also want to persist the Local Projects view expansion state? (Out of scope here)
- Should we include display style in IDs? Not required; VS Code maintains per‑view state, but Option C storage should key by style to avoid confusion switching styles

---

## Implementation Notes

- We started with Option A (stable `TreeItem.id`) and verified it preserved expansion on refresh, but it did not reliably persist across full restarts, especially in tenant-selected scenarios. This aligns with VS Code docs that mention refresh behavior but don’t guarantee restart persistence.
- Per the Recommendation, we proceeded with Option C. The settings-backed approach is now working as expected across restarts.
- Code locations of interest:
  - Stable ids (Option A):
    - `extension/src/workspace/treeNodes/RootTreeNode.ts`, `TenantTreeNode.ts`, `ListViewWorkspaceTreeNode.ts`, `TreeViewWorkspaceTreeNode.ts`, `ArtifactTypeTreeNode.ts`
    - `api/src/treeView.ts` (`ArtifactTreeNode`)
  - Settings-backed expansion (Option C):
    - Schema: `extension/src/settings/definitions.ts` (added `viewState`, version bump)
    - Storage: `extension/src/settings/FabricExtensionsSettingStorage.ts`
    - DRY helpers: `extension/src/workspace/viewExpansionState.ts`
      - `makeShouldExpand(...)` to set initial `collapsibleState`
      - `recordExpansionChange(...)` to persist expand/collapse
    - Provider wiring: `extension/src/workspace/treeView.ts` (uses `makeShouldExpand`)
    - Activation wiring: `extension/src/extension.ts` (persists via `recordExpansionChange` on expand/collapse)
- Scoping: View state is keyed by `${env}:${tenant}` (display style removed). Tenant/workspace expansion is shared across styles; artifact-group expansion (Tree-only) is stored but ignored in List mode.

## Future Considerations

- Artifact-node persistence: Consider persisting expansion for artifact nodes (children within groups) at least for the node itself (not their children). Currently satellites are responsible for their own deeper state, which may be acceptable, but a unified core baseline could improve consistency.
- Optional style-specific workspaces: If desired, reintroduce style partitioning just for workspace expansion and/or make it a user setting.
- Deep restore (Option B): If required, complete `getParent()` for all nodes and implement reveal-based restoration for deterministic deep expansion across restarts.
- Extend to Local Projects: Apply the same pattern for the local projects tree for parity.
