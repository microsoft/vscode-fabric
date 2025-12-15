// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, ArtifactTreeNode, FabricTreeNode } from '@microsoft/vscode-fabric-api';
import { ILocalFolderService } from '../../LocalFolderService';
import { DefinitionFileTreeNode } from './DefinitionFileTreeNode';
import * as path from 'path';

/**
 * An artifact tree node that displays definition files as children.
 * This node is collapsible and shows the individual definition parts/files
 * when the artifact has a local folder with definition files.
 */
export class ItemDefinitionTreeNode extends ArtifactTreeNode {
    constructor(
        context: vscode.ExtensionContext,
        artifact: IArtifact,
        private localFolderService: ILocalFolderService
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
            // Get the local folder for this artifact
            const localFolderResult = await this.localFolderService.getLocalFolder(
                this.artifact,
                { prompt: 'never' as any }
            );

            if (localFolderResult) {
                const folderUri = localFolderResult.uri;
                
                // Check if the folder exists and read its contents
                try {
                    const entries = await vscode.workspace.fs.readDirectory(folderUri);
                    
                    // Filter for definition files and create tree nodes
                    for (const [name, type] of entries) {
                        // Only show files (not directories)
                        if (type === vscode.FileType.File) {
                            const fileUri = vscode.Uri.joinPath(folderUri, name);
                            children.push(new DefinitionFileTreeNode(
                                this.context,
                                name,
                                fileUri
                            ));
                        }
                    }

                    // Sort files alphabetically
                    children.sort((a, b) => {
                        const nodeA = a as DefinitionFileTreeNode;
                        const nodeB = b as DefinitionFileTreeNode;
                        return nodeA.fileName.localeCompare(nodeB.fileName);
                    });
                }
                catch (fsError) {
                    // Folder doesn't exist or can't be read - return empty children
                    // This is expected if the definition hasn't been downloaded yet
                }
            }
        }
        catch (error) {
            // If there's any error getting the local folder, return empty children
            // This allows the node to still be displayed, just without children
        }

        return children;
    }
}
