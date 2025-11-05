# AI Assistant Instructions (Core Fabric Extension)

Audience: Contributors modifying the core extension (`extension`) and shared packages (`api`, `util`). Emphasis: safe core evolution, API contract stewardship, and maximal reuse of `@microsoft/vscode-fabric-util`.

## 1. Core Architecture (Mental Model)

- Layers: API (contracts only) → Util (cross‑cut helpers) → Core (VS Code behaviors & DI wiring). Satellites consume API+Util; they must not depend on core internals.
- Core surfaces a single public export: `IFabricExtensionManager` (service access + extension registration). Keep this minimal; resist feature creep (see RFC_002 for telemetry rationale).
- Service collection triad: `accountManager` (auth context), `workspaceManager` (workspace + item listing/cache), `artifactManager` (CRUD + definition materialization + workflow orchestration).
- Artifact workflows: Core delegates to an `IArtifactHandler` if present; otherwise `DefaultArtifactHandler`. Handlers implement optional granular workflow objects (avoid adding new broad “legacy” hooks).

## 2. When Editing API Contracts (`api`)

Treat as public surface. Before changing an interface:

1. Can the behavior be achieved via a new optional workflow hook instead of modifying an existing signature?
2. Will satellites break? (Search for symbol usage in repo; assume unknown external usage.)
3. If adding: prefer additive optional properties / new interfaces. If removing/renaming: require version note + deprecation path.
4. Mirror definition mutations: if guidance changes (e.g., new required field) document in `doc/extensibility-overview.md` and update samples.

## 3. Util Package Usage (Prefer Reuse)

Always check `util/src` before introducing new helpers:

- Telemetry: `TelemetryService`, activity helpers. Don’t embed telemetry plumbing in core managers.
- Errors: `FabricError`, `withErrorHandling`, `doFabricAction` for consistent UX & telemetry classification.
- Logging: Provided logger utilities (avoid ad‑hoc `console.log`).
- URI & content: `FabricUriHandler`, zip utilities, `MemoryFileSystem`.
- Config & environment: `ConfigurationProvider`, `FabricEnvironmentProvider`.
  If a new helper would aid both core & satellites, add it to util (not core) and keep API free of implementation types.

## 4. Build / Test Workflow

Commands (root orchestrates sequencing):

- Build all: `npm run compile` | Production bundle: `npm run package` | VSIX: `npm run vsix -w extension`.
- Watch (code + tests): run task `Watch All` (spawns per‑package watch + test watchers).
- Tests: `npm run test` (aggregate). Core‑specific depth: `test:unit`, `test:integration`, `test:e2e`, `uitest` (needs `VSCODE_FABRIC_ENABLE_TEST_FAKES=true`).
- Localization export after string changes: `npm run localization -w extension`.
- Clean: `npm run clean --ws`; hard reset: `npm run clean-node-modules && npm install`.

## 5. Coding Conventions (Core)

- Dependency Injection: use `@wessberg/di`; keep constructors slim; avoid static singletons.
- Minimize surface of `IFabricExtensionManager`—do not add telemetry/logging convenience; rely on util patterns.
- Workflow Hook Rule: mutate `definition` → also update `options.body.definition` to keep REST payload consistent.
- Avoid coupling: core files must not import satellite implementation classes (internal satellites live under `internalSatellites/` and are treated as examples/plugin modules).
- Localization: only add `%extension.*%` keys; run export before committing if new keys. Do not add any translations, these are handled externally.

## 6. Common Pitfalls

- Forgetting to update `options.body.definition` after mutating a definition → results in stale upload.
- Adding broad “onBeforeRequest” style hooks—prefer targeted workflow hook additions.
- Introducing util‑like helpers inside core (harder for satellites to reuse). Move them to util early.
- Expanding API contracts with implementation types (breaks layering & increases downstream churn).

## 7. Versioning & Change Management

- Preview semver (`0.x`) still requires discipline: avoid breaking field/interface removals without deprecation comment + CHANGELOG note.

## 8. Quick Reference Commands

`npm run compile` | `npm run test:unit -w extension` | `npm run test:integration -w extension` | `npm run uitest -w extension` | `npm run vsix -w extension`

## 9. Satellite Context (Minimal Need-to-Know)

Satellites plug in via `addExtension()` supplying handlers/providers. Core changes must preserve backward behavior for absent satellites (graceful fallback to defaults). Avoid requiring satellites to change unless enabling a new optional capability.
