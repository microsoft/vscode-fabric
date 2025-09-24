// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

import { IFabricTreeNodeProvider, ArtifactTreeNode, IArtifact } from '@microsoft/vscode-fabric-api';
import { SqlDatabaseTreeNode } from './SqlDatabaseTreeNode';

export class SqlDatabaseTreeNodeProvider implements IFabricTreeNodeProvider {
    public readonly artifactType = 'SQLDatabase';

    constructor(private context: vscode.ExtensionContext) {
    }

    async createArtifactTreeNode(artifact: IArtifact): Promise<ArtifactTreeNode> {
        return new SqlDatabaseTreeNode(this.context, artifact);
    }
}
