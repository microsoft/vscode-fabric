# Web Compatibility Analysis for vscode-fabric Extension

**Date:** January 13, 2026  
**Objective:** Assess compatibility requirements for running the Microsoft Fabric VS Code extension in both desktop and web environments (vscode.dev, github.dev)

---

## Executive Summary

The vscode-fabric extension currently targets desktop VS Code exclusively with a Node.js runtime. To support web-based VS Code, several critical blockers must be addressed:

- **Git operations** use `child_process` (unavailable in browser)
- **File system path operations** rely on Node.js `os` and `path` modules
- **`.fsPath` usage** assumes OS-specific file paths (incompatible with virtual file systems)
- **Dependencies** include Node.js-only packages (`fs-extra`, `decompress`)
- **Build configuration** lacks browser entry point and web-specific bundling

However, the extension already uses `vscode.workspace.fs` in key areas, which is a strong foundation for web compatibility.

---

## 🔴 Critical Blockers (Must Fix)

### 1. Node.js `child_process` Module

**Location:** `extension/src/git/GitOperator.ts`

**Code:**
```typescript
import * as cp from 'child_process';

// In spawnProcess method:
const child = cp.spawn(command, args);
```

**Issue:** The `child_process` module is completely unavailable in browser environments. The `GitOperator` class uses it to spawn Git processes for repository cloning.

**Impact:** 
- Git cloning functionality will fail entirely in web version
- Direct blocker for any git-based workflows

**Solution Options:**
1. **Recommended:** Use VS Code's Git extension API exclusively (already partially implemented)
2. Implement platform detection to disable git features in web
3. For web, provide alternative workflows (e.g., "Open in GitHub Codespaces")
4. Consider using browser-based Git implementations (e.g., isomorphic-git)

**Implementation Strategy:**
```typescript
// Detect environment
const isWeb = vscode.env.uiKind === vscode.UIKind.Web;

if (isWeb) {
    // Use API-only approach or show helpful message
} else {
    // Use child_process approach
}
```

---

### 2. Node.js `os` and `path` Modules

**Locations:**
- `extension/src/LocalFolderManager.ts` - uses `os.homedir()`
- `extension/src/itemDefinition/pathUtils.ts` - uses `path` module extensively
- `util/src/fabricUtilities.ts` - uses `path.parse()`
- `api/src/treeView.ts` - uses `path.parse()`

**Problematic Code Examples:**

```typescript
// LocalFolderManager.ts (lines 7-8, 52-54)
import * as os from 'os';
import * as path from 'path';

const baseFolder: string = (this.storage.defaultWorkspacesPath && this.storage.defaultWorkspacesPath.length > 0)
    ? this.storage.defaultWorkspacesPath
    : path.resolve(os.homedir(), 'Workspaces');
```

```typescript
// itemDefinition/pathUtils.ts (line 27)
const normalized = path.normalize(partPath).replace(/^(\.\/|\.\\)+/, '');

// Line 31-33
const destPath = destination.fsPath.endsWith(path.sep) 
    ? destination.fsPath 
    : destination.fsPath + path.sep;
```

**Impact:**
- `os.homedir()` is undefined in browser (no home directory concept)
- `path.sep` behavior differs between platforms
- Path resolution and normalization may fail or behave unexpectedly

**Solution:**
1. **For `os`:** Use webpack polyfill or replace with browser-appropriate defaults
   ```javascript
   // webpack.config.js
   resolve: {
       fallback: {
           "os": false, // or require.resolve("os-browserify/browser")
       }
   }
   ```

2. **For `path`:** Use `path-browserify` polyfill
   ```javascript
   resolve: {
       fallback: {
           "path": require.resolve("path-browserify")
       }
   }
   ```

3. **Better approach:** Migrate to `vscode.Uri` methods
   ```typescript
   // Instead of path operations, use:
   vscode.Uri.joinPath(baseUri, ...segments)
   vscode.Uri.parse(uriString)
   ```

---

### 3. Node.js `fs-extra` Module

**Location:** `extension/src/fabric/MockApiClient.ts`

**Code:**
```typescript
import * as fs from 'fs-extra';
```

**Issue:** `fs-extra` is a Node.js-only file system library with no browser equivalent.

**Impact:** 
- The `MockApiClient` likely won't work in web environments
- This appears to be test/mock code, so may not affect production

**Solution:**
1. **If test-only:** Exclude from web bundle via webpack configuration
2. **If needed in production:** Migrate all file operations to `vscode.workspace.fs`
3. Use conditional imports or separate implementations for web vs desktop

**Webpack Configuration:**
```javascript
externals: {
    'fs-extra': 'commonjs fs-extra', // Only bundle for Node.js target
}
```

