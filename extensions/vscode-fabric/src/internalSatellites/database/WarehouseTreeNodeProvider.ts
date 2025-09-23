import * as vscode from 'vscode';
import { IFabricTreeNodeProvider, ArtifactTreeNode, IArtifact } from '@microsoft/vscode-fabric-api';
import { WarehouseTreeNode } from './WarehouseTreeNode';

export class WarehouseTreeNodeProvider implements IFabricTreeNodeProvider {
    public readonly artifactType = 'Warehouse';

    constructor(private context: vscode.ExtensionContext) {}

    async createArtifactTreeNode(artifact: IArtifact): Promise<ArtifactTreeNode> {
        return new WarehouseTreeNode(this.context, artifact);
    }
}
