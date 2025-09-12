import * as vscode from 'vscode';
import { IWorkspace, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionsSettingStorage } from '../settings/definitions';
import { IFabricEnvironmentProvider, TelemetryService, ILogger, IFabricError, doCancelableActionWithErrorHandling, TelemetryActivity, TelemetryEventRecord, FabricError } from '@microsoft/vscode-fabric-util';
import { IAccountProvider } from '../authentication/interfaces';
import { WorkspaceManagerBase } from './WorkspaceManager';

/**
 * Interface for managing workspace filtering preferences
 */
export interface IWorkspaceFilterManager {
    /**
     * Gets the list of workspace IDs that should be visible for the current environment/tenant
     */
    getVisibleWorkspaceIds(): string[];

    /**
     * Sets the list of workspace IDs that should be visible for the current environment/tenant
     */
    setVisibleWorkspaceIds(workspaceIds: string[]): Promise<void>;

    /**
     * Shows the multi-select workspace filter UI
     */
    showWorkspaceFilterDialog(): Promise<void>;

    /**
     * Checks if a workspace should be visible based on current filter settings
     */
    isWorkspaceVisible(workspaceId: string): boolean;

    /**
     * Clears all filters (shows all workspaces)
     */
    clearFilters(): Promise<void>;

    /**
     * Checks if any workspace filters are currently active
     */
    hasActiveFilters(): boolean;

    /**
     * Adds a workspace ID to the current filter list
     */
    addWorkspaceToFilters(workspaceId: string): Promise<void>;
}

/**
 * Quick pick item for workspace selection
 */
interface WorkspacePickItem extends vscode.QuickPickItem {
    workspace: IWorkspace;
}

/**
 * Manages workspace filtering preferences and UI
 */
export class WorkspaceFilterManager implements IWorkspaceFilterManager {
    constructor(
        private settingsStorage: IFabricExtensionsSettingStorage,
        private workspaceManager: IWorkspaceManager,
        private environmentProvider: IFabricEnvironmentProvider,
        private accountProvider: IAccountProvider,
        private telemetryService: TelemetryService | null,
        private logger: ILogger
    ) { }

    /**
     * Refreshes the tree view and updates the title
     */
    private refreshTreeView(): void {
        const wm = this.workspaceManager as WorkspaceManagerBase;
        wm.tvProvider?.refresh();
    }

    /**
     * Refreshes the tree view, updates the title, and shows an information message
     */
    private async refreshTreeViewAndNotify(message: string): Promise<void> {
        this.refreshTreeView();
        await vscode.window.showInformationMessage(message);
    }

    /**
     * Gets the environment + tenant key for current context
     */
    private getCurrentEnvironmentKey(): string {
        const environment = this.environmentProvider.getCurrent().env;
        const tenant = this.settingsStorage.settings.currentTenant;
        return `${environment}:${tenant?.tenantId || 'default'}`;
    }

    /**
     * Gets the list of workspace IDs that should be visible for the current environment/tenant
     */
    public getVisibleWorkspaceIds(): string[] {
        const environmentKey = this.getCurrentEnvironmentKey();
        const filters = this.settingsStorage.settings.workspaceFilters;

        if (!filters || !Object.prototype.hasOwnProperty.call(filters, environmentKey)) {
            return []; // No filter means show all workspaces
        }

        const environmentFilters = filters[environmentKey as keyof typeof filters];

        return environmentFilters || [];
    }

    /**
     * Sets the list of workspace IDs that should be visible for the current environment/tenant
     */
    public async setVisibleWorkspaceIds(workspaceIds: string[]): Promise<void> {
        const environmentKey = this.getCurrentEnvironmentKey();

        if (!this.settingsStorage.settings.workspaceFilters) {
            this.settingsStorage.settings.workspaceFilters = {};
        }

        const filters = this.settingsStorage.settings.workspaceFilters;
        filters[environmentKey as keyof typeof filters] = workspaceIds;
        await this.settingsStorage.save();
        this.refreshTreeView();
    }

    /**
     * Checks if a workspace should be visible based on current filter settings
     */
    public isWorkspaceVisible(workspaceId: string): boolean {
        const visibleIds = this.getVisibleWorkspaceIds();

        // If no filter is set, show all workspaces
        if (visibleIds.length === 0) {
            return true;
        }

        // Check for special "hide all" marker
        if (visibleIds.includes('__HIDE_ALL__')) {
            return false;
        }

        return visibleIds.includes(workspaceId);
    }

    /**
     * Checks if any workspace filters are currently active
     */
    public hasActiveFilters(): boolean {
        const visibleIds = this.getVisibleWorkspaceIds();
        return visibleIds.length > 0;
    }

    /**
     * Clears all filters (shows all workspaces)
     */
    public async clearFilters(): Promise<void> {
        const environmentKey = this.getCurrentEnvironmentKey();

        if (this.settingsStorage.settings.workspaceFilters) {
            const filters = this.settingsStorage.settings.workspaceFilters;
            delete filters[environmentKey as keyof typeof filters];
            await this.settingsStorage.save();
        }
        await this.refreshTreeViewAndNotify(vscode.l10n.t('Workspace filter cleared. All workspaces are now visible.'));
    }