---

### 4. Extensive `.fsPath` Usage

**Occurrences:** 30+ instances across the codebase

**Problematic Patterns:**

```typescript
// api/src/treeView.ts (line 132)
this.tooltip = folder.fsPath;

// api/src/treeView.ts (line 170)
let displayName = localPath.fsPath;

// itemDefinition/pathUtils.ts (lines 31-34)
const destPath = destination.fsPath.endsWith(path.sep) 
    ? destination.fsPath 
    : destination.fsPath + path.sep;
if (!fileUri.fsPath.startsWith(destPath)) {
    throw new Error(`Unsafe file path detected: ${partPath}`);
}
```

**Issue:** 
- `.fsPath` returns OS-specific file system paths (e.g., `C:\Users\...` on Windows, `/home/...` on Linux)
- In web environments with virtual file systems, URIs might be:
  - `memfs:/workspace/file.txt`
  - `vscode-vfs://github/owner/repo/file.txt`
  - `vscode-vfs://codespaces/workspace/file.txt`
- `.fsPath` on virtual URIs may return empty string or throw errors
- Direct string comparison of `.fsPath` values will fail

**Impact:**
- Path validation and security checks may fail
- Display paths may be incorrect or empty
- File operations using `.fsPath` won't work with virtual file systems

**Solution:**

1. **For display purposes:**
   ```typescript
   // Instead of:
   this.tooltip = folder.fsPath;
   
   // Use:
   this.tooltip = folder.path; // or folder.toString()
   ```

2. **For path operations:**
   ```typescript
   // Instead of:
   const combined = path.join(baseUri.fsPath, relativePath);
   
   // Use:
   const combined = vscode.Uri.joinPath(baseUri, relativePath);
   ```

3. **For path comparisons:**
   ```typescript
   // Instead of:
   if (fileUri.fsPath.startsWith(destUri.fsPath)) { ... }
   
   // Use:
   if (fileUri.path.startsWith(destUri.path)) { ... }
   // Or use proper URI comparison utilities
   ```

---

## 🟡 Major Concerns (Likely Issues)

### 5. Dependencies Lacking Browser Versions

**From `extension/package.json`:**

| Dependency | Version | Browser Compatible? | Notes |
|------------|---------|---------------------|-------|
| `jszip` | ^3.10.1 | ✅ Yes | Works in browser |
| `fs-extra` | ^11.1.1 | ❌ No | Node.js only |
| `@microsoft/vscode-azext-azureauth` | ~4.1.1 | ⚠️ Unknown | Needs verification |
| `@vscode/extension-telemetry` | ^0.8.3 | ✅ Yes | Designed for browser |

**From `util/package.json`:**

| Dependency | Version | Browser Compatible? | Notes |
|------------|---------|---------------------|-------|
| `decompress` | ^4.2.1 | ❌ No | Uses fs, child_process internally |
| `@azure/core-rest-pipeline` | ^1.14.0 | ✅ Yes | Works in browser |

**Impact:**
- File compression/decompression operations may fail
- Archive extraction won't work in web
- Authentication flows may need adaptation for browser environment

**Solution:**

1. **Replace `decompress`** with browser-compatible alternative:
   - Use `jszip` (already a dependency) for ZIP operations
   - Use `fflate` for more comprehensive archive support
   - Implement custom decompression using Web APIs

2. **Remove `fs-extra`** dependency:
   - Already using `vscode.workspace.fs` in most places
   - Migrate remaining usage to VS Code APIs

3. **Verify Azure authentication:**
   - Check `@microsoft/vscode-azext-azureauth` documentation
   - Test authentication flows in web environment
   - May need to use different auth flows for browser (OAuth redirects, etc.)

---

### 6. No Browser Entry Point

**Current `extension/package.json`:**
```json
{
  "main": "./dist/extension.js"
}
```

**Issue:** Only defines a Node.js entry point. VS Code web looks for a `browser` field to load the extension.

**Impact:** Extension won't load at all in web environments (vscode.dev, github.dev).

**Solution:** Add browser entry point in `package.json`:

```json
{
  "main": "./dist/extension.js",
  "browser": "./dist/web/extension.js"
}
```

Then create a separate bundle for the browser entry point (see next section).

---

### 7. Webpack Not Configured for Browser Target

**Current `webpack.config.js`:**
```javascript
const extensionConfig = {
    target: 'node',  // ❌ Only Node.js target
    mode: 'none',
    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },
    // ...
};
module.exports = [extensionConfig];
```

**Issue:** Webpack is only configured to bundle for Node.js runtime, not for browser/webworker environment.

