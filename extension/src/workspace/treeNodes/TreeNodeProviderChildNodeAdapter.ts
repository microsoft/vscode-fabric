// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { FabricTreeNode, IArtifact, IFabricTreeNodeProvider } from '@microsoft/vscode-fabric-api';
import { IArtifactChildNodeProvider } from './IArtifactChildNodeProvider';

/**
 * Adapter that wraps a satellite's IFabricTreeNodeProvider to work as an IArtifactChildNodeProvider.
 * This allows existing satellite extensions to participate in the composable child node system
 * without requiring changes to their code.
 * 
 * The adapter creates a tree node from the provider, extracts its children, and also applies
 * any customizations (icon, context values, etc.) from the satellite's node to the parent.
 */
export class TreeNodeProviderChildNodeAdapter implements IArtifactChildNodeProvider {
    private createdNode?: FabricTreeNode;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly treeNodeProvider: IFabricTreeNodeProvider
    ) {}

    canProvideChildren(artifact: IArtifact): boolean {
        // The provider can provide children if it handles this artifact type
        return this.treeNodeProvider.artifactType === artifact.type;
    }

    async getChildNodes(artifact: IArtifact): Promise<FabricTreeNode[]> {
        // Create the tree node using the provider
        this.createdNode = await this.treeNodeProvider.createArtifactTreeNode(artifact);
        
        // Get the children from the created node
        const children = await this.createdNode.getChildNodes();
        
        return children;
    }

    /**
     * Gets the tree node created by the satellite's provider.
     * This can be used to extract customizations like icon, context values, etc.
     */
    getCreatedNode(): FabricTreeNode | undefined {
        return this.createdNode;
    }
}
