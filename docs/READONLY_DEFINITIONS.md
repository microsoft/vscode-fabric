# Readonly Definition Files with "Make Editable" Feature

## Overview

Definition files in the remote workspace view now open in **readonly mode** by default, with a "Make Editable" button that allows users to intentionally switch to editable mode. This prevents accidental edits to remote Fabric definitions.

## How the "Make Editable" Button Appears

### Two Ways to Make Files Editable

Since different editors have different capabilities, we provide **two ways** to make files editable:

1. **CodeLens** (for text editors) - Clickable link at top of file
2. **Editor Title Button** (for all editors) - Icon button in title bar

### CodeLens (Text Files)

CodeLens is a VS Code feature that displays **inline, clickable links** within the editor. It appears as small, blue/gray text above or within code content.

**Important: CodeLens only works in text editors, not notebook editor.**

### Editor Title Button (All Files Including Notebooks)

A dedicated button appears in the **editor title bar** (toolbar at top of editor).

**Visual location:**
```
┌─────────────────────────────────────────────────────────────┐
│ notebook.ipynb    [📝] [📔 Open in Text Editor]    × ⊗ ⋮ │
│                    ↑                                         │
│                   Edit button appears here                   │
├─────────────────────────────────────────────────────────────┤
│ [Notebook cells render below]                                │
```

The `[📝]` button:
- Appears for all `fabric-definition-virtual://` files
- Works in text editor AND notebook editor
- Always visible in the title bar
- Clicking triggers "Make Editable" command

### Important: CodeLens Visibility

**The CodeLens will appear if:**
- ✅ File opens with `fabric-definition-virtual://` scheme
- ✅ VS Code setting `"editor.codeLens": true` is enabled (default)
- ✅ Only FileSystemProvider is registered (no duplicate TextDocumentContentProvider)

**Common issues why CodeLens might not appear:**
- ❌ Multiple providers registered for same scheme (causes conflicts)
- ❌ CodeLens disabled in settings: `"editor.codeLens": false`
- ❌ Wrong URI scheme (e.g., file opens with `fabric-definition://` instead)
- ❌ Extension not fully loaded/activated

### Visual Appearance for Different File Types

**Text Files (JSON, PBIR, etc.):**
- CodeLens link at line 0: "📝 Make Editable"
- Title bar button: Edit icon
- Both options available

**Notebook Files (.ipynb):**
- Title bar button: Edit icon
- CodeLens: Not displayed (notebook editor doesn't support CodeLens)
- Title button is the primary way to make editable

**Why both?**
- Text editors support CodeLens (more discoverable, inline)
- Notebook editor only supports title buttons
- Providing both ensures consistency across all file types

When you open a readonly definition file, the CodeLens appears at the very top:

```
┌─────────────────────────────────────────────────────────────┐
│ definition.pbir                                       × ⊗ ⋮ │
├─────────────────────────────────────────────────────────────┤
│ 📝 Make Editable                                             │  ← CodeLens (clickable)
│                                                              │
│ {                                                            │
│   "version": "1.0",                                          │
│   "datasetReference": {                                      │
│     ...                                                      │
└─────────────────────────────────────────────────────────────┘
```

For notebooks opened in Notebook Editor:

```
┌─────────────────────────────────────────────────────────────┐
│ notebook.ipynb                           📔 Open With... ⋮  │
├─────────────────────────────────────────────────────────────┤
│ 📝 Make Editable                                             │  ← CodeLens at top
│                                                              │
│ ┌────────────────────────────────────────────────┐          │
│ │ 📝 Markdown Cell                               │          │
│ │ # My Notebook                                  │          │
│ └────────────────────────────────────────────────┘          │
│ ┌────────────────────────────────────────────────┐          │
│ │ ▶ Code Cell                                    │          │
│ │ print("Hello World")                           │          │
│ └────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### User Interaction Flow

1. **User clicks definition file in tree view**
   - File opens with `fabric-definition-virtual://` URI
   - CodeLens "Make Editable" appears at top
   - File is readonly (cannot type/edit)

2. **User hovers over "Make Editable"**
   - Cursor changes to pointer (hand icon)
   - Tooltip shows: "Switch to editable mode to modify this file"

3. **User clicks "Make Editable"**
   - Readonly document closes automatically
   - Editable document opens with `fabric-definition://` URI
   - Modal dialog: "You are editing a remote definition file..."
   - Status bar shows: "⚠️ Editing Remote Fabric Definition"

### How CodeLens is Rendered

The implementation in `DefinitionFileCodeLensProvider.ts`:

```typescript
provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.uri.scheme !== 'fabric-definition-virtual') {
        return [];
    }

    const topOfDocument = new vscode.Range(0, 0, 0, 0);  // Line 0, column 0
    const codeLens = new vscode.CodeLens(topOfDocument);
    
    codeLens.command = {
        title: '$(edit) Make Editable',    // $(edit) renders as edit icon
        tooltip: 'Switch to editable mode to modify this file',
        command: 'vscode-fabric.editDefinitionFile',
        arguments: [document.uri]
    };

    return [codeLens];
}
```

**Key Points:**
- `$(edit)` is a VS Code icon reference that renders as 📝 or similar edit glyph
- Position is `Range(0, 0, 0, 0)` meaning top-left of the document
- Returns array with single CodeLens (appears as one button)

### Registration

Registered in `extension.ts` to only apply to readonly virtual files:

```typescript
vscode.languages.registerCodeLensProvider(
    { scheme: 'fabric-definition-virtual' },  // Document selector
    codeLensProvider
);
```

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