**Impact:** 
- Bundle includes Node.js-specific code
- No browser-compatible bundle generated
- Node.js polyfills not configured

**Solution:** Create dual webpack configurations:

```javascript
const nodeConfig = {
    target: 'node',
    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },
    // ... existing config
};

const webConfig = {
    target: 'webworker',  // ✅ Browser environment
    entry: './src/extension.ts',  // Could be separate web entry if needed
    output: {
        path: path.resolve(__dirname, 'dist/web'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },
    resolve: {
        extensions: ['.ts', '.js'],
        fallback: {
            // Provide browser polyfills
            'path': require.resolve('path-browserify'),
            'os': false,  // or require.resolve('os-browserify/browser')
        },
    },
    externals: {
        vscode: 'commonjs vscode',
        // Exclude Node.js-only dependencies
        'fs-extra': 'commonjs fs-extra',
    },
    // ... rest of config
};

module.exports = [nodeConfig, webConfig];
```

---

## 🟢 Positive Findings (Already Compatible)

### ✅ Good: Already Using `vscode.workspace.fs`

**Location:** `extension/src/extension.ts` (line 165)

```typescript
const workspaceFolderProvider = await WorkspaceFolderProvider.create(
    vscode.workspace.fs,  // ✅ Correct approach!
    logger, 
    telemetryService
);
```

**Why This Matters:**
- `vscode.workspace.fs` is the abstraction layer that works on all platforms
- Works with virtual file systems (GitHub, Codespaces, remote servers)
- This is the recommended approach in VS Code documentation

**Recommendation:** Continue this pattern throughout the codebase.

---

### ✅ Good: No Direct `require()` or Dynamic Imports

The extension uses ES6 `import` statements throughout, which are bundler-friendly and easier to analyze for web compatibility.

**Example:**
```typescript
import * as vscode from 'vscode';
import { IFabricApiClient } from '@microsoft/vscode-fabric-api';
```

This makes it easier to:
- Tree-shake unused code
- Apply webpack polyfills
- Generate optimized bundles

---

### ✅ Good: Telemetry and Core Services Look Compatible

**Dependencies designed for browser use:**
- `@vscode/extension-telemetry` - Works in both environments
- `@azure/core-rest-pipeline` - Browser-compatible HTTP client
- `@wessberg/di` - Pure JavaScript dependency injection

These core services should work without modification in web environments.

---

### ✅ Good: No Native Node Modules

The extension doesn't use any native Node.js addons (`.node` files), which would be impossible to run in browser.

---

## 📋 Action Items Summary

### High Priority (Blockers)

1. **Replace `child_process` usage in GitOperator**
   - [ ] Implement platform detection (`vscode.env.uiKind`)
   - [ ] Add conditional logic for web vs desktop
   - [ ] Consider using isomorphic-git or API-only approach for web
   - [ ] Update UI to gracefully handle missing git features in web

2. **Replace `os.homedir()` usage**
   - [ ] Remove dependency on `os.homedir()`
   - [ ] Use user settings or browser-appropriate defaults
   - [ ] Update `LocalFolderManager.defaultLocalFolderForFabricWorkspace()`

3. **Add browser polyfills to webpack**
   - [ ] Install `path-browserify`: `npm install --save-dev path-browserify`
   - [ ] Configure webpack fallbacks for `path` and `os`
   - [ ] Test that polyfills work correctly

4. **Audit and refactor `.fsPath` usage**
   - [ ] Review all 30+ occurrences of `.fsPath`
   - [ ] Replace with `vscode.Uri` methods where possible
   - [ ] Use `.path` or `.toString()` for display purposes
   - [ ] Update path comparison logic to use URI methods

5. **Add browser entry point**
   - [ ] Update `extension/package.json` with `"browser"` field
   - [ ] Create web-specific bundle output directory

6. **Create web webpack config**
   - [ ] Add `webConfig` object to `webpack.config.js`
   - [ ] Set `target: 'webworker'`
   - [ ] Configure output to `dist/web/extension.js`
   - [ ] Export both configs: `module.exports = [nodeConfig, webConfig]`

### Medium Priority (Important)

7. **Replace `decompress` dependency**
   - [ ] Remove `decompress` from `util/package.json`
   - [ ] Implement ZIP extraction using `jszip` (already a dependency)
   - [ ] Test archive operations in browser environment

8. **Remove or isolate `fs-extra` usage**
   - [ ] Remove `fs-extra` from `extension/package.json`
   - [ ] Migrate `MockApiClient` to use `vscode.workspace.fs` or exclude from web bundle
   - [ ] Ensure all file operations use VS Code APIs

