import * as vscode from 'vscode';

import { FabricTreeNode, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
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
        private displayStyle: DisplayStyle
    ) {
        super(context, 'Microsoft Fabric', vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'RootTreeNode';
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
                this.displayStyle
            )];
        }
        
        // Case 2: When no tenant is selected - show workspaces directly
        try {
            const workspaces = await manager.listWorkspaces();
            
            return workspaces.map(workspace =>
                this.displayStyle === DisplayStyle.list
                    ? new ListViewWorkspaceTreeNode(this.context, this.extensionManager, workspace, this.telemetryService, this.workspaceManager)
                    : new TreeViewWorkspaceTreeNode(this.context, this.extensionManager, workspace, this.telemetryService, this.workspaceManager)
            );
        }
        catch (error) {
            // Handle case where workspaces cannot be loaded
            return [];
        }
    }
}
