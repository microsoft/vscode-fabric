// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, ArtifactTreeNode, FabricTreeNode, IArtifactManager, IItemDefinition } from '@microsoft/vscode-fabric-api';
import { DefinitionFileTreeNode } from './DefinitionFileTreeNode';

/**
 * An artifact tree node that displays definition files as children.
 * This node is collapsible and shows the individual definition parts/files
 * from the artifact's item definition.
 */
export class ItemDefinitionTreeNode extends ArtifactTreeNode {
    constructor(
        context: vscode.ExtensionContext,
        artifact: IArtifact,
        private artifactManager: IArtifactManager
    ) {
        super(context, artifact);
        
        // Make this node collapsible to show definition files
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }

    /**
     * Returns the definition files as child nodes
     */
    async getChildNodes(): Promise<FabricTreeNode[]> {
        const children: FabricTreeNode[] = [];

        try {
            // Get the item definition from the artifact manager
            const response = await this.artifactManager.getArtifactDefinition(this.artifact);
            
            if (response.parsedBody?.definition) {
                const definition: IItemDefinition = response.parsedBody.definition;
                
                // Create tree nodes from definition parts
                if (definition.parts && Array.isArray(definition.parts)) {
                    for (const part of definition.parts) {
                        // Skip .platform file
                        if (part.path === '.platform') {
                            continue;
                        }
                        
                        children.push(new DefinitionFileTreeNode(
                            this.context,
                            part.path
                        ));
                    }

                    // Sort files alphabetically
                    children.sort((a, b) => {
                        const nodeA = a as DefinitionFileTreeNode;
                        const nodeB = b as DefinitionFileTreeNode;
                        return nodeA.fileName.localeCompare(nodeB.fileName);
                    });
                }
            }
        }
        catch (error) {
            // If there's any error getting the definition, return empty children
            // This allows the node to still be displayed, just without children
        }

        return children;
    }
}
