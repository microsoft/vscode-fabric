import * as vscode from 'vscode';

import { FabricTreeNode, IWorkspaceManager, IWorkspace } from '@microsoft/vscode-fabric-api';
import { TelemetryService } from '@microsoft/vscode-fabric-util';
import { ITenantSettings, IAccountProvider } from '../../authentication';
import { IFabricExtensionManagerInternal } from '../../apis/internal/fabricExtensionInternal';
import { ListViewWorkspaceTreeNode } from './ListViewWorkspaceTreeNode';
import { TreeViewWorkspaceTreeNode } from './TreeViewWorkspaceTreeNode';
import { TenantTreeNode } from './TenantTreeNode';
import { DisplayStyle } from '../definitions';
import { WorkspaceManager } from '../WorkspaceManager';

export class RootTreeNode extends FabricTreeNode {
    constructor(
        context: vscode.ExtensionContext,
        protected extensionManager: IFabricExtensionManagerInternal,
        protected telemetryService: TelemetryService | null,
        protected workspaceManager: IWorkspaceManager,
        protected accountProvider: IAccountProvider,
        private displayStyle: DisplayStyle,
        private shouldExpand?: (id: string | undefined) => boolean,
        private filteredWorkspaces?: IWorkspace[]
    ) {
        super(context, 'Microsoft Fabric', vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'RootTreeNode';
        // Stable id for VS Code view state restoration
        this.id = 'root';
    }

    async getChildNodes(): Promise<FabricTreeNode[]> {
        const manager = this.workspaceManager as WorkspaceManager;
        const currentTenant = await this.accountProvider.getCurrentTenant();

        // Case 1: When a tenant is selected - show the tenant node which will contain workspaces
        if (currentTenant) {
            return [new TenantTreeNode(
                this.context,
                this.extensionManager,
                this.telemetryService,
                this.workspaceManager,
                currentTenant,
                this.displayStyle,
                this.shouldExpand,
                this.filteredWorkspaces
            )];
        }

        // Case 2: When no tenant is selected - show workspaces directly
        try {
            // Use filtered workspaces if provided, otherwise load all workspaces
            const workspaces = this.filteredWorkspaces || await manager.listWorkspaces();
            
            return workspaces.map(workspace =>
                this.displayStyle === DisplayStyle.list
                    ? new ListViewWorkspaceTreeNode(this.context, this.extensionManager, workspace, this.telemetryService, this.workspaceManager, /*tenantId*/ undefined, this.shouldExpand)
                    : new TreeViewWorkspaceTreeNode(this.context, this.extensionManager, workspace, this.telemetryService, this.workspaceManager, /*tenantId*/ undefined, this.shouldExpand)
            );
        }
        catch (error) {
            // Handle case where workspaces cannot be loaded
            return [];
        }
    }
}
