# AI Assistant Instructions (Core Fabric Extension)

**Audience**: Contributors modifying the core extension (`extension`) and shared packages (`api`, `util`).  
**Emphasis**: Safe core evolution, API contract stewardship, maximal reuse of `@microsoft/vscode-fabric-util`, and strict adherence to the project constitution (v1.2.0).

**Constitution Reference**: Load `.specify/memory/constitution.md` **BEFORE** making any changes. All modifications MUST be cross-referenced against constitutional principles.

<tool_calling>
You have the capability to call multiple tools in a single response. For maximum efficiency, whenever you need to perform multiple independent operations, ALWAYS invoke all relevant tools simultaneously rather than sequentially. Especially when exploring repository, reading files, viewing directories, validating changes or replying to comments.
</tool_calling>

## 1. Core Architecture (Mental Model)

**Layers**: API (contracts only) → Util (cross‑cutting helpers) → Core (VS Code behaviors & DI wiring). Satellites consume API+Util but must never depend on core internals.

**Key Services**:
- `IFabricExtensionManager`: Single public export providing service access + extension registration. Keep minimal; resist feature creep.
- `accountManager`: Authentication context and token management.
- `workspaceManager`: Workspace + item listing/caching.
- `artifactManager`: CRUD + definition materialization + workflow orchestration.

**Artifact Workflows**: Core delegates to `IArtifactHandler` if present; otherwise `DefaultArtifactHandler`. Handlers implement optional granular workflow objects—avoid broad "legacy" hooks.

## 2. Constitutional Principles

**CRITICAL**: Before any contribution, load and review `.specify/memory/constitution.md` in full. The summary below highlights key principles, but the constitution document is the authoritative source.

All contributions must align with the project constitution:

- **Constructor-Injected Services**: Resolve dependencies through `@wessberg/di` container; pass via constructors. Never instantiate collaborators with `new` inside implementation code. Register services once per package entry point.
- **Test-First Discipline**: Write failing tests before implementation. Use `moq.ts` for unit tests; reserve `sinon` for cases Moq cannot handle. Integration tests must use `FakeFabricApiClient` + `VSCodeUIBypass` (RFC 006) for full automation.
- **Satellite-Friendly Reuse**: Shared behavior lives in `util` (implementations) or `api` (contracts). The API package exposes only types/enums/test hooks needed for extensibility. Util helpers must be isolated (no extension imports) and unit tested.
- **VS Code Native UX First**: Favor built-in VS Code UI primitives (commands, tree views, quick picks, input boxes) before proposing custom WebViews. Any WebView usage must document why native UX was insufficient and include an accessibility plan. UI flows must respect localization/l10n assets and work within standard VS Code themes.
- **Extensibility Contracts Are Sacred**: Public APIs exported from `@microsoft/vscode-fabric-api` define the contract for satellites and must remain backward compatible unless a coordinated major release is scheduled. Breaking changes must ship with deprecation paths, migration guidance, and test coverage.
- **Tree View Stewardship**: Remote (Fabric workspace) and local project trees are primary UX surfaces. Preserve responsiveness, lazy loading, telemetry, and extensibility. Document node structure changes and accessibility impacts in PRs.

## 3. API Package Discipline (`@microsoft/vscode-fabric-api`)

Treat as sacred public surface. Before modifying any interface:

1. **Can you use an optional workflow hook instead?** Prefer additive patterns over signature changes.
2. **Will satellites break?** Search for usage; assume unknown external consumers.
3. **Adding?** Use optional properties or new interfaces. **Removing/renaming?** Require deprecation warnings, migration docs, and version notes.
4. **Definition mutations?** Update `doc/extensibility-overview.md` and samples.

API changes must ship with backwards-compatible plans: deprecation paths, shims, and coordination windows before breaking releases.

## 4. Util Package Usage (`@microsoft/vscode-fabric-util`)

**Always check `util/src` before writing new helpers.** Existing utilities:

- **Telemetry**: `TelemetryService`, activity helpers. Don't embed telemetry in core managers.
- **Errors**: `FabricError`, `withErrorHandling`, `doFabricAction` for consistent UX & telemetry classification.
- **Logging**: Provided logger utilities (no ad‑hoc `console.log`).
- **URI & Content**: `FabricUriHandler`, zip utilities, `MemoryFileSystem`.
- **Config**: `ConfigurationProvider`, `FabricEnvironmentProvider`.

If a helper benefits core + satellites, add it to util (not core). Never duplicate util logic inside the extension; pull it up instead.

## 5. Build / Test Workflow

**Commands** (root orchestrates sequencing):
- **Build**: `npm run build` | **Bundle**: `npm run package` | **VSIX**: `npm run vsix -w extension`
- **Watch**: Run task `Watch All` (per‑package watch + test watchers)
- **Tests**: `npm run test:unit` (all packages) | `test:integration -w extension` | `test:e2e -w extension` | `test:ui -w extension` (requires `VSCODE_FABRIC_ENABLE_TEST_FAKES=true`)
- **Linting**: `npm run lint:check` (validate) | `npm run lint` (auto-fix)
- **Localization**: `npm run localization -w extension` (export new strings)
- **Clean**: `npm run clean --ws` | **Hard reset**: `npm run clean:all && npm install`

**Pre-flight checks before PR submission**:
```bash
npm run build           # Verify compilation
npm run lint:check      # Confirm style compliance
npm run test:unit       # Run unit tests
npm run test:integration -w extension  # Integration coverage
npm run localization -w extension      # If strings changed
```

## 6. Testing Strategy

**Test Pyramid**: Prefer unit tests (fast, isolated) > integration tests > UI tests (slow, brittle).

