# Notebook Editor Support

## Overview

The Fabric extension supports opening `.ipynb` (Jupyter Notebook) definition files in VS Code. This document explains how notebook support works and the design decisions made.

## How Notebook Files Are Opened

When a user clicks "Edit Definition File" or the "Start editing" CodeLens on a notebook definition file, the extension uses:

```typescript
await vscode.commands.executeCommand('vscode.open', editableUri);
```

This approach provides graceful degradation and optimal user experience.

## Why `vscode.open` Instead of `vscode.openWith`

### Previous Approach (Problematic)

Initially, the code used:
```typescript
if (fileName?.toLowerCase().endsWith('.ipynb')) {
    await vscode.commands.executeCommand('vscode.openWith', editableUri, 'jupyter-notebook');
} else {
    // text editor flow
}
```

**Problems with this approach:**

1. **Hard dependency on Jupyter extension**: The `'jupyter-notebook'` viewType is only registered when the Jupyter extension is installed. If not present, the command fails silently or shows an error.

2. **Requires special configuration**: Users must have the Jupyter extension installed for notebook files to work.

3. **Not user-friendly**: No graceful fallback or helpful message to users without the extension.

4. **File extension special-casing**: Requires maintaining logic to detect notebook files.

### Current Approach (Robust)

Using `vscode.open` provides:

```typescript
await vscode.commands.executeCommand('vscode.open', editableUri);
```

**Benefits:**

1. **Graceful degradation**: 
   - **With Jupyter extension**: `.ipynb` files automatically open in the notebook editor
   - **Without Jupyter extension**: VS Code prompts user to install the extension, or opens as JSON

2. **No configuration required**: Works out of the box with whatever extensions the user has installed

3. **Consistent behavior**: Same command for all file types - VS Code handles the routing

4. **No special-casing**: No need to detect file extensions and route differently

5. **User-friendly**: VS Code provides helpful prompts and fallback behavior

## Jupyter Extension

### Is it Required?

**No.** The Jupyter extension is **not required** for the Fabric extension to function. However, for the best notebook editing experience:

- **Recommended**: Microsoft Jupyter Extension (ms-toolsai.jupyter)
- **Provides**: Interactive notebook editor with cell execution, rich outputs, and full Jupyter features
- **Without it**: Notebook files open as JSON text (still editable, but less user-friendly)

### User Experience

#### With Jupyter Extension Installed

1. User clicks "Edit Definition File" on a notebook
2. File opens immediately in the interactive notebook editor
3. Full notebook features available (cell execution, rich outputs, etc.)
4. DefinitionFileEditorDecorator shows warnings about remote editing
5. Changes sync back to Fabric when saved

#### Without Jupyter Extension

1. User clicks "Edit Definition File" on a notebook
2. VS Code shows a prompt: "Do you want to install an extension to view Jupyter Notebooks?"
3. User can:
   - Click "Install" to install the Jupyter extension
   - Click "Open With..." to choose another editor
   - Dismiss the prompt and see the notebook as JSON text
4. File is still editable (as JSON), but without notebook-specific features

## DefinitionFileEditorDecorator Behavior

The decorator listens to both text and notebook editor events:

```typescript
vscode.window.onDidChangeActiveTextEditor(...)
vscode.window.onDidChangeActiveNotebookEditor(...)
```

This means warnings and status bar indicators work regardless of which editor is used:

- **Text editor** (.json, .pbir, .ipynb-as-JSON): Shows warnings via text editor events
- **Notebook editor** (.ipynb with Jupyter): Shows warnings via notebook editor events

## Design Principles

1. **Graceful degradation**: Features should work at a basic level without optional dependencies
2. **User choice**: Don't force users to install specific extensions
3. **Helpful guidance**: Provide clear prompts when optional features are available
4. **Consistent API usage**: Use standard VS Code commands that handle edge cases
5. **No special-casing**: Avoid file-extension-based routing when possible

## Related Files

- `EditItemDefinitionCommand.ts` - Opens definition files for editing
- `DefinitionFileEditorDecorator.ts` - Shows warnings for remote files
- `DefinitionFileCodeLensProvider.ts` - Provides "Start editing" action
- `ReadonlyDefinitionFileSystemProvider.ts` - Readonly virtual file system
- `DefinitionFileSystemProvider.ts` - Editable file system provider
