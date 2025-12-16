// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { FabricTreeNode } from '@microsoft/vscode-fabric-api';

/**
 * Represents a folder within an item definition in the workspace tree view.
 * This node is collapsible and contains child files or folders.
 */
export class DefinitionFolderTreeNode extends FabricTreeNode {
    public children: FabricTreeNode[] = [];

    /**
     * Creates a new instance of the DefinitionFolderTreeNode class
     * @param context - The VS Code extension context
     * @param folderName - The name of the folder
     * @param folderPath - The full path of the folder
     */
    constructor(
        context: vscode.ExtensionContext,
        public readonly folderName: string,
        public readonly folderPath: string
    ) {
        super(context, folderName, vscode.TreeItemCollapsibleState.Collapsed);
        
        // Set folder icon
        this.iconPath = new vscode.ThemeIcon('folder');
        
        // Set tooltip
        this.tooltip = vscode.l10n.t('Folder: {0}', folderPath);

        this.contextValue = 'definition-folder';
    }

    /**
     * Returns the child nodes (files and subfolders)
     */
    async getChildNodes(): Promise<FabricTreeNode[]> {
        // Sort children: folders first, then files, alphabetically within each group
        return this.children.sort((a, b) => {
            const aIsFolder = a instanceof DefinitionFolderTreeNode;
            const bIsFolder = b instanceof DefinitionFolderTreeNode;
            
            if (aIsFolder && !bIsFolder) {
                return -1;
            }
            if (!aIsFolder && bIsFolder) {
                return 1;
            }
            
            // Both are same type, sort alphabetically by label
            return (a.label as string).localeCompare(b.label as string);
        });
    }

    /**
     * Adds a child node to this folder
     */
    addChild(child: FabricTreeNode): void {
        this.children.push(child);
    }
}
