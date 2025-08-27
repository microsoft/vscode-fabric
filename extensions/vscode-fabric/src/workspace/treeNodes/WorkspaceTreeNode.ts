import * as vscode from 'vscode';
import { IWorkspace, IArtifact, FabricTreeNode, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { TelemetryService, TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../../TelemetryEventNames';
import { DisplayStyle } from '../definitions';
import { TreeViewState } from '../treeViewState';
import { IFabricExtensionManagerInternal } from '../../apis/internal/fabricExtensionInternal';

export abstract class WorkspaceTreeNode extends FabricTreeNode {
    constructor(context: vscode.ExtensionContext, 
        protected extensionManager: IFabricExtensionManagerInternal, 
        public readonly workspace: IWorkspace, 
        private displayStyle: DisplayStyle,
        protected telemetryService: TelemetryService | null,
        protected workspaceManager: IWorkspaceManager,
    ) {
        super(context, workspace.displayName, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'WorkspaceTreeNode';
        this.iconPath = new vscode.ThemeIcon('folder-library');
    }

    /**
     * Finds and returns all of the top-level items of the Fabric workspace
     * 
     * @returns The top-level items of the Fabric workspace
     */
    public async getChildNodes(): Promise<FabricTreeNode[]> {
        if (TreeViewState.needsUpdate) {
            this.reset();
        }

        if (!this.isReady()) {
            this.ensureReady();
            const activity = new TelemetryActivity<CoreTelemetryEventNames>('workspace/load-items', this.telemetryService);
            await activity.doTelemetryActivity(async () => {
                const workspaceManager:IWorkspaceManager = this.workspaceManager;
                const workspaceId = this.workspace.objectId;
                const artifacts: IArtifact[] = await workspaceManager.getItemsInWorkspace(workspaceId);
                if (artifacts) {
                    activity.addOrUpdateProperties({
                        'itemCount': artifacts.length.toString(),
                        'displayStyle': this.displayStyle,
                    });
                    if (artifacts.length === 0) {
                        // when no items found in workspace, show a button to create a new item
                        await vscode.commands.executeCommand('setContext', workspaceManager.fabricWorkspaceContext, 'emptyWorkspace');
                    }
                    else {
                        for (const artifact of artifacts) {
                            await this.addArtifact(artifact);
                        }
                    }
                }
            });

            TreeViewState.needsUpdate = false;
        }

        return this.sortChildren();
    }

    /**
     * Ask the workspace tree to add the specified artifact to the tree view
     * @param artifact The artifact to add to the tree
     */
    protected abstract addArtifact(artifact: IArtifact): Promise<void>;

    /**
     * Ensures that new artifacts can be added to the tree
     */
    protected abstract ensureReady(): void;

    /**
     * Queries whether or not new artifacts can be added to the tree
     */
    protected abstract isReady(): boolean;

    /**
     * Removes all of the children from the tree
     */
    protected abstract reset(): void;

    /**
     * Sort the nodes after all of the artifacts have been added
     */
    protected abstract sortChildren(): FabricTreeNode[];
}