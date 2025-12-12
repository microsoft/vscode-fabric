// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { getDisplayNamePlural, getArtifactDefaultIconPath, getArtifactIconPath } from '../../metadata/fabricItemUtilities';
import { IArtifact, FabricTreeNode, IFabricTreeNodeProvider, ArtifactTreeNode  } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionManagerInternal } from '../../apis/internal/fabricExtensionInternal';
import { createArtifactTreeNode } from './artifactTreeNodeFactory';
import { ILocalFolderService } from '../../LocalFolderService';

export class ArtifactTypeTreeNode extends FabricTreeNode {
    private _children = new Map<string, IArtifact>();
    private treeNodeProvider: IFabricTreeNodeProvider | undefined;

    public get displayName() {
        return getDisplayNamePlural(this.artifactType) ?? this.artifactType;
    };

    constructor(
        context: vscode.ExtensionContext,
        protected extensionManager: IFabricExtensionManagerInternal,
        public artifactType: string,
        public readonly workspaceId: string,
        private tenantId: string | undefined,
        private localFolderService: ILocalFolderService,
        private shouldExpand?: (id: string | undefined) => boolean
    ) {
        super(context, getDisplayNamePlural(artifactType) ?? artifactType, vscode.TreeItemCollapsibleState.Collapsed);
        this.treeNodeProvider = this.extensionManager.treeNodeProviders.get(artifactType);
        this.contextValue = 'ItemType';
        this.iconPath = getArtifactIconPath(this.context.extensionUri, artifactType) ?? getArtifactDefaultIconPath(this.context.extensionUri);
        // Stable id for VS Code view state restoration
        const tenantPart = this.tenantId && this.tenantId.length > 0 ? this.tenantId : 'none';
        this.id = `grp:${tenantPart}:${this.workspaceId}:${this.artifactType}`;
        if (this.shouldExpand?.(this.id)) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
    }

    addArtifact(artifact: IArtifact) {
        if (artifact.displayName && !this._children.has(artifact.id)) {
            this._children.set(artifact.id, artifact);
        }
    }

    async getChildNodes(): Promise<FabricTreeNode[]> {
        const childNodes: FabricTreeNode[] = [];

        const sortedArtifacts = [...this._children.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
        for (const artifact of sortedArtifacts) {
            const artifactNode: ArtifactTreeNode = await createArtifactTreeNode(this.context, artifact, this.extensionManager, this.treeNodeProvider, this.localFolderService);
            childNodes.push(artifactNode);
        }

        return childNodes;
    }
}
