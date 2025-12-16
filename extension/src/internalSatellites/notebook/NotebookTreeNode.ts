// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { ArtifactWithDefinitionTreeNode } from '../../workspace/treeNodes/ArtifactWithDefinitionTreeNode';
import { DefinitionFileSystemProvider } from '../../workspace/DefinitionFileSystemProvider';

export class NotebookTreeNode extends ArtifactWithDefinitionTreeNode {
    constructor(
        context: vscode.ExtensionContext,
        public readonly artifact: IArtifact,
        artifactManager: IArtifactManager,
        fileSystemProvider: DefinitionFileSystemProvider
    ) {
        super(context, artifact, artifactManager, fileSystemProvider);
        this.contextValue += '|item-open-in-notebook';
    }

    public async getExternalUri(): Promise<string> {
        const targetUrl = `${vscode.env.uriScheme}://SynapseVSCode.synapse?workspaceId=${this.artifact.workspaceId}&artifactId=${this.artifact.id}`;
        return targetUrl;
    }
}
