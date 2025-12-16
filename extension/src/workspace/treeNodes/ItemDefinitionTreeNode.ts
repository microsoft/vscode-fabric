// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, ArtifactTreeNode, FabricTreeNode, IArtifactManager, IItemDefinition, PayloadType } from '@microsoft/vscode-fabric-api';
import { DefinitionFileTreeNode } from './DefinitionFileTreeNode';
import { DefinitionFileSystemProvider } from '../DefinitionFileSystemProvider';

/**
 * An artifact tree node that displays definition files as children.
 * This node is collapsible and shows the individual definition parts/files
 * from the artifact's item definition.
 */
export class ItemDefinitionTreeNode extends ArtifactTreeNode {
    constructor(
        context: vscode.ExtensionContext,
        artifact: IArtifact,
        protected artifactManager: IArtifactManager,
        protected fileSystemProvider: DefinitionFileSystemProvider
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
                for (const part of definition.parts) {
                    // Skip .platform file
                    if (part.path === '.platform') {
                        continue;
                    }
                    
                    // Decode the payload content
                    let content: Uint8Array;
                    if (part.payloadType === PayloadType.InlineBase64) {
                        // Decode base64 content
                        content = Buffer.from(part.payload, 'base64');
                    }
                    else {
                        // For other payload types, convert to bytes
                        content = Buffer.from(part.payload, 'utf-8');
                    }

                    // Register the file in the file system provider and get the URI
                    const uri = this.fileSystemProvider.registerFile(
                        this.artifact,
                        part.path,
                        content
                    );
                    
                    children.push(new DefinitionFileTreeNode(
                        this.context,
                        part.path,
                        uri
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
        catch (error) {
            // If there's any error getting the definition, return empty children
            // This allows the node to still be displayed, just without children
        }

        return children;
    }
}
