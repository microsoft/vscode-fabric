// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

import { ArtifactTreeNode, FabricTreeNode, IWorkspaceFolder } from '@microsoft/vscode-fabric-api';

export class FolderTreeNode extends FabricTreeNode {
    private readonly childFolders: FolderTreeNode[] = [];
    private readonly childArtifacts: ArtifactTreeNode[] = [];

    constructor(context: vscode.ExtensionContext, public readonly folder: IWorkspaceFolder) {
        super(context, folder.displayName, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'WorkspaceFolderTreeNode';
        this.tooltip = folder.displayName;
        this.iconPath = new vscode.ThemeIcon('folder');
        this.id = `ws-folder:${folder.workspaceId}:${folder.id}`;
    }

    addFolder(folderNode: FolderTreeNode): void {
        this.childFolders.push(folderNode);
    }

    addArtifact(artifactNode: ArtifactTreeNode): void {
        this.childArtifacts.push(artifactNode);
    }

    async getChildNodes(): Promise<FabricTreeNode[]> {
        const sortedFolders = [...this.childFolders].sort((a, b) => getLabel(a).localeCompare(getLabel(b)));
        const sortedArtifacts = [...this.childArtifacts].sort((a, b) => a.artifact.displayName.localeCompare(b.artifact.displayName));
        return [...sortedFolders, ...sortedArtifacts];
    }
}

function getLabel(node: FabricTreeNode): string {
    if (typeof node.label === 'string') {
        return node.label;
    }

    if (node.label?.label) {
        return node.label.label;
    }

    return '';
}
