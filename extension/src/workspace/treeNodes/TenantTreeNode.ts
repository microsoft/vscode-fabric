// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

import { FabricTreeNode, IWorkspaceManager, IWorkspace, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { TelemetryService } from '@microsoft/vscode-fabric-util';
import { IFabricExtensionManagerInternal } from '../../apis/internal/fabricExtensionInternal';
import { ListViewWorkspaceTreeNode } from './ListViewWorkspaceTreeNode';
import { TreeViewWorkspaceTreeNode } from './TreeViewWorkspaceTreeNode';
import { DisplayStyle } from '../definitions';
import { ITenantSettings } from '../../authentication';
import { ILocalFolderService } from '../../LocalFolderService';
import { IArtifactChildNodeProviderCollection } from './childNodeProviders/ArtifactChildNodeProviderCollection';

export class TenantTreeNode extends FabricTreeNode {
    constructor(
        context: vscode.ExtensionContext,
        protected extensionManager: IFabricExtensionManagerInternal,
        protected telemetryService: TelemetryService | null,
        protected workspaceManager: IWorkspaceManager,
        private tenant: ITenantSettings,
        private displayStyle: DisplayStyle,
        private localFolderService: ILocalFolderService,
        private childNodeProviders: IArtifactChildNodeProviderCollection,
        private shouldExpand?: (id: string | undefined) => boolean,
        private filteredWorkspaces?: IWorkspace[]
    ) {
        super(context, tenant.displayName, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'TenantTreeNode';
        this.iconPath = new vscode.ThemeIcon('organization');
        // Stable id for VS Code view state restoration
        this.id = `tenant:${tenant.tenantId}`;
        if (this.shouldExpand?.(this.id)) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
    }

    async getChildNodes(): Promise<FabricTreeNode[]> {

        try {
            // Use filtered workspaces if provided, otherwise load all workspaces
            const workspaces = this.filteredWorkspaces || await this.workspaceManager.listWorkspaces();

            return workspaces.map(workspace =>
                this.displayStyle === DisplayStyle.list
                    ? new ListViewWorkspaceTreeNode(
                        this.context,
                        this.extensionManager,
                        workspace,
                        this.telemetryService,
                        this.workspaceManager,
                        this.tenant.tenantId,
                        this.localFolderService,
                        this.childNodeProviders,
                        this.shouldExpand
                    )
                    : new TreeViewWorkspaceTreeNode(
                        this.context,
                        this.extensionManager,
                        workspace,
                        this.telemetryService,
                        this.workspaceManager,
                        this.tenant.tenantId,
                        this.localFolderService,
                        this.childNodeProviders,
                        this.shouldExpand
                    )
            );
        }
        catch (error) {
            // Handle case where workspaces cannot be loaded
            return [];
        }
    }
}
