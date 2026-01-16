// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

import { TelemetryService } from '@microsoft/vscode-fabric-util';
import { IWorkspaceManager, IArtifact, IWorkspace, FabricTreeNode } from '@microsoft/vscode-fabric-api';
import { WorkspaceTreeNode } from './WorkspaceTreeNode';
import { DisplayStyle } from '../definitions';
import { ArtifactTypeTreeNode } from './ArtifactTypeTreeNode';
import { IFabricExtensionManagerInternal } from '../../apis/internal/fabricExtensionInternal';
import { ILocalFolderService } from '../../LocalFolderService';
import { IArtifactChildNodeProviderCollection } from './childNodeProviders/ArtifactChildNodeProviderCollection';

export class TreeViewWorkspaceTreeNode extends WorkspaceTreeNode {
    private _children: Map<string, ArtifactTypeTreeNode> | undefined;

    constructor(context: vscode.ExtensionContext,
        extensionManager: IFabricExtensionManagerInternal,
        workspace: IWorkspace,
        telemetryService: TelemetryService | null,
        workspaceManager: IWorkspaceManager,
        private tenantId: string | undefined,
        private localFolderService: ILocalFolderService,
        private childNodeProviders: IArtifactChildNodeProviderCollection,
        private shouldExpand?: (id: string | undefined) => boolean
    ) {
        super(context, extensionManager, workspace, DisplayStyle.tree, telemetryService, workspaceManager);
        // Stable id for VS Code view state restoration
        const tenantPart = tenantIdOrNone(tenantId);
        this.id = `ws:${tenantPart}:${workspace.objectId}`;
        if (this.shouldExpand?.(this.id)) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
    }

    protected async addArtifact(artifact: IArtifact) {
        if (!this._children!.has(artifact.type)) {
            this._children!.set(
                artifact.type,
                new ArtifactTypeTreeNode(
                    this.context,
                    this.extensionManager,
                    artifact.type,
                    this.workspace.objectId,
                    this.tenantId,
                    this.localFolderService,
                    this.childNodeProviders,
                    this.shouldExpand
                )
            );
        }
        this._children!.get(artifact.type)?.addArtifact(artifact);
    }

    protected ensureReady() {
        if (!this._children) {
            this._children = new Map<string, ArtifactTypeTreeNode>();
        }
    }

    protected isReady(): boolean {
        return !!this._children;
    }

    protected reset() {
        this._children = undefined;
    }

    protected sortChildren(): FabricTreeNode[] {
        if (this._children) {
            return [...this._children.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
        }

        return [];
    }
}

function tenantIdOrNone(tenantId: string | undefined): string {
    return tenantId && tenantId.length > 0 ? tenantId : 'none';
}
