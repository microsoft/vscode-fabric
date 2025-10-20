// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

import { IWorkspace, IWorkspaceManager, ArtifactTreeNode, IArtifact, IFabricTreeNodeProvider, FabricTreeNode, IWorkspaceFolder } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionManagerInternal } from '../../apis/internal/fabricExtensionInternal';
import { TelemetryService, TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { WorkspaceTreeNode } from './WorkspaceTreeNode';
import { DisplayStyle } from '../definitions';
import { createArtifactTreeNode } from './artifactTreeNodeFactory';
import { getDisplayName } from '../../metadata/fabricItemUtilities';
import { FolderTreeNode } from './FolderTreeNode';
import { CoreTelemetryEventNames } from '../../TelemetryEventNames';

export class ListViewWorkspaceTreeNode extends WorkspaceTreeNode {
    private _rootFolderNodes: FolderTreeNode[] | undefined;
    private _rootArtifactNodes: ArtifactTreeNode[] | undefined;
    private _folderNodesById: Map<string, FolderTreeNode> | undefined;
    private _foldersLoaded = false;

    constructor(context: vscode.ExtensionContext,
        extensionManager: IFabricExtensionManagerInternal,
        workspace: IWorkspace,
        telemetryService: TelemetryService | null,
        workspaceManager: IWorkspaceManager,
        private tenantId: string | undefined,
        private shouldExpand?: (id: string | undefined) => boolean
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
        const treeNodeProvider: IFabricTreeNodeProvider | undefined = this.extensionManager.treeNodeProviders.get(artifact.type);
        const artifactNode: ArtifactTreeNode = await createArtifactTreeNode(this.context, artifact, this.extensionManager, treeNodeProvider);

        let description = getDisplayName(artifact);
        if (typeof artifactNode.description === 'string' && artifactNode.description.length > 0) {
            description = `${description} ${artifactNode.description}`;
        }
        artifactNode.description = description;

        if (artifact.folderId && this._folderNodesById?.has(artifact.folderId)) {
            this._folderNodesById.get(artifact.folderId)?.addArtifact(artifactNode);
        }
        else {
            this._rootArtifactNodes?.push(artifactNode);
        }
    }

    protected ensureReady(): void {
        if (!this._rootFolderNodes || !this._rootArtifactNodes || !this._folderNodesById) {
            this._rootFolderNodes = [];
            this._rootArtifactNodes = [];
            this._folderNodesById = new Map<string, FolderTreeNode>();
        }
    }

    protected isReady(): boolean {
        return !!this._rootFolderNodes && !!this._rootArtifactNodes && !!this._folderNodesById;
    }

    protected reset() {
        this._rootFolderNodes = undefined;
        this._rootArtifactNodes = undefined;
        this._folderNodesById = undefined;
        this._foldersLoaded = false;
    }

    protected sortChildren(): FabricTreeNode[] {
        if (this._rootFolderNodes && this._rootArtifactNodes) {
            const sortedFolders = [...this._rootFolderNodes].sort((a, b) => nodeLabel(a).localeCompare(nodeLabel(b)));
            const sortedArtifacts = [...this._rootArtifactNodes].sort((a, b) => a.artifact.displayName.localeCompare(b.artifact.displayName));
            return [...sortedFolders, ...sortedArtifacts];
        }

        return [];
    }

    protected async loadFolders(): Promise<void> {
        if (this._foldersLoaded) {
            return;
        }

        if (!this._folderNodesById || !this._rootFolderNodes) {
            this.ensureReady();
        }

        const folders = await this.workspaceManager.getFoldersInWorkspace(this.workspace.objectId);
        if (folders.length > 0) {
            this.initializeFolderStructure(folders);
        }

        this._foldersLoaded = true;
    }

    private initializeFolderStructure(folders: IWorkspaceFolder[]): void {
        if (!this._folderNodesById || !this._rootFolderNodes) {
            return;
        }

        this._folderNodesById.clear();
        this._rootFolderNodes.length = 0;

        folders.forEach(folder => {
            const folderNode = new FolderTreeNode(this.context, folder);
            this._folderNodesById!.set(folder.id, folderNode);
        });

        folders.forEach(folder => {
            const folderNode = this._folderNodesById!.get(folder.id);
            if (!folderNode) {
                return;
            }

            const parentId = folder.parentFolderId;
            if (parentId && this._folderNodesById!.has(parentId)) {
                this._folderNodesById!.get(parentId)!.addFolder(folderNode);
            }
            else {
                this._rootFolderNodes!.push(folderNode);
            }
        });
    }
}

function tenantIdOrNone(tenantId: string | undefined): string {
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
