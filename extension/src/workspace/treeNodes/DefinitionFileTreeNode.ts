// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { FabricTreeNode } from '@microsoft/vscode-fabric-api';

/**
 * Represents a single file within an item definition in the workspace tree view.
 * This node is a leaf node (no children) that represents a definition part/file.
 */
export class DefinitionFileTreeNode extends FabricTreeNode {
    /**
     * Creates a new instance of the DefinitionFileTreeNode class
     * @param context - The VS Code extension context
     * @param fileName - The name/path of the definition file
     * @param payload - The content of the definition file (base64 encoded)
     * @param payloadType - The type of payload encoding
     */
    constructor(
        context: vscode.ExtensionContext,
        public readonly fileName: string,
        public readonly payload: string,
        public readonly payloadType: string
    ) {
        super(context, fileName, vscode.TreeItemCollapsibleState.None);
        
        // Set icon based on file type
        this.iconPath = this.getIconForFile(fileName);
        
        // Set tooltip
        this.tooltip = vscode.l10n.t('Definition file: {0}', fileName);

        // Add command to open the content when clicked
        this.command = {
            command: 'vscode-fabric.openDefinitionFile',
            title: 'Open Definition File',
            arguments: [this],
        };

        this.contextValue = 'definition-file';
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