9. **Verify Azure authentication works in browser**
   - [ ] Test `@microsoft/vscode-azext-azureauth` in web environment
   - [ ] Check documentation for browser-specific configuration
   - [ ] Implement OAuth redirect flows if needed
   - [ ] Test sign-in/sign-out workflows

10. **Add capability flags to package.json**
    - [ ] Add `"capabilities"` section
    - [ ] Set `"virtualWorkspaces": true` or appropriate support level
    - [ ] Set `"untrustedWorkspaces"` configuration
    ```json
    "capabilities": {
        "virtualWorkspaces": true,
        "untrustedWorkspaces": { "supported": true }
    }
    ```

### Low Priority (Nice to Have)

11. **Mock/test code cleanup**
    - [ ] Ensure test-only code doesn't break web bundle
    - [ ] Consider separate test webpack config
    - [ ] Add conditional compilation for test utilities

12. **Path separator handling**
    - [ ] Test extension on virtual file systems
    - [ ] Verify path operations work with forward slashes (web standard)
    - [ ] Update any hardcoded backslash usage

13. **Performance optimization**
    - [ ] Analyze bundle size for web target
    - [ ] Consider code splitting for large features
    - [ ] Lazy-load heavy dependencies when possible

14. **Documentation**
    - [ ] Update README with web support information
    - [ ] Document which features work in web vs desktop
    - [ ] Create developer guide for maintaining web compatibility

---

## Testing Strategy

### Local Testing

1. **Test in VS Code Desktop** (baseline)
   - Verify all existing functionality works
   - Run existing test suites

2. **Test with `@vscode/test-web`**
   ```bash
   npm install --save-dev @vscode/test-web
   npx @vscode/test-web --browserType=chromium --extensionDevelopmentPath=.
   ```

3. **Test in github.dev**
   - Open a GitHub repository in github.dev
   - Install development version of extension
   - Test core workflows

### Automated Testing

1. **Add web-specific test suite**
   - Create test cases for virtual file systems
   - Mock browser-specific APIs
   - Test graceful degradation of unsupported features

2. **CI/CD Updates**
   - Add web bundle build to CI pipeline
   - Run tests against both node and web bundles
   - Validate bundle sizes

---

## Resources

### VS Code Documentation
- [Web Extensions Guide](https://code.visualstudio.com/api/extension-guides/web-extensions)
- [Testing Web Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Virtual Workspaces](https://code.visualstudio.com/api/extension-guides/virtual-workspaces)

### Example Extensions with Web Support
- [GitHub Pull Request extension](https://github.com/microsoft/vscode-pull-request-github)
- [Azure Account extension](https://github.com/microsoft/vscode-azure-account)
- [Remote Repositories extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.remote-repositories)

### Useful Packages
- `path-browserify` - Browser polyfill for Node.js path module
- `os-browserify` - Browser polyfill for Node.js os module
- `jszip` - ZIP file manipulation in JavaScript
- `fflate` - Fast compression/decompression
- `isomorphic-git` - Pure JavaScript Git implementation

---

## Estimated Effort

| Category | Effort | Complexity |
|----------|--------|------------|
| Webpack configuration | 1-2 days | Medium |
| Path/OS polyfills | 2-3 days | Medium |
| `.fsPath` refactoring | 3-5 days | High |
| Git operations refactoring | 3-5 days | High |
| Authentication testing | 2-3 days | Medium |
| Dependency replacement | 2-3 days | Medium |
| Testing & validation | 3-5 days | High |
| **Total** | **16-26 days** | **High** |

---

## Recommendations

### Phase 1: Foundation (Week 1-2)
- Set up webpack for web bundling
- Add polyfills for `path` and `os`
- Create browser entry point
- Get basic extension loading in web

### Phase 2: Core Functionality (Week 3-4)
- Refactor `.fsPath` usage
- Update file system operations
- Test with virtual file systems
- Verify authentication works

### Phase 3: Feature Parity (Week 5-6)
- Handle git operations (conditional features or alternatives)
- Replace `decompress` dependency
- Test all core workflows
- Document limitations

### Phase 4: Polish & Release (Week 7+)
- Comprehensive testing across platforms
- Performance optimization
- User documentation
- Beta release for feedback

---

## Conclusion

The vscode-fabric extension has a **solid foundation** for web compatibility due to its use of `vscode.workspace.fs` and modern dependencies. However, significant work is needed to address:

1. **Node.js-specific modules** (`child_process`, `os`, `path`, `fs-extra`)
2. **Path handling** (`.fsPath` usage throughout)
3. **Build infrastructure** (webpack configuration, browser entry point)

With focused effort over 4-8 weeks, the extension can achieve full web compatibility while maintaining desktop functionality. The architecture supports this transition, and the team can take an incremental approach by implementing changes in phases.
