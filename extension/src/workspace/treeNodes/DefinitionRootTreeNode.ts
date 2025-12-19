// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { FabricTreeNode } from '@microsoft/vscode-fabric-api';

/**
 * Represents the root node for all definition files and folders within an artifact.
 * This node groups all definition content under a single collapsible node.
 */
export class DefinitionRootTreeNode extends FabricTreeNode {
    public children: FabricTreeNode[] = [];

    /**
     * Creates a new instance of the DefinitionRootTreeNode class
     * @param context - The VS Code extension context
     */
    constructor(context: vscode.ExtensionContext) {
        super(context, vscode.l10n.t('Definition'), vscode.TreeItemCollapsibleState.Collapsed);
        
        // Set folder icon to indicate this is a container
        this.iconPath = new vscode.ThemeIcon('folder-library');
        
        // Set tooltip
        this.tooltip = vscode.l10n.t('Item definition files');

        this.contextValue = 'definition-root';
    }

    /**
     * Returns the child nodes (files and folders)
     */
    async getChildNodes(): Promise<FabricTreeNode[]> {
        return this.children;
    }

    /**
     * Adds a child node to this root
     */
    addChild(child: FabricTreeNode): void {
        this.children.push(child);
    }

    /**
     * Adds multiple child nodes to this root
     */
    addChildren(children: FabricTreeNode[]): void {
        this.children.push(...children);
    }
}
