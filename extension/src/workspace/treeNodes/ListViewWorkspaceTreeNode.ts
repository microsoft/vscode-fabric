// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

import { IWorkspace, IWorkspaceManager, ArtifactTreeNode, IArtifact, FabricTreeNode, IWorkspaceFolder, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionManagerInternal } from '../../apis/internal/fabricExtensionInternal';
import { TelemetryService } from '@microsoft/vscode-fabric-util';
import { WorkspaceTreeNode } from './WorkspaceTreeNode';
import { DisplayStyle } from '../definitions';
import { createArtifactTreeNode } from './artifactTreeNodeFactory';
import { getDisplayName } from '../../metadata/fabricItemUtilities';
import { ILocalFolderService } from '../../LocalFolderService';
import { FolderTreeNode } from './FolderTreeNode';
import { DefinitionFileSystemProvider } from '../DefinitionFileSystemProvider';

export class ListViewWorkspaceTreeNode extends WorkspaceTreeNode {
    private _rootFolderNodes: FolderTreeNode[] = [];
    private _rootArtifactNodes: ArtifactTreeNode[] = [];
    private _folderNodesById: Map<string, FolderTreeNode> = new Map<string, FolderTreeNode>();
    private _foldersLoaded = false;
    private _initialized = false;

    constructor(context: vscode.ExtensionContext,
        extensionManager: IFabricExtensionManagerInternal,
        workspace: IWorkspace,
        telemetryService: TelemetryService | null,
        workspaceManager: IWorkspaceManager,
        tenantId: string | null,
        private localFolderService: ILocalFolderService,
        private artifactManager: IArtifactManager,
        private fileSystemProvider: DefinitionFileSystemProvider,
        private shouldExpand?: (id?: string) => boolean
    ) {
        super(context, extensionManager, workspace, DisplayStyle.list, telemetryService, workspaceManager);
        // Stable id for VS Code view state restoration
        const tenantPart = tenantIdOrNone(tenantId);
        this.id = `ws:${tenantPart}:${workspace.objectId}`;
        if (this.shouldExpand?.(this.id)) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
    }

    protected async addArtifact(artifact: IArtifact): Promise<void> {
        const treeNodeProvider = this.extensionManager.treeNodeProviders.get(artifact.type);
        const artifactNode: ArtifactTreeNode = await createArtifactTreeNode(this.context, artifact, this.extensionManager, treeNodeProvider, this.localFolderService, this.artifactManager, this.fileSystemProvider);

        let description = getDisplayName(artifact);
        if (typeof artifactNode.description === 'string' && artifactNode.description.length > 0) {
            description = `${description} ${artifactNode.description}`;
        }
        artifactNode.description = description;

        if (artifact.folderId) {
            const folderNode = this._folderNodesById.get(artifact.folderId);
            if (folderNode) {
                folderNode.addArtifact(artifactNode);
                return;
            }
        }

        this._rootArtifactNodes.push(artifactNode);
    }

    protected ensureReady(): void {
        if (this._initialized) {
            return;
        }

        this.resetCollections();
        this._initialized = true;
    }

    protected isReady(): boolean {
        return this._initialized;
    }

    protected reset() {
        this.resetCollections();
        this._foldersLoaded = false;
        this._initialized = false;
    }

    protected sortChildren(): FabricTreeNode[] {
        const sortedFolders = [...this._rootFolderNodes].sort((a, b) => nodeLabel(a).localeCompare(nodeLabel(b)));
        const sortedArtifacts = [...this._rootArtifactNodes].sort((a, b) => a.artifact.displayName.localeCompare(b.artifact.displayName));
        return [...sortedFolders, ...sortedArtifacts];
    }

    protected async loadFolders(): Promise<void> {
        if (this._foldersLoaded) {
            return;
        }

        this.ensureReady();

        const folders = await this.workspaceManager.getFoldersInWorkspace(this.workspace.objectId);
        if (folders.length > 0) {
            this.initializeFolderStructure(folders);
        }

        this._foldersLoaded = true;
    }

    private initializeFolderStructure(folders: IWorkspaceFolder[]): void {
        this.ensureReady();

        this._folderNodesById.clear();
        this._rootFolderNodes.length = 0;

        folders.forEach(folder => {
            const folderNode = new FolderTreeNode(this.context, folder);
            this._folderNodesById.set(folder.id, folderNode);
        });

        folders.forEach(folder => {
            const folderNode = this._folderNodesById.get(folder.id);
            if (!folderNode) {
                return;
            }

            const parentId = folder.parentFolderId;
            if (parentId) {
                const parentFolderNode = this._folderNodesById.get(parentId);
                if (parentFolderNode) {
                    parentFolderNode.addFolder(folderNode);
                    return;
                }
            }

            this._rootFolderNodes.push(folderNode);
        });
    }

    private resetCollections(): void {
        this._rootFolderNodes.length = 0;
        this._rootArtifactNodes.length = 0;
        this._folderNodesById.clear();
    }
}

function tenantIdOrNone(tenantId: string | null): string {
    return tenantId && tenantId.length > 0 ? tenantId : 'none';
}

function nodeLabel(node: FabricTreeNode): string {
    if (typeof node.label === 'string') {
        return node.label;
    }

    if (node.label?.label) {
        return node.label.label;
    }

    return '';
}
