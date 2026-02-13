// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { FabricTreeNode, IArtifact } from '@microsoft/vscode-fabric-api';

/**
 * Represents a single file within an item definition in the workspace tree view.
 * This node is a leaf node (no children) that represents a definition part/file.
 */
export class DefinitionFileTreeNode extends FabricTreeNode {
    /**
     * Creates a new instance of the DefinitionFileTreeNode class
     * @param context - The VS Code extension context
     * @param artifact - The artifact that owns this definition file
     * @param fileName - The name/path of the definition file
     * @param readonlyUri - The readonly virtual document URI for this file
     * @param editableUri - The editable file system URI for this file (used by Edit command)
     */
    constructor(
        context: vscode.ExtensionContext,
        public readonly artifact: IArtifact,
        public readonly fileName: string,
        public readonly readonlyUri: vscode.Uri,
        public readonly editableUri: vscode.Uri
    ) {
        // Extract just the filename from the path for display
        const displayName = fileName.split('/').pop() || fileName;
        super(context, displayName, vscode.TreeItemCollapsibleState.None);

        // Set icon based on file type
        this.iconPath = this.getIconForFile(fileName);

        // Set tooltip with full path
        this.tooltip = vscode.l10n.t('Definition file: {0}', fileName);

        // Add command to open the file in readonly mode when clicked
        this.command = {
            command: 'vscode.open',
            title: 'Open Definition File',
            arguments: [readonlyUri],
        };

        this.contextValue = 'definition-file';

        // Set the resource URI for the tree item (use editable URI for proper file icon/decoration)
        this.resourceUri = editableUri;
    }

    /**
     * Returns an appropriate icon for the file based on its extension
     */
    private getIconForFile(fileName: string): vscode.ThemeIcon {
        const extension = fileName.toLowerCase().split('.').pop();

        switch (extension) {
            case 'json':
                return new vscode.ThemeIcon('json');
            case 'pbir':
            case 'pbip':
                return new vscode.ThemeIcon('file-code');
            case 'yml':
            case 'yaml':
                return new vscode.ThemeIcon('file-code');
            case 'md':
                return new vscode.ThemeIcon('markdown');
            default:
                return new vscode.ThemeIcon('file');
        }
    }
}
