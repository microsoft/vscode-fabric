# Reproduction Steps for Issues #82 and #83

## Overview

These reproduction steps demonstrate the new directory-level file operations
for item definitions, addressing:

- **Issue #82**: Copilot / language servers cannot create new files in definitions
- **Issue #83**: Full folder-level edit support (create, delete, directory listing)

## Prerequisites

1. A Fabric workspace with a Semantic Model (e.g., AdventureWorksLT)
2. The `Fabric.EditItemDefinitions` setting enabled
3. The extension built from the `dev/mwade/workspace-virtual-folder` branch

## Reproduction Steps

### Issue #82 - Creating New Files

1. Open VS Code with the Fabric extension
2. In the Fabric tree view, expand a workspace and find a Semantic Model artifact
3. Expand the artifact to see its definition files (e.g., `model.tmdl`, `tables/`, `roles/`)
4. Right-click on the `Item definition` root node
5. Select **New File...** from the context menu
6. Enter a file name (e.g., `cultures.tmdl`) and press Enter
7. **Expected**: The file is created, pushed to the server, opened for editing,
   and the tree view refreshes to show the new file
8. Alternatively, right-click on a folder node (e.g., `tables`)
9. Select **New File...** and enter a name (e.g., `Customer.tmdl`)
10. **Expected**: The file is created under the folder path (`tables/Customer.tmdl`),
    pushed to the server, and opened for editing

### Issue #83 - Deleting Files

1. In the Fabric tree view, expand a Semantic Model's definition
2. Right-click on a definition file (e.g., `tables/SalesOrderDetail.tmdl`)
3. Select **Delete** from the context menu
4. Confirm the deletion in the modal dialog
5. **Expected**: The file is removed, the updated definition is pushed to the server,
   and the tree view refreshes

### Issue #83 - Deleting Folders

1. Right-click on a definition folder (e.g., `roles`)
2. Select **Delete** from the context menu
3. Confirm the deletion in the modal dialog
4. **Expected**: All files under the folder are removed, the updated definition is
   pushed to the server, and the tree view refreshes

### Issue #83 - Directory Listing (readDirectory)

1. Open a definition file for editing (click on a `.tmdl` file in the tree)
2. The `DefinitionFileSystemProvider.readDirectory()` method is now functional
3. Language servers and Copilot can enumerate sibling files in the same directory
4. This enables cross-file awareness for TMDL and other multi-file definitions

### Verify createDirectory (No-op Behavior)

1. The `createDirectory` method is implemented as a validated no-op
2. It validates the URI refers to a known cached item
3. If the directory already exists (has files under it), it returns `FileExists`
4. Otherwise, it silently succeeds - the directory becomes real when a file is created

## Sample TMDL Files

The `docs/samples/tmdl/definition/` directory contains sample TMDL files that
mirror the structure of a typical Fabric Semantic Model definition:

```
definition/
  model.tmdl           - Model metadata
  expressions.tmdl     - M expressions / data sources
  relationships.tmdl   - Table relationships
  tables/
    Product.tmdl       - Product table definition
    SalesOrderDetail.tmdl - Sales order detail table
  roles/
    Reader.tmdl        - Reader security role
```

## Technical Details

### FileSystemProvider Changes

- `registerItem(artifact, definition)`: Caches the full item definition and all
  individual files for directory-level access
- `stat()`: Returns `Directory` type for item roots and subfolders
- `readDirectory()`: Lists files and subfolders at any level
- `createDirectory()`: Validated no-op (directories are implicit in definition parts)
- `writeFile()`: Supports creating new files (with `create: true` flag)
- `delete()`: Removes files or folders (recursive) and pushes the updated definition

### Push-on-Save Strategy

Every file create, update, or delete immediately pushes the full definition to
the Fabric service. This ensures consistency between local state and the server.

### Fetch Deduplication

When multiple files from the same artifact are requested concurrently, only one
API call is made. Subsequent requests share the same fetch result.
