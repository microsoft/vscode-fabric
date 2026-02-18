# Web Extension Support

The extension runs in both desktop (Node.js) and web (browser) environments such as vscode.dev and github.dev.

## Build Configuration

Webpack produces two bundles:
- **Desktop:** `dist/extension.js` (target: `node`)
- **Web:** `dist/web/extension.js` (target: `webworker`)

The `package.json` declares both entry points:
```json
{
  "main": "./dist/extension.js",
  "browser": "./dist/web/extension.js"
}
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

Features unavailable in browser environments have no-op implementations:

| Interface | Desktop Implementation | Web Implementation |
|-----------|----------------------|-------------------|
| `IGitOperator` | `GitOperator` (uses child_process) | `WebGitOperator` (no-op) |
| `ILocalFolderManager` | `LocalFolderManager` (uses os.homedir) | `WebLocalFolderManager` (no-op) |

The DI container in `extension/src/web/extension.ts` registers web-specific implementations.

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

The following features are unavailable when running in the browser:
- Git repository cloning (no child_process)
- Local folder operations requiring OS home directory
- Export to local folder (no native filesystem access)

These limitations are handled gracefully by the no-op implementations returning `undefined` or empty results.

## Testing

Run the web extension locally:
```bash
npm run watch:web -w extension    # Build web bundle in watch mode
npx @vscode/test-web --browserType=chromium --extensionDevelopmentPath=./extension
```

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
