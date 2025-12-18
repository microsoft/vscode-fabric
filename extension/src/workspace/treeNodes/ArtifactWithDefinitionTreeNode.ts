// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, ArtifactTreeNode, FabricTreeNode, IArtifactManager, IItemDefinition, PayloadType } from '@microsoft/vscode-fabric-api';
import { DefinitionFileTreeNode } from './DefinitionFileTreeNode';
import { DefinitionFolderTreeNode } from './DefinitionFolderTreeNode';
import { DefinitionRootTreeNode } from './DefinitionRootTreeNode';
import { DefinitionFileSystemProvider } from '../DefinitionFileSystemProvider';
import { InstallExtensionTreeNode } from './InstallExtensionTreeNode';
import { getArtifactExtensionId } from '../../metadata/fabricItemUtilities';
import { IFabricExtensionManagerInternal } from '../../apis/internal/fabricExtensionInternal';

/**
 * An artifact tree node that displays definition files as children.
 * This node is collapsible and shows the individual definition parts/files
 * from the artifact's item definition.
 */
export class ArtifactWithDefinitionTreeNode extends ArtifactTreeNode {
    constructor(
        context: vscode.ExtensionContext,
        artifact: IArtifact,
        protected artifactManager: IArtifactManager,
        protected fileSystemProvider: DefinitionFileSystemProvider,
        protected extensionManager?: IFabricExtensionManagerInternal
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

        // Check if extension is missing and should show install prompt as first node
        const extensionId = getArtifactExtensionId(this.artifact);
        if (extensionId && this.extensionManager && !this.extensionManager.isAvailable(extensionId)) {
            children.push(new InstallExtensionTreeNode(this.context, extensionId));
        }

        try {
            // Get the item definition from the artifact manager
            const response = await this.artifactManager.getArtifactDefinition(this.artifact);
            
            if (response.parsedBody?.definition) {
                const definition: IItemDefinition = response.parsedBody.definition;
                
                // Build a hierarchical tree structure from the flat list of parts
                const rootNodes = this.buildTreeStructure(definition.parts);
                
                // Wrap all definition files/folders under a single root node
                if (rootNodes.length > 0) {
                    const definitionRoot = new DefinitionRootTreeNode(this.context);
                    definitionRoot.addChildren(rootNodes);
                    children.push(definitionRoot);
                }
            }
        }
        catch (error) {
            // If there's any error getting the definition, return existing children
            // This allows the node to still be displayed, potentially with install prompt
        }

        return children;
    }

    /**
     * Builds a hierarchical tree structure from a flat list of definition parts
     */
    private buildTreeStructure(parts: IItemDefinition['parts']): FabricTreeNode[] {
        const rootNodes: FabricTreeNode[] = [];
        const folderMap = new Map<string, DefinitionFolderTreeNode>();

        for (const part of parts) {
            // Skip .platform file
            if (part.path === '.platform') {
                continue;
            }

            // Normalize path separators and split into segments
            const normalizedPath = part.path.replace(/\\/g, '/');
            const pathSegments = normalizedPath.split('/').filter(s => s.length > 0);
            
            if (pathSegments.length === 0) {
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
                normalizedPath,
                content
            );

            // Create the file node
            const fileNode = new DefinitionFileTreeNode(
                this.context,
                normalizedPath,
                uri
            );

            // If file is in root (no folders), add directly to root
            if (pathSegments.length === 1) {
                rootNodes.push(fileNode);
            }
            else {
                // File is in a folder hierarchy - create folders as needed
                let currentPath = '';
                let parentFolder: DefinitionFolderTreeNode | null = null;

                // Process all folder segments (all but the last segment which is the file)
                for (let i = 0; i < pathSegments.length - 1; i++) {
                    const segment = pathSegments[i];
                    currentPath = currentPath ? `${currentPath}/${segment}` : segment;

                    // Check if folder already exists
                    let folder = folderMap.get(currentPath);
                    
                    if (!folder) {
                        // Create new folder node
                        folder = new DefinitionFolderTreeNode(
                            this.context,
                            segment,
                            currentPath
                        );
                        folderMap.set(currentPath, folder);

                        // Add to parent folder or root
                        if (parentFolder) {
                            parentFolder.addChild(folder);
                        }
                        else {
                            rootNodes.push(folder);
                        }
                    }

                    parentFolder = folder;
                }

                // Add file to its parent folder
                if (parentFolder) {
                    parentFolder.addChild(fileNode);
                }
            }
        }

        // Sort root nodes: folders first, then files, alphabetically within each group
        const sorted = rootNodes.sort((a, b) => {
            const aIsFolder = a instanceof DefinitionFolderTreeNode;
            const bIsFolder = b instanceof DefinitionFolderTreeNode;
            
            if (aIsFolder && !bIsFolder) {
                return -1;
            }
            if (!aIsFolder && bIsFolder) {
                return 1;
            }
            
            // Both are same type, sort alphabetically by label
            return (a.label as string).localeCompare(b.label as string);
        });

        return sorted;
    }
}
