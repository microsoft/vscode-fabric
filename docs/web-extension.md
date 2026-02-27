# Web Extension Support

The extension runs in both desktop (Node.js) and web (browser) environments such as vscode.dev and github.dev.

## Build Configuration

Webpack produces two bundles from `extension/webpack.config.js` (exported as an array of configs named `node` and `web`):

| | Desktop (`node`) | Web (`web`) |
|---|---|---|
| `target` | `node` | `webworker` |
| `entry` | `./src/extension.ts` | `./src/web/extension.ts` |
| `output.path` | `dist/` | `dist/web/` |
| `__IS_WEB__` | `false` | `true` |

The `package.json` declares both entry points:
```json
{
  "main": "./dist/extension.js",
  "browser": "./dist/web/extension.js"
}
```

Build commands:
```bash
npm run build -w extension         # both bundles
npm run build:node -w extension    # node only
npm run build:web -w extension     # web only
npm run watch:node -w extension    # node watch mode
npm run watch:web -w extension     # web watch mode
```

## Compile-Time Constants

The `__IS_WEB__` constant is injected by webpack's DefinePlugin:
- `true` when building for web (webworker target)
- `false` when building for desktop (node target)

Use this for conditional code that should be tree-shaken at build time:
```typescript
if (!__IS_WEB__) {
    // Desktop-only code - excluded from web bundle
}
```

The constant is declared in `extension/src/global.d.ts` for TypeScript support.

## Web-Specific Implementations

The web entry point (`extension/src/web/extension.ts`) mirrors the desktop entry point but swaps in web-compatible implementations via the DI container. Everything else — auth, workspace manager, artifact manager, tree views, telemetry — shares the same implementation across both targets.

| Interface | Desktop Implementation | Web Implementation | Why |
|-----------|----------------------|-------------------|-----|
| `IGitOperator` | `GitOperator` (uses child_process) | `WebGitOperator` (no-op) | `child_process` unavailable in browser |
| `ILocalFolderManager` | `LocalFolderManager` (uses os.homedir) | `WebLocalFolderManager` (no-op) | `os.homedir()` unavailable in browser |

The `composeContainer()` function at the bottom of the web entry point is the canonical reference for what is wired differently.

## Key Patterns

### File Operations
Use `vscode.workspace.fs` for all file operations (already works cross-platform):
```typescript
await vscode.workspace.fs.readFile(uri);
await vscode.workspace.fs.writeFile(uri, content);
```

### Buffer Operations
Use `bufferUtilities.ts` instead of Node.js `Buffer`:
```typescript
import { uint8ArrayToBase64, base64ToUint8Array } from './bufferUtilities';

// Instead of: Buffer.from(content).toString('base64')
const base64 = uint8ArrayToBase64(content);

// Instead of: Buffer.from(str, 'base64')
const bytes = base64ToUint8Array(base64String);
```

### Path Operations
Use `vscode.Uri` methods instead of Node.js `path`:
```typescript
// Instead of: path.join(base, 'subdir', 'file.txt')
vscode.Uri.joinPath(baseUri, 'subdir', 'file.txt');
```

### URI Display
Use `.path` or `.toString()` instead of `.fsPath` for display purposes (`.fsPath` may be empty for virtual file systems).

## Disabled Features in Web

Commands that cannot work in a browser are gated with `"enablement": "!isWeb"` in `package.json` contributions:

- Export / import artifact (native filesystem access)
- Open artifact in explorer
- Open / change local folder
- Open notebook (desktop-only notebook kernel)
- Git repository cloning (no child_process)
- Local project tree view (hidden entirely via `"when": "!isWeb"`)

Commands gated with `enablement` are visible but **disabled** (grayed out) in web. The local project tree view is fully **hidden** via a `when` clause. The no-op implementations return `undefined` or empty results for any code paths that still reach them.

## Dev Loop

### Debugging

Three launch configurations are available in `.vscode/launch.json`:

**"Web extension"** — Desktop VS Code, web worker host (fastest iteration):
1. Run `npm run build:web -w extension` (or have `watch:web` running).
2. Press **F5** and select **"Web extension"**.
3. Set breakpoints in `extension/src/` — source maps route through the webpack alias.
4. Key flags: `--extensionDevelopmentKind=web` loads the `browser` entry point; `debugWebWorkerHost: true` attaches the debugger to the web worker host.

Caveats:
- VS Code's `isWeb` context key is `false` in this mode, so `enablement: "!isWeb"` and `when: "!isWeb"` gates don't take effect. Desktop-only commands and views will appear enabled/visible even though you're running the web bundle.
- The desktop host can silently paper over web-incompatible code — Node.js shims may be available that wouldn't exist on real vscode.dev.

