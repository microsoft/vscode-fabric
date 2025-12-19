// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, ArtifactTreeNode, FabricTreeNode } from '@microsoft/vscode-fabric-api';
import { IArtifactChildNodeProvider } from './childNodeProviders/IArtifactChildNodeProvider';

/**
 * An artifact tree node that composes child nodes from multiple providers.
 * This allows for flexible composition of child node behaviors without deep inheritance hierarchies.
 */
export class ComposableArtifactTreeNode extends ArtifactTreeNode {
    constructor(
        context: vscode.ExtensionContext,
        artifact: IArtifact,
        private readonly childNodeProviders: IArtifactChildNodeProvider[]
    ) {
        super(context, artifact);

        // Set to collapsed if any provider can provide children
        if (childNodeProviders.some(p => p.canProvideChildren(artifact))) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
    }

    /**
     * Returns child nodes by aggregating from all registered providers
     */
    async getChildNodes(): Promise<FabricTreeNode[]> {
        const allChildren: FabricTreeNode[] = [];

        // Collect children from all providers that can provide for this artifact
        for (const provider of this.childNodeProviders) {
            if (provider.canProvideChildren(this.artifact)) {
                const children = await provider.getChildNodes(this.artifact);
                allChildren.push(...children);
            }
        }

        return allChildren;
    }
}
