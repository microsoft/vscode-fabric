// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { LocalProjectTreeNode, FabricTreeNode } from '@microsoft/vscode-fabric-api';
import { InstallExtensionTreeNode } from '../workspace/treeNodes/InstallExtensionTreeNode';

export class MissingExtensionLocalProjectTreeNode extends LocalProjectTreeNode {
    constructor(context: vscode.ExtensionContext, displayName: string, folder: vscode.Uri, private extensionId: string) {
        super(context, displayName, folder);
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }

    async getChildNodes(): Promise<FabricTreeNode[]> {
        return [new InstallExtensionTreeNode(this.context, this.extensionId)];
    }
}
