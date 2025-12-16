// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ExtensionContext } from 'vscode';
import { IFabricTreeNodeProvider, ArtifactTreeNode, IArtifact, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { NotebookTreeNode } from './NotebookTreeNode';
import { DefinitionFileSystemProvider } from '../../workspace/DefinitionFileSystemProvider';

export class NotebookTreeNodeProvider implements IFabricTreeNodeProvider {
    public readonly artifactType = 'Notebook';

    constructor(
        private context: ExtensionContext,
        private artifactManager: IArtifactManager,
        private fileSystemProvider: DefinitionFileSystemProvider
    ) {
    }

    async createArtifactTreeNode(artifact: IArtifact): Promise<ArtifactTreeNode> {
        return new NotebookTreeNode(this.context, artifact, this.artifactManager, this.fileSystemProvider);
    }
}
