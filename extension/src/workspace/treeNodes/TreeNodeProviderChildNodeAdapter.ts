// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ArtifactTreeNode, FabricTreeNode, IArtifact, IFabricTreeNodeProvider } from '@microsoft/vscode-fabric-api';
import { IArtifactChildNodeProvider } from './IArtifactChildNodeProvider';

/**
 * Adapter that wraps a satellite's IFabricTreeNodeProvider to work as an IArtifactChildNodeProvider.
 * This allows existing satellite extensions to participate in the composable child node system
 * without requiring changes to their code.
 *
 * The adapter uses lazy initialization to create the satellite's tree node on first access,
 * ensuring customizations (icon, context values, etc.) are available when needed.
 */
export class TreeNodeProviderChildNodeAdapter implements IArtifactChildNodeProvider {
    private satelliteNodePromise?: Promise<ArtifactTreeNode>;

    constructor(
        private readonly treeNodeProvider: IFabricTreeNodeProvider,
        private readonly artifact: IArtifact
    ) {
    }

    private ensureSatelliteNode(): Promise<ArtifactTreeNode> {
        if (!this.satelliteNodePromise) {
            this.satelliteNodePromise = this.treeNodeProvider.createArtifactTreeNode(this.artifact);
        }
        return this.satelliteNodePromise;
    }

    canProvideChildren(artifact: IArtifact): boolean {
        // The provider can provide children if it handles this artifact type
        return this.treeNodeProvider.artifactType === artifact.type;
    }

    async getChildNodes(artifact: IArtifact): Promise<FabricTreeNode[]> {
        const node = await this.ensureSatelliteNode();
        return node.getChildNodes();
    }

    /**
     * Gets the tree node created by the satellite's provider.
     * This can be used to extract customizations like icon, context values, etc.
     */
    async getSatelliteNode(): Promise<ArtifactTreeNode> {
        return await this.ensureSatelliteNode();
    }
}
