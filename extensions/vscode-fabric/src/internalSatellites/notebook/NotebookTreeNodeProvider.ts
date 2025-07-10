import { ExtensionContext } from 'vscode';
import { IFabricTreeNodeProvider, ArtifactTreeNode, IArtifact, IFabricApiClient } from '@fabric/vscode-fabric-api';
import { NotebookTreeNode } from './NotebookTreeNode';

export class NotebookTreeNodeProvider implements IFabricTreeNodeProvider {
    public readonly artifactType = 'Notebook';

    constructor(private context: ExtensionContext) {
    }

    async createArtifactTreeNode(artifact: IArtifact): Promise<ArtifactTreeNode> {
        return new NotebookTreeNode(this.context, artifact);
    }
}