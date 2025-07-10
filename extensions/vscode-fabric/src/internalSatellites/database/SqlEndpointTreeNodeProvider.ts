import * as vscode from 'vscode';
import { IFabricTreeNodeProvider, ArtifactTreeNode, IArtifact } from '@fabric/vscode-fabric-api';
import { SqlEndpointTreeNode } from './SqlEndpointTreeNode';

export class SqlEndpointTreeNodeProvider implements IFabricTreeNodeProvider {
    public readonly artifactType = 'SQLEndpoint';

    constructor(private context: vscode.ExtensionContext) {
    }

    async createArtifactTreeNode(artifact: IArtifact): Promise<ArtifactTreeNode> {
        return new SqlEndpointTreeNode(this.context, artifact);
    }
}
