// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

import { IWorkspaceManager, IWorkspace, FabricTreeNode, ArtifactTreeNode, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { ILogger, TelemetryActivity, TelemetryService, withErrorHandling } from '@microsoft/vscode-fabric-util';
import { IFabricExtensionsSettingStorage } from '../settings/definitions';
import { IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { IFabricFeatureConfiguration } from '../settings/FabricFeatureConfiguration';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { ListViewWorkspaceTreeNode } from './treeNodes/ListViewWorkspaceTreeNode';
import { WorkspaceTreeNode } from './treeNodes/WorkspaceTreeNode';
import { ArtifactTypeTreeNode } from './treeNodes/ArtifactTypeTreeNode';
import { TenantTreeNode } from './treeNodes/TenantTreeNode';
import { RootTreeNode } from './treeNodes/RootTreeNode';
import { DisplayStyle, IRootTreeNodeProvider } from './definitions';
import { TreeViewState } from './treeViewState';
import { IWorkspaceFilterManager } from './WorkspaceFilterManager';
import { IAccountProvider, ITenantSettings } from '../authentication';
import { IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { makeShouldExpand } from './viewExpansionState';
import { ILocalFolderService } from '../LocalFolderService';
import { DefinitionFileSystemProvider } from './DefinitionFileSystemProvider';
import { IArtifactChildNodeProviderCollection } from './treeNodes/childNodeProviders/ArtifactChildNodeProviderCollection';
import { DefinitionFileTreeNode } from './treeNodes/DefinitionFileTreeNode';
import { commandNames } from '../constants';

/**
 * Type guard to check if a FabricTreeNode is an ArtifactTreeNode.
 * Uses duck typing to avoid instanceof issues across module boundaries.
 */
function isArtifactTreeNode(element: FabricTreeNode): element is ArtifactTreeNode {
    return 'artifact' in element && typeof (element as any).artifact === 'object';
}

/**
 * Provides tree data for a Fabric workspace
 */
export class FabricWorkspaceDataProvider implements vscode.TreeDataProvider<FabricTreeNode>, vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private rootNode: FabricTreeNode | undefined;

    constructor(private context: vscode.ExtensionContext,
        private readonly extensionManager: IFabricExtensionManagerInternal,
        private readonly workspaceManager: IWorkspaceManager,
        private rootTreeNodeProvider: IRootTreeNodeProvider,
        private readonly logger: ILogger,
        private telemetryService: TelemetryService | null,
        private readonly accountProvider: IAccountProvider,
        private readonly workspaceFilterManager: IWorkspaceFilterManager,
        private readonly storage: IFabricExtensionsSettingStorage,
        private readonly fabricEnvironmentProvider: IFabricEnvironmentProvider,
        private readonly localFolderService: ILocalFolderService,
        private readonly artifactManager: IArtifactManager,
        private readonly fileSystemProvider: DefinitionFileSystemProvider,
        private readonly featureConfiguration: IFabricFeatureConfiguration,
        private readonly childNodeProviders: IArtifactChildNodeProviderCollection) {

        extensionManager.onExtensionsUpdated(() => this.refresh());

        // Refresh tree when feature configurations change
        this.disposables.push(featureConfiguration.onDidFolderGroupingChange(() => {
            this.refresh();
        }));
        this.disposables.push(featureConfiguration.onDidItemDefinitionsChange(() => {
            this.refresh();
        }));

        let disposable = workspaceManager.onDidChangePropertyValue((propertyName: string) => {
            if (propertyName === 'allWorkspaces') {
                TreeViewState.needsUpdate = true;
            }
            this._onDidChangeTreeData.fire();
        });
        this.disposables.push(disposable);
        disposable = this.rootTreeNodeProvider.onDisplayStyleChanged(() => {
            this.refresh();
        });
        this.disposables.push(disposable);
    }

    public dispose() {
        if (this.disposables) {
            this.disposables.forEach(item => item.dispose());
        }
        this.disposables = [];
    }

    private _onDidChangeTreeData: vscode.EventEmitter<FabricTreeNode | FabricTreeNode[] | undefined | null | void> = new vscode.EventEmitter<FabricTreeNode | FabricTreeNode[] | undefined | null | void>();
    /**
     * An optional event to signal that an element or root has changed.
     * This will trigger the view to update the changed element/root and its children recursively (if shown).
     * To signal that root has changed, do not pass any argument or pass `undefined` or `null`.
     */
    onDidChangeTreeData: vscode.Event<void | FabricTreeNode | FabricTreeNode[] | null | undefined> = this._onDidChangeTreeData.event;

    public refresh(): void {
        TreeViewState.needsUpdate = true;
        this._onDidChangeTreeData.fire();
    }

    /**
     * Get a TreeItem representation of the `element`
     *
     * @param element The element for which a TreeItem representation is asked for.
     * @return TreeItem representation of the element.
     */
    getTreeItem(element: FabricTreeNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    /**
     * Get the children of `element` or root if no element is passed.
     *
     * @param element The element from which the provider gets children. Can be `undefined`.
     * @return Children of `element` or root if no element is passed.
     */
    async getChildren(element?: FabricTreeNode): Promise<FabricTreeNode[]> {
        let nodes: FabricTreeNode[] = [];
        await (withErrorHandling('FabricWorkspaceDataProvider', this.logger, this.telemetryService, async () => {
            // Asking for the root node
            if (!element) {
                if (await this.workspaceManager.isConnected()) {
                    // User is signed in - first ensure workspaces are loaded
                    let workspaces: IWorkspace[];
                    try {
                        workspaces = await this.workspaceManager.listWorkspaces();
                    }
                    catch (error) {
                        this.logger.log('Error loading workspaces: ' + error);
                        return;
                    }

                    if (workspaces && workspaces.length > 0) {
                        // Apply workspace filtering
                        const filteredWorkspaces = workspaces.filter(workspace =>
                            this.workspaceFilterManager.isWorkspaceVisible(workspace.objectId));

                        if (TreeViewState.needsUpdate) {
                            this.rootNode = undefined;
                        }

                        // Create the root node which will handle both tenant and no-tenant cases
                        // Always pass the filtered workspaces, even if empty (for proper filtering display)
                        if (this.rootNode === undefined) {
                            const currentDisplayStyle = this.rootTreeNodeProvider.getCurrentDisplayStyle();
                            const shouldExpand = await makeShouldExpand(this.storage, this.fabricEnvironmentProvider, this.accountProvider);
                            this.rootNode = new RootTreeNode(
                                this.context,
                                this.extensionManager,
                                this.telemetryService,
                                this.workspaceManager,
                                this.accountProvider,
                                currentDisplayStyle,
                                this.localFolderService,
                                this.childNodeProviders,
                                shouldExpand,
                                filteredWorkspaces // Pass filtered workspaces to root node
                            );

                            this.updateTreeViewDescription();
                        }

                        if (this.rootNode) {
                            // In this view, there is no top-level workspace node. Return all of the sorted item collection nodes
                            nodes = await this.rootNode.getChildNodes();
                        }
                    }
                }
                else {
                    // User is not signed in. Return an empty set, which will cause the welcome screen to be shown
                }
            }
            else {
                // Get children from the element
                nodes = await element.getChildNodes();

                // If this is an ArtifactTreeNode, inject additional children from providers
                if (isArtifactTreeNode(element)) {
                    const additionalChildren = await this.childNodeProviders.getChildrenForArtifact(element.artifact);
                    nodes = [...additionalChildren, ...nodes];
                }
            }
        }))();
        return nodes;
    }

    /**
     * Optional method to return the parent of `element`.
     * Return `null` or `undefined` if `element` is a child of root.
     *
     * **NOTE:** This method should be implemented in order to access {@link TreeView.reveal reveal} API.
     *
     * @param element The element for which the parent has to be returned.
     * @return Parent of `element`.
     */
    async getParent(element: FabricTreeNode): Promise<FabricTreeNode | undefined> {
        if (element instanceof WorkspaceTreeNode) {
            // Workspace nodes can have either the root node (no tenant case) or a tenant node as parent
            const currentTenant = await this.accountProvider.getCurrentTenant();
            if (currentTenant && this.rootNode) {
                // If we have a tenant, workspace parent is the tenant node (child of root)
                const childNodes = await this.rootNode.getChildNodes();
                return childNodes.find(child => child instanceof TenantTreeNode);
            }
            else {
                // If no tenant, workspace parent is the root node directly
                return this.rootNode;
            }
        }
        else if (element instanceof TenantTreeNode) {
            // Tenant nodes always have the root node as parent
            return this.rootNode;
        }
        else if (element instanceof RootTreeNode) {
            // Root node has no parent
            return undefined;
        }
        else if (element instanceof ListViewWorkspaceTreeNode) {
            return undefined;
        }
        else if (element instanceof ArtifactTypeTreeNode) {
            return this.rootNode!;
        }
        else if (element instanceof ArtifactTreeNode) {
            const childNodes: FabricTreeNode[] | undefined = await this.rootNode?.getChildNodes();
            childNodes?.forEach(n => {
                const artifactTypeTreeNode = n as ArtifactTypeTreeNode;
                if (artifactTypeTreeNode && artifactTypeTreeNode.artifactType === element.artifact.type) {
                    return n;
                }
            });
        }

        // TODO: Allow a IFabricTreeNodeProvider the opportunity to provide a parent node
        return undefined;
    }

    private updateTreeViewDescription(): void {
        if (!this.workspaceManager.treeView) {
            return;
        }

        const hasFilters = this.workspaceFilterManager.hasActiveFilters();
        if (hasFilters) {
            this.workspaceManager.treeView.title = vscode.l10n.t('Fabric Workspaces (remote: filtered)');
        }
        else {
            this.workspaceManager.treeView.title = vscode.l10n.t('Fabric Workspaces (remote)');
        }
    }

    /**
     * Gets the file system provider for registering with VS Code
     */
    public getFileSystemProvider(): DefinitionFileSystemProvider {
        return this.fileSystemProvider;
    }
}

const fabricViewDisplayStyleContext = 'vscode-fabric.workspaceViewDisplayStyle';
export class RootTreeNodeProvider implements vscode.Disposable, IRootTreeNodeProvider {
    private static disposables: vscode.Disposable[] = [];
    private readonly onDisplayStyleChangedEmitter = new vscode.EventEmitter<void>();
    public readonly onDisplayStyleChanged = this.onDisplayStyleChangedEmitter.event;

    constructor(
        private storage: IFabricExtensionsSettingStorage,
        private context: vscode.ExtensionContext,
        private extensionManager: IFabricExtensionManagerInternal,
        private workspaceManager: IWorkspaceManager,
        private telemetryService: TelemetryService | null = null,
        private localFolderService: ILocalFolderService
    ) {
        this.dispose();
        RootTreeNodeProvider.disposables.push(
            vscode.commands.registerCommand('vscode-fabric.workspaceViewToList', async () => {
                await this.changeDisplayStyle(DisplayStyle.list);
            })
        );
        RootTreeNodeProvider.disposables.push(
            vscode.commands.registerCommand('vscode-fabric.workspaceViewToTree', async () => {
                await this.changeDisplayStyle(DisplayStyle.tree);
            })
        );
        RootTreeNodeProvider.disposables.push(
            vscode.commands.registerCommand('vscode-fabric.installExtension', async (...cmdArgs) => {
                // This command opens the extension in the extensions view.
                // It provides telemetry to track the install status of the extension, including if the extension was installed after one minute.
                // It very closely resembles the installExtensions command from Azure Resource Group extension (https://github.com/microsoft/vscode-azureresourcegroups/blob/main/src/commands/installExtension.ts)
                if (cmdArgs[0]) {
                    const extensionId = cmdArgs[0];

                    // Helper function to check if the extension is installed
                    function isInstalled(): boolean {
                        return !!vscode.extensions.getExtension(extensionId);
                    }

                    const alreadyInstalled = isInstalled();

                    const activity = new TelemetryActivity<CoreTelemetryEventNames>('tree/installExtension', telemetryService);
                    return activity.doTelemetryActivity(async () => {
                        activity.addOrUpdateProperties({ 'extensionId': extensionId, 'alreadyInstalled': alreadyInstalled.toString() });
                        await vscode.commands.executeCommand('extension.open', extensionId);

                        if (!alreadyInstalled) {
                            activity.addOrUpdateProperties({ 'installedAfterOneMinute': 'false' });
                            return new Promise<void>((resolve) => {
                                // Listen for extension changes...
                                const disposable = vscode.extensions.onDidChange(() => {
                                    if (isInstalled()) {
                                        // ... the target extension got installed. Let's stop listening
                                        clearTimeout(timeout);
                                        activity.addOrUpdateProperties({ 'installedAfterOneMinute': 'true' });
                                        disposable.dispose();
                                        resolve();
                                    }
                                });

                                // ... but only listen for 1 minute
                                const timeout = setTimeout(() => {
                                    disposable.dispose();
                                    resolve();
                                }, 1 * 60 * 1000); // timeout in milliseconds
                            });
                        }
                    });
                }
            })
        );
        RootTreeNodeProvider.disposables.push(this.onDisplayStyleChangedEmitter);
    }

    public create(tenant: ITenantSettings, childNodeProviders: IArtifactChildNodeProviderCollection): FabricTreeNode {
        const displayStyle = this.storage.settings.displayStyle as DisplayStyle;
        return new TenantTreeNode(
            this.context,
            this.extensionManager,
            this.telemetryService,
            this.workspaceManager,
            tenant,
            displayStyle,
            this.localFolderService,
            childNodeProviders);
    }

    public getCurrentDisplayStyle(): DisplayStyle {
        if (this.storage.settings.displayStyle &&
            Object.values(DisplayStyle).includes(this.storage.settings.displayStyle as DisplayStyle)) {
            return this.storage.settings.displayStyle as DisplayStyle;
        }
        return DisplayStyle.list; // Default fallback
    }

    private async changeDisplayStyle(newDisplayStyle: DisplayStyle): Promise<void> {
        if (this.storage.settings.displayStyle !== newDisplayStyle) {
            this.storage.settings.displayStyle = newDisplayStyle;
            await this.storage.save();
            await this.enableCommands();
            this.onDisplayStyleChangedEmitter.fire();
        }
    }

    public async enableCommands(): Promise<void> {
        let workspaceDisplayStyle: string = DisplayStyle.list;
        if (this.storage.settings.displayStyle &&
            Object.values(DisplayStyle).includes(this.storage.settings.displayStyle as DisplayStyle)) {
            workspaceDisplayStyle = this.storage.settings.displayStyle;
        }

        await vscode.commands.executeCommand('setContext', fabricViewDisplayStyleContext, workspaceDisplayStyle);

        // Register the edit definition file command
        RootTreeNodeProvider.disposables.push(
            vscode.commands.registerCommand(commandNames.editDefinitionFile, async (node: DefinitionFileTreeNode) => {
                await this.editDefinitionFile(node);
            })
        );
    }

    /**
     * Opens a definition file in editable mode using the fabric-definition file system provider.
     * @param node The definition file tree node to edit
     */
    private async editDefinitionFile(node: DefinitionFileTreeNode): Promise<void> {
        // Use the editable URI (fabric-definition://) which uses the file system provider
        const doc = await vscode.workspace.openTextDocument(node.editableUri);
        await vscode.window.showTextDocument(doc, { preview: false });
    }

    dispose() {
        if (RootTreeNodeProvider.disposables) {
            RootTreeNodeProvider.disposables.forEach(item => item.dispose());
        }
        RootTreeNodeProvider.disposables = [];
    }
}
