# Developer Quickstart

Fastest path to cloning, building, debugging, and contributing to this monorepo.

---

## 1. TL;DR (First Time Setup)

```bash
git clone <your-fork-or-clone-url>
cd vscode-fabric-pr
npm install            # installs root + all workspaces (extension, api, util)
npm run build          # builds api, util, then extension
npm test               # runs all workspace test scripts
npm run vsix -w extension   # (optional) produce a local .vsix package
```

Open the repo in VS Code and launch the "Run Extensions (🌳Root)" launch config to debug.

---

## 2. Repository Layout

This is an npm workspaces monorepo:

- `extension` – core VS Code extension (runtime + activation logic)
- `api` – published TypeScript API contracts used by external/satellite extensions
- `util` – shared implementation utilities (telemetry, logging, helpers) reused by extension & satellites

Supporting folders:

- `docs/` – architecture, RFCs, contributor documentation
- `tools/` – scripts & automation helpers
- `localization/` – localization project configuration

See the architecture overview: `docs/architecture-overview.md` (case-sensitive path fixed) and RFCs in `docs/rfc/` for deeper design context.

---

## 3. Prerequisites

Required:

- Node.js (LTS recommended) & npm 8+ (workspace support)
- Git
- VS Code (for debugging & authoring)

Optional / situational:

- Docker + Dev Containers extension (for reproducible environment)
- Access to Microsoft Fabric resources (for end-to-end scenarios when signed in)

---

## 4. Core Commands & Scripts

All commands below are executed from the repository root unless noted.

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Build everything | `npm run build` |
| Watch (all workspaces) | `npm run watch` |
| Run all tests | `npm test` (alias to `npm run test:unit` / additional integration tasks may be run separately) |
| Unit tests only | `npm run test:unit` |
| Extension integration tests | `npm run test:integration -w extension` |
| Extension e2e tests | `npm run test:e2e -w extension` |
| UI (UITest) tests | `npm run test:ui -w extension` |
| Lint check | `npm run lint:check` |
| Auto-fix lint issues | `npm run lint` |
| Build production bundle (.vsix) | `npm run vsix -w extension` |
| Clean build artifacts | `npm run clean` |
| Deep clean (incl node_modules) | `npm run clean:all` |

Notes:

- The previous docs referenced `npm run compile` / `npm run package` / formatting scripts (`format`, `format:check`) which do not exist; these have been removed.
- `vsix` bundles the extension and produces a `.vsix` for side-loading. The build step is implicit in that script.

---

## 5. Development Workflows

### Command-line Loop

```bash
npm install
npm run build
npm run watch        # optional: incremental rebuilds (tsc / webpack per package)
npm run test:unit    # fast inner-loop
npm run test:integration -w extension   # when validating VS Code behaviors
```

### VS Code Loop

1. Open the repository root (or the multi-root workspace file `/.vscode/vscode-fabric.code-workspace`).
2. Run the build task (or let the watch tasks run if configured).
3. Use the provided launch configuration: "Run Extensions (🌳Root)" to start a VS Code Extension Host with the built extension.
4. Set breakpoints inside `extension/src` (or supporting packages); changes require rebuild or watch.

### Single-Folder Workspace Option

You can also open just `extension/`, `api/`, or `util/` for narrower focus. Test discovery is typically faster in single-folder mode.

---

## 6. Debugging

The "Run Extensions (🌳Root)" configuration launches an Extension Host including all built outputs. Ensure you have run a build (or have watch running) before launching to avoid stale code.

Common tips:

- If breakpoints are not hit, confirm source maps exist and the file was rebuilt (re-run `npm run build`).
- Use the VS Code "Developer: Open Webview Developer Tools" or built-in logs for deeper inspection.

---

## 7. Testing Strategy

Test types (Mocha-based):

- Unit (`test:unit`) – logic-level tests (api/util + some extension pieces) without launching a real VS Code window when possible.
- Integration (`test:integration` in `extension`) – spins up VS Code to validate activation & behaviors.
- E2E / UI (`test:e2e`, `test:ui`) – higher fidelity scenarios and UI-driven interactions (may be slower).

Recommendations:

- Run unit tests frequently; run integration/e2e before pushing.
- If a VS Code download/version mismatch causes a failure, close all VS Code windows and re-run the failing script (fresh download resolves most transient issues).

---

## 8. Code Quality & Linting

Use `npm run lint:check` to see issues, `npm run lint` to auto-fix where possible. Keep PRs green by running lint locally before pushing.

There is currently no repository-wide automated format script beyond ESLint's autofix; if consistent formatting enforcement is desired, consider adding Prettier or an ESLint formatting config in a future change.

---

## 9. Dev Container (Optional)

The repo includes a dev container configuration enabling a consistent, pre-configured environment.

Prerequisites:

- VS Code
- Docker (Desktop or CE)
- Dev Containers extension

To use:

1. Open the repository in VS Code.
2. When prompted, choose "Reopen in Container".
3. Wait for the container build (first run can take several minutes).
4. Run `npm install` (if not automated) and proceed with normal build/debug steps.

---

## 10. Contributing & Further Reading

Recommended next docs:

- `docs/architecture-overview.md` – layered architecture & service design
- `docs/extensibility-overview.md` – API & satellite extension guidance
- `docs/dependency-injection.md` – DI container patterns
- `docs/rfc/` – design evolution & rationale

See also: CONTRIBUTING.md at the repo root for contribution policies.

---

## 11. Troubleshooting Quick Reference

| Issue | Action |
|-------|--------|
| VS Code tests fail to download/extract | Close all VS Code windows and re-run the test script |
| Breakpoints not hit | Rebuild (`npm run build`), ensure launching correct out/ dist paths |
| Stale types after API/util change | Run full root build again |
| Missing dependency error | Run `npm install` at root (workspaces hoist deps) |
| Need local VSIX | `npm run vsix -w extension` |

---

Happy building!