**"Web extension (Browser)"** — Full browser experience (closest to vscode.dev):
1. Press **F5** and select **"Web extension (Browser)"**.
2. The `preLaunchTask` starts a `@vscode/test-web` server on port 3000; `postDebugTask` tears it down.
3. Chrome DevTools are the debugger; source maps let you set breakpoints in the original TypeScript.

Caveats:
- **Authentication does not work** in the local `@vscode/test-web` server — Microsoft/AAD sign-in flows fail, so most authenticated functionality is inaccessible. This is a known limitation tracked in [vscode-test-web#188](https://github.com/microsoft/vscode-test-web/issues/188). For now, this config is only useful for verifying unauthenticated UI behavior and web bundle correctness.
- Slower iteration cycle — requires a full build, server startup, and browser launch.
- Debugging happens in Chrome DevTools rather than VS Code's integrated debugger, so there's no inline breakpoint experience in the editor.
- Requires Chrome/Chromium.

**"Core extension (vscode-fabric)"** — Standard desktop launch (Node bundle only, unrelated to web).

| Scenario | Launch config |
|----------|---------------|
| Quick iteration on shared / web-safe code | **Web extension** |
| Verifying full browser UX (auth flows, virtual FS, etc.) | **Web extension (Browser)** |
| Desktop-only features or unrelated work | **Core extension** |

### Testing

Unit tests run the same way for both targets (Node-based test runner). There is no separate web unit test runner at this time.

```bash
npm run test:unit -w extension
```

### Side-loading on vscode.dev

To test the extension in a real vscode.dev environment with full authentication, you can side-load it. vscode.dev requires the extension be served over HTTPS. See the [VS Code web extensions guide](https://code.visualstudio.com/api/extension-guides/web-extensions#test-your-web-extension-in-vscode.dev) for full details.

1. Install [mkcert](https://github.com/FiloSottile/mkcert#installation) (one-time setup) and generate local TLS certificates:
   ```bash
   mkdir -p $HOME/certs
   cd $HOME/certs
   mkcert -install
   mkcert localhost
   ```
2. Build the extension:
   ```bash
   npm run build -w extension
   ```
3. Serve the extension folder over HTTPS:
   ```bash
   npx serve --cors -l 5000 --ssl-cert $HOME/certs/localhost.pem --ssl-key $HOME/certs/localhost-key.pem ./extension
   ```
4. Open [vscode.dev](https://vscode.dev) in a browser.
5. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **Developer: Install Extension From Location...**.
6. Paste the URL from the local server (e.g. `https://localhost:5000`) and select **Install**.
7. Reload when prompted. The extension activates using the web bundle.

This is currently the most reliable way to test authenticated flows (sign-in, workspace browsing, artifact operations) in a true browser environment, since the local `@vscode/test-web` server has auth limitations (see Debugging caveats above).

## Common Pitfalls

| Pitfall | Guidance |
|---------|----------|
| Importing a Node built-in (`fs`, `path`, `os`, `child_process`) | Webpack will fail or produce a broken bundle. Use the web-safe alternatives above. |
| Using `Buffer` directly | Use `bufferUtilities.ts`. `Buffer` is not available in Web Workers. |
| Adding a new npm dependency with native bindings | Will break the web bundle. Check that dependencies are pure JS. |
| Forgetting `enablement: "!isWeb"` on a desktop-only command | The command will appear in web and throw at runtime. |
| Not testing both bundles | Run `npm run build -w extension` (builds both) to catch issues early. A clean build of both targets should be part of your PR validation. |
| Using `.fsPath` for display strings | Empty in virtual FS. Use `.path` or `.toString()`. |

## Extension Capabilities

The extension declares web compatibility in `package.json`:
```json
{
  "capabilities": {
    "virtualWorkspaces": true,
    "untrustedWorkspaces": { "supported": true }
  }
}
```

## Quick Reference

```bash
# Build
npm run build -w extension              # both targets
npm run build:node -w extension         # node only
npm run build:web -w extension          # web only
npm run watch:node -w extension         # node watch mode
npm run watch:web -w extension          # web watch mode

# Debug
# F5 → "Web extension"                 # web worker in desktop VS Code
# F5 → "Web extension (Browser)"       # full browser via test-web server

# Test
npm run test:unit -w extension          # unit tests
npm run vsix -w extension              # build VSIX, then side-load on vscode.dev
```
