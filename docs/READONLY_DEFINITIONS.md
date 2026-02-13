# Readonly Definition Files with "Make Editable" Feature

## Overview

Definition files in the remote workspace view now open in **readonly mode** by default, with a "Make Editable" button that allows users to intentionally switch to editable mode. This prevents accidental edits to remote Fabric definitions.

## Architecture

### Dual File System Provider Registration

Two file system providers handle definition files:

1. **fabric-definition://** (Editable)
   - Provider: `DefinitionFileSystemProvider`
   - Registration: `isReadonly: false`
   - Used for: Intentional editing of remote definitions
   - Shows warning: "Editing Remote Fabric Definition"

2. **fabric-definition-virtual://** (Readonly)
   - Provider: `ReadonlyDefinitionFileSystemProvider` (wrapper)
   - Registration: `isReadonly: true`
   - Used for: Viewing remote definitions safely
   - Shows CodeLens: "Make Editable" button

### Components

#### ReadonlyDefinitionFileSystemProvider
Wraps the existing `DefinitionFileSystemProvider`:
- **Read operations**: Delegates to inner provider
  - `stat()`, `readFile()`, `readDirectory()`, `watch()`
- **Write operations**: Throws `NoPermissions` error
  - `writeFile()`, `delete()`, `rename()`, `createDirectory()`
- **URI conversion**: Converts virtual→editable scheme for delegation

#### DefinitionFileCodeLensProvider
Provides UI button in readonly files:
- Shows "Make Editable" CodeLens at top of file
- Only for `fabric-definition-virtual://` scheme
- Triggers `editDefinitionFile` command

#### EditItemDefinitionCommand (Updated)
Handles transition from readonly to editable:
- **Input**: DefinitionFileTreeNode OR vscode.Uri
- **Action**: 
  1. Convert virtual URI → editable URI
  2. Close readonly document
  3. Open editable document
  4. Show editing warning

## User Experience

### Opening a Definition File

1. **User clicks file in tree view**
   ```
   Tree Item → vscode.open command → fabric-definition-virtual://
   ```
   - File opens in readonly mode
   - "Make Editable" button appears at top (CodeLens)

2. **For notebooks specifically**
   ```
   .ipynb file → Opens with readonly FileSystemProvider
   ```
   - VS Code shows "Open in Notebook Editor" option
   - Clicking opens notebook in readonly mode ✓
   - "Make Editable" button visible at top

3. **User clicks "Make Editable"**
   ```
   CodeLens → editDefinitionFile command
   ```
   - Readonly document closes
   - Editable document opens (fabric-definition://)
   - Warning: "Editing Remote Fabric Definition"
   - Status bar indicator shows

### Example Flow for Notebook

```
1. User clicks notebook.ipynb in tree view
   ↓
2. Opens with fabric-definition-virtual://workspace-id/artifact-id/notebook.ipynb
   ↓
3. VS Code notebook editor works (has FileSystemProvider!)
   ↓
4. User sees "Make Editable" button
   ↓
5. User clicks "Make Editable"
   ↓
6. Switches to fabric-definition://workspace-id/artifact-id/notebook.ipynb
   ↓
7. Now editable, shows warning
```

## Why This Works for Notebooks

### The Problem
- VS Code notebook editor requires a **FileSystemProvider**
- Previous `fabric-definition-virtual://` only had **TextDocumentContentProvider**
- Error: "No file system provider found"

### The Solution
- `ReadonlyDefinitionFileSystemProvider` implements **FileSystemProvider** interface
- Registered for `fabric-definition-virtual://` scheme
- Notebooks can now use notebook editor in readonly mode
- User can switch to editable mode intentionally

## Benefits

1. **Safe by Default**
   - All files open readonly
   - Prevents accidental edits to remote definitions

2. **Intentional Editing**
   - Clear "Make Editable" button
   - User must explicitly choose to edit
   - Warning shown when editing

3. **Notebook Support**
   - Notebooks work with notebook editor
   - Can view in readonly mode
   - Can edit when needed

4. **Consistent UX**
   - Same pattern for all file types
   - Similar to "Open in Notebook Editor" experience
   - Familiar VS Code patterns (CodeLens)

## Implementation Details

### FileSystemProvider Interface
The `ReadonlyDefinitionFileSystemProvider` implements all required methods:

**Read Operations (Delegated):**
```typescript
stat(uri: vscode.Uri): FileStat {
    return this.innerProvider.stat(this.toEditableUri(uri));
}

readFile(uri: vscode.Uri): Uint8Array {
    return this.innerProvider.readFile(this.toEditableUri(uri));
}
```

**Write Operations (Blocked):**
```typescript
writeFile(uri: vscode.Uri, content: Uint8Array): void {
    throw vscode.FileSystemError.NoPermissions(uri);
}
```

### CodeLens Pattern
```typescript
provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.uri.scheme !== 'fabric-definition-virtual') {
        return [];
    }
    
    return [new vscode.CodeLens(topOfDocument, {
        title: '$(edit) Make Editable',
        command: 'vscode-fabric.editDefinitionFile',
        arguments: [document.uri]
    })];
}
```

## Future Enhancements

Potential improvements:
- Add "Make Readonly" button to switch back
- Add keyboard shortcut for Make Editable
- Remember user preference per file
- Add confirmation dialog before making editable
- Show diff when switching modes

## Migration Notes

No changes required for:
- Existing satellite extensions
- Local project workflows
- Export/import operations

Only affects remote view definition file viewing/editing.