    /**
     * Adds a workspace ID to the current filter list
     */
    public async addWorkspaceToFilters(workspaceId: string): Promise<void> {
        const currentFilters = this.getVisibleWorkspaceIds();

        // If no filters are active, the workspaceId is implicitly already present
        if (currentFilters.length === 0) {
            // Nothing to change in settings, but refresh the view so UI stays in sync
            this.refreshTreeView();
            return;
        }

        // Remove special "hide all" marker if present
        const filteredIds = currentFilters.filter(id => id !== '__HIDE_ALL__');

        // Add the workspace ID if it's not already in the filter
        if (!filteredIds.includes(workspaceId)) {
            filteredIds.push(workspaceId);
        }

        await this.setVisibleWorkspaceIds(filteredIds);
    }

    /**
     * Shows the multi-select workspace filter UI
     */
    public async showWorkspaceFilterDialog(): Promise<void> {
        await doCancelableActionWithErrorHandling(
            'showWorkspaceFilterDialog',
            'workspace/filter',
            this.logger,
            this.telemetryService,
            async (activity: TelemetryActivity<TelemetryEventRecord, string>) => {
                await this.showWorkspaceFilterDialogInternal(activity);
            }
        );
    }

    /**
     * Internal implementation of workspace filter dialog
     */
    private async showWorkspaceFilterDialogInternal(activity: TelemetryActivity<TelemetryEventRecord, string>): Promise<void> {
        if (!(await this.workspaceManager.isConnected())) {
            throw new FabricError(
                vscode.l10n.t('You must be connected to Fabric to filter workspaces.'),
                'not_connected_to_fabric',
                { showInUserNotification: 'Information' }
            );
        }

        // Get all available workspaces
        const allWorkspaces = await this.workspaceManager.listWorkspaces();
        activity.addOrUpdateProperties({ totalWorkspaces: allWorkspaces.length.toString() });

        if (allWorkspaces.length === 0) {
            throw new FabricError(
                vscode.l10n.t('No workspaces found to filter.'),
                'no_workspaces_found',
                { showInUserNotification: 'Information' }
            );
        }

        // Get currently visible workspace IDs
        const currentlyVisible = this.getVisibleWorkspaceIds();
        const showingAll = currentlyVisible.length === 0;

        // Create quick pick items
        const items: WorkspacePickItem[] = allWorkspaces.map((workspace: IWorkspace) => ({
            label: workspace.displayName,
            picked: showingAll || currentlyVisible.includes(workspace.objectId),
            workspace: workspace,
        }));

        // Show multi-select quick pick
        const quickPick = vscode.window.createQuickPick<WorkspacePickItem | vscode.QuickPickItem>();
        quickPick.title = vscode.l10n.t('Filter Workspaces');
        quickPick.placeholder = vscode.l10n.t('Select workspaces to show in the tree view');
        quickPick.canSelectMany = true;
        quickPick.ignoreFocusOut = true;

        // Add special action buttons
        quickPick.buttons = [
            {
                iconPath: new vscode.ThemeIcon('check-all'),
                tooltip: vscode.l10n.t('Select All'),
            },
            {
                iconPath: new vscode.ThemeIcon('close-all'),
                tooltip: vscode.l10n.t('Clear All'),
            },
        ];

        quickPick.items = items;
        quickPick.selectedItems = items.filter(item => item.picked);

        // Handle button clicks
        quickPick.onDidTriggerButton(async (button) => {
            if (button.tooltip === vscode.l10n.t('Select All')) {
                quickPick.selectedItems = items;
            }
            else if (button.tooltip === vscode.l10n.t('Clear All')) {
                quickPick.selectedItems = [];
            }
        });

        // Show the quick pick and wait for selection
        quickPick.show();

        const selectedItems = await new Promise<WorkspacePickItem[] | undefined>((resolve) => {
            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems.filter((item): item is WorkspacePickItem => 'workspace' in item);
                resolve(selected);
                quickPick.dispose();
            });

            quickPick.onDidHide(() => {
                resolve(undefined);
                quickPick.dispose();
            });
        });

        if (selectedItems === undefined) {
            // User cancelled - this is not an error, just return
            activity.addOrUpdateProperties({ filterAction: 'cancelled' });
            return;
        }

        // Process the selection
        const workspaceIdsToShow = selectedItems.map(item => item.workspace.objectId);
        const wm = this.workspaceManager as WorkspaceManagerBase;

        let message: string;
        let action: () => Promise<void>;
        let filterAction: string;

        switch (workspaceIdsToShow.length) {
            case 0:
                // No workspaces selected - hide all
                message = vscode.l10n.t('All workspaces will be hidden.');
                action = () => this.setVisibleWorkspaceIds(['__HIDE_ALL__']);
                filterAction = 'hide_all';
                break;

            case allWorkspaces.length:
                // All workspaces selected - show all
                message = vscode.l10n.t('All workspaces will be shown.');
                action = () => this.clearFilters();
                filterAction = 'show_all';
                break;

            default:
                // Partial selection
                message = vscode.l10n.t('Showing {0} workspace(s).', workspaceIdsToShow.length);
                action = () => this.setVisibleWorkspaceIds(workspaceIdsToShow);
                filterAction = 'partial_filter';
                break;
        }

        activity.addOrUpdateProperties({
            selectedWorkspaces: workspaceIdsToShow.length.toString(),
            filterAction: filterAction,
        });

        await action();
        await this.refreshTreeViewAndNotify(message);
    }
}