**Unit Tests**:
- Use `moq.ts` for mocking; avoid `sinon` unless needed for timers/spies.
- Structure: Arrange-Act-Assert with Mocha lifecycle hooks.
- File naming: `{component}.unit.test.ts` in appropriate `test/` directories.

**Integration Tests**:
- Combine `FakeFabricApiClient` + `VSCodeUIBypass` to automate HTTP and UI prompts.
- Keep real business logic; intercept only external dependencies.
- Document why E2E/UI tests are needed if lower layers cannot validate the scenario.

**Coverage**: Unit and integration tests contribute; UI tests do not.

## 7. Coding Conventions

**Dependency Injection**:
- Use `@wessberg/di` exclusively; keep constructors slim; no static singletons.
- Minimize `IFabricExtensionManager` surface—don't add telemetry/logging shortcuts.

**Workflow Hook Rule**:
- When mutating `definition`, also update `options.body.definition` to keep REST payloads consistent.

**Localization**:
- Only add `%extension.*%` keys; run localization export before committing new strings.

**Security & Best Practices**:
- **No secrets in code**: Use environment variables or secure storage.
- **Input validation**: Always validate file paths, URIs, and API payloads.
- **Error handling**: Use `FabricError` from util; never expose internal errors to users.
- **Dependencies**: Add new dependencies only if absolutely necessary.
- **Copyright headers**: All new source files must include Microsoft copyright headers (use `tools/Add-CopyrightHeaders.ps1`).

**Coupling Avoidance**:
- Core must not import satellite implementations (internal satellites in `internalSatellites/` are examples only).
- Util must not import extension code.

## 8. Common Pitfalls

- Forgetting to update `options.body.definition` after mutating a definition → stale upload.
- Adding broad "onBeforeRequest" style hooks—prefer targeted workflow hook additions.
- Introducing util‑like helpers inside core → harder for satellites to reuse; move to util early.
- Expanding API contracts with implementation types → breaks layering & increases churn.
- Missing `VSCodeUIBypass` in integration tests → hangs automation.
- Leaving tree view telemetry or accessibility gaps when adding new node types.

## 9. Tree View Stewardship

The Fabric workspace (remote) tree view and local project tree view are **primary user surfaces**. Changes must preserve:

**Performance & Behavior**:
- Lazy loading of child nodes (avoid loading entire workspace on expansion).
- Responsive refresh operations (use incremental updates, not full tree rebuilds).
- Proper error handling with user-visible messages and telemetry.

**Testing & Telemetry Requirements**:
- New tree nodes MUST include telemetry for user actions (expand, click, context menu).
- Regression tests MUST cover happy path, filtered states, and empty workspace scenarios.
- Document node structure changes in PR descriptions.

**Extensibility**:
- Refresh commands, node providers, and iconography MUST remain consistent.
- Satellites must be able to extend views without core regressions.
- Tree item context values and command URIs form the extension contract.

**Accessibility**:
- All tree items MUST have descriptive labels and tooltips.
- Context menu commands MUST be keyboard accessible.
- Document accessibility impacts for structural changes.

**Rationale**: Tree views are where Fabric developers spend most time; protecting their performance and extensibility keeps the experience dependable.

## 10. Versioning & Change Management

**Semantic Versioning**:
- Even during preview (`0.x`), avoid breaking removals without deprecation comments + CHANGELOG entries.
- API/util redist: run `prebuild-redist` → `build-redist`; verify `lib/` is current before publishing.

**Change Workflow**:
- **Issue-driven**: Discuss scope and approach in an issue before coding.
- **Small changes**: Make minimal, focused edits. Large refactors require RFC discussion.
- **Documentation**: Update `docs/` if API or architecture changes.
- **Satellite impacts**: Explicitly document; provide sample code or shims for migration periods.

## 11. Satellite Context (Minimal Need-to-Know)

Satellites plug in via `addExtension()` supplying handlers/providers. Core changes must preserve backward behavior when satellites are absent (graceful fallback to defaults). Avoid forcing satellite changes unless enabling new optional capabilities.

## 12. Debugging & Troubleshooting

- **VS Code debugging**: Use "Run Extensions (🌳Root)" launch configuration.
- **Build issues**: Run `npm run clean:all && npm install` for hard reset.
- **Test failures**: Network issues in sandboxed environments are expected (VS Code download problems).
- **Breakpoints**: Rebuild (`npm run build`) before debugging; verify source maps.

## 13. Repository Structure Context

This is an npm workspaces monorepo:
- `extension/` – Core VS Code extension with runtime logic.
- `api/` – Published TypeScript contracts for satellite extensions.
- `util/` – Shared utilities for core and satellites.
- `docs/` – Architecture docs, RFCs, contributor guides.
- `tools/` – Build scripts and automation.
- `localization/` – Localization configuration.

Supporting docs: `docs/developer-quickstart.md`, `docs/architecture-overview.md`, `docs/extensibility-overview.md`.

## 14. Quick Reference

**Common Commands**:
```bash
npm run build
npm run test:unit -w extension
npm run test:integration -w extension
npm run test:ui -w extension
npm run vsix -w extension
```

**Constitution Workflow**:
1. **Load First**: Read `.specify/memory/constitution.md` before making changes.
2. **Cross-Reference**: For each change, identify which constitutional principles apply.
3. **Document Compliance**: In PRs, explicitly state how changes align with constitutional principles.
4. **Flag Conflicts**: If a change conflicts with the constitution, document why and propose an amendment.

**Governance**: This guidance aligns with the project constitution (v1.2.0) at `.specify/memory/constitution.md`. Maintainers verify compliance during reviews; violations require changes before merge.
