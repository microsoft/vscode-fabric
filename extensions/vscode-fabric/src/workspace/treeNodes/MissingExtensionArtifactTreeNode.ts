// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

import { IArtifact, FabricTreeNode, ArtifactTreeNode  } from '@microsoft/vscode-fabric-api';
import { InstallExtensionTreeNode } from './InstallExtensionTreeNode';

export class MissingExtensionArtifactTreeNode extends ArtifactTreeNode {
    constructor(context: vscode.ExtensionContext, artifact: IArtifact, private extensionId: string) {
        super(context, artifact);
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }

    async getChildNodes(): Promise<FabricTreeNode[]> {
        return [new InstallExtensionTreeNode(this.context, this.extensionId)];
    }
}
