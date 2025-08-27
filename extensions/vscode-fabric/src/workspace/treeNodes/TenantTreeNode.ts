import * as vscode from 'vscode';

import { FabricTreeNode, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { TelemetryService } from '@microsoft/vscode-fabric-util';
import { IFabricExtensionManagerInternal } from '../../apis/internal/fabricExtensionInternal';
import { ListViewWorkspaceTreeNode } from './ListViewWorkspaceTreeNode';
import { TreeViewWorkspaceTreeNode } from './TreeViewWorkspaceTreeNode';
import { DisplayStyle } from '../definitions';
import { ITenantSettings } from '../../authentication';

export class TenantTreeNode extends FabricTreeNode {
    constructor(
        context: vscode.ExtensionContext, 
        protected extensionManager: IFabricExtensionManagerInternal, 
        protected telemetryService: TelemetryService | null,
        protected workspaceManager: IWorkspaceManager,
        private tenant: ITenantSettings,
        private displayStyle: DisplayStyle
    ) {
        super(context, tenant.displayName, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'TenantTreeNode';
        this.iconPath = new vscode.ThemeIcon('organization');
    }

    async getChildNodes(): Promise<FabricTreeNode[]> {
        
        try {
            const workspaces = await this.workspaceManager.listWorkspaces();

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