import * as vscode from 'vscode';
import { getDisplayNamePlural, getDisplayName, getArtifactIconPath, getArtifactDefaultIconPath, getArtifactExtensionId, getSupportsArtifactWithDefinition } from '../metadata/fabricItemUtilities';
import { IWorkspaceManager, IArtifact, IWorkspace, FabricTreeNode, ArtifactDesignerActions, ArtifactTreeNode, IFabricTreeNodeProvider } from '@fabric/vscode-fabric-api';
import { ILogger, TelemetryActivity, TelemetryService, withErrorHandling } from '@fabric/vscode-fabric-util';
import { IFabricExtensionsSettingStorage } from '../settings/definitions';
import { IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';

/**
 * Provides tree data for a Fabric workspace
 */
export class FabricWorkspaceDataProvider implements vscode.TreeDataProvider<FabricTreeNode>, vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private rootNode: FabricTreeNode | undefined;
    public static needsUpdate: Boolean = false;

    constructor(private context: vscode.ExtensionContext, 
        private readonly extensionManager: IFabricExtensionManagerInternal,
        private readonly workspaceManager: IWorkspaceManager,
        private rootTreeNodeProvider: IRootTreeNodeProvider,
        private readonly logger: ILogger,
        private telemetryService: TelemetryService | null ) {
        extensionManager.onExtensionsUpdated(() => this.refresh());

        let disposable = workspaceManager.onDidChangePropertyValue((propertyName: string) => {
            if (propertyName === 'currentWorkspace') {
                FabricWorkspaceDataProvider.needsUpdate = true;
                if (workspaceManager.treeView) {
                    workspaceManager.treeView.description = this.getTreeViewDescription(workspaceManager.currentWorkspace?.displayName);
                }
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
        FabricWorkspaceDataProvider.needsUpdate = true;
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
                //            console.log(`TreeView get root childen`);
                if (await this.workspaceManager.isConnected()) {
                    // User is signed in
                    if (this.workspaceManager.currentWorkspace) {
                        // Workspace is open
                        this.workspaceManager.treeView!.description = this.getTreeViewDescription(this.workspaceManager.currentWorkspace.displayName);

                        if (FabricWorkspaceDataProvider.needsUpdate) {
                            this.rootNode = undefined;
                        }
                        // No workspace open. Urge the user to select a workspace
                        if (this.rootNode === undefined) {
                            const item = this.rootTreeNodeProvider.create(this.workspaceManager.currentWorkspace);
                            this.rootNode = item;
                        }

                        // In this view, there is no top-level workspace node. Return all of the sorted item collection nodes
                        nodes = await this.rootNode.getChildNodes();
                    }
                    else {
                        if (!this.workspaceManager.isProcessingAutoLogin) {
                            await vscode.commands.executeCommand('setContext', this.workspaceManager.fabricWorkspaceContext, 'chooseWorkspace');
                        }
                        else {
                            this.workspaceManager.isProcessingAutoLogin = false; // indicate that we returned 0 children and need a refresh
                        }
                    }
                }
                else {
                    // User is not signed in. Return an empty set, which will cause the welcome screen to be shown
                }
            }
            else {
                nodes = await element.getChildNodes();
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
        if (element instanceof ListViewWorkspaceTreeNode) {
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

    private getTreeViewDescription(displayName: string | undefined): string {
        const remoteSuffix = vscode.l10n.t('(remote)');
        return displayName
            ? `${displayName} ${remoteSuffix}`
            : '';
    }
}

abstract class WorkspaceTreeNode extends FabricTreeNode {
    constructor(context: vscode.ExtensionContext, 
        protected extensionManager: IFabricExtensionManagerInternal, 
        public readonly workspace: IWorkspace, 
        private displayStyle: DisplayStyle,
        protected telemetryService: TelemetryService | null,
        protected workspaceManager: IWorkspaceManager,
    ) {
        super(context, 'Items', vscode.TreeItemCollapsibleState.Expanded);
        this.description = this.workspace.displayName;
        this.contextValue = 'WorkspaceTreeNode';
    }

    /**
     * Finds and returns all of the top-level items of the Fabric workspace
     * 
     * @returns The top-level items of the Fabric workspace
     */
    public async getChildNodes(): Promise<FabricTreeNode[]> {
        if (FabricWorkspaceDataProvider.needsUpdate) {
            this.reset();
        }

        if (!this.isReady()) {
            this.ensureReady();
            var activity = new TelemetryActivity<CoreTelemetryEventNames>('workspace/load-items', this.telemetryService);
            await activity.doTelemetryActivity(async () => {
                const workspaceManager:IWorkspaceManager = this.workspaceManager;
                const artifacts: IArtifact[] = await workspaceManager.getItemsInWorkspace();
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

            FabricWorkspaceDataProvider.needsUpdate = false;
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

export class ListViewWorkspaceTreeNode extends WorkspaceTreeNode {
    private _children: ArtifactTreeNode[] | undefined;

    constructor(context: vscode.ExtensionContext,
        extensionManager: IFabricExtensionManagerInternal,
        workspace: IWorkspace,
        telemetryService: TelemetryService | null,
        workspaceManager: IWorkspaceManager
    ) {
        super(context, extensionManager, workspace, DisplayStyle.list, telemetryService, workspaceManager);
    }

    protected async addArtifact(artifact: IArtifact): Promise<void> {
        const treeNodeProvider: IFabricTreeNodeProvider | undefined = this.extensionManager.treeNodeProviders.get(artifact.type);
        const artifactNode: ArtifactTreeNode = await createArtifactTreeNode(this.context, artifact, this.extensionManager, treeNodeProvider);

        let description = getDisplayName(artifact);
        if (typeof artifactNode.description === 'string' && artifactNode.description.length > 0) {
            description = `${description} ${artifactNode.description}`;
        }
        artifactNode.description = description;

        this._children?.push(artifactNode);
    }

    protected ensureReady(): void {
        if (!this._children) {
            this._children = [];
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
            return [...this._children.values()].sort((a, b) => a.artifact.displayName.localeCompare(b.artifact.displayName));
        }

        return [];
    }
}

/**
 * Root tree item for the workspace
 */
export class TreeViewWorkspaceTreeNode extends WorkspaceTreeNode {
    private _children: Map<string, ArtifactTypeTreeNode> | undefined;

    constructor(context: vscode.ExtensionContext,
        extensionManager: IFabricExtensionManagerInternal,
        workspace: IWorkspace,
        telemetryService: TelemetryService | null,
        workspaceManager: IWorkspaceManager
    ) {
        super(context, extensionManager, workspace, DisplayStyle.tree, telemetryService, workspaceManager);
    }

    protected async addArtifact(artifact: IArtifact) {
        if (!this._children!.has(artifact.type)) {
            this._children!.set(artifact.type, new ArtifactTypeTreeNode(this.context, this.extensionManager, artifact.type));
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

class ArtifactTypeTreeNode extends FabricTreeNode {
    private _children = new Map<string, IArtifact>();
    private treeNodeProvider: IFabricTreeNodeProvider | undefined;

    public get displayName() {
        return getDisplayNamePlural(this.artifactType) ?? this.artifactType;
    };

    constructor(context: vscode.ExtensionContext, protected extensionManager: IFabricExtensionManagerInternal, public artifactType: string) {
        super(context, getDisplayNamePlural(artifactType) ?? artifactType, vscode.TreeItemCollapsibleState.Collapsed);
        this.treeNodeProvider = this.extensionManager.treeNodeProviders.get(artifactType);
        this.contextValue = 'ItemType';
        this.iconPath = getArtifactIconPath(this.context.extensionUri, artifactType) ?? getArtifactDefaultIconPath(this.context.extensionUri);
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
            const artifactNode: ArtifactTreeNode = await createArtifactTreeNode(this.context, artifact, this.extensionManager, this.treeNodeProvider);
            childNodes.push(artifactNode);
        }

        return childNodes;
    }
}

class MissingExtensionArtifactTreeNode extends ArtifactTreeNode {
    constructor(context: vscode.ExtensionContext, artifact: IArtifact, private extensionId: string) {
        super(context, artifact);
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }

    async getChildNodes(): Promise<FabricTreeNode[]> {
        return [ new InstallExtensionTreeNode(this.context, this.extensionId) ];
    }
}

class InstallExtensionTreeNode extends FabricTreeNode {
    constructor(context: vscode.ExtensionContext, public extensionId: string) {
        super(context, vscode.l10n.t('Install extension to enable additional features...'), vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('extensions');
        this.command = {
            command: 'vscode-fabric.installExtension',
            title: '',
            arguments: [extensionId],
        };
    }
}

enum DisplayStyle {
    list = 'ListView',
    tree = 'TreeView',
}

export interface IRootTreeNodeProvider {
    create(workspace: IWorkspace): FabricTreeNode;
    onDisplayStyleChanged: vscode.Event<void>;
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
        private telemetryService: TelemetryService | null = null
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

    public create(workspace: IWorkspace): FabricTreeNode {
        if (this.storage.settings.displayStyle === DisplayStyle.tree) {
            return new TreeViewWorkspaceTreeNode(this.context, this.extensionManager, workspace, this.telemetryService, this.workspaceManager);
        }
        return new ListViewWorkspaceTreeNode(this.context, this.extensionManager, workspace, this.telemetryService, this.workspaceManager);
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
    }

    dispose() {
        if (RootTreeNodeProvider.disposables) {
            RootTreeNodeProvider.disposables.forEach(item => item.dispose());
        }
        RootTreeNodeProvider.disposables = [];
    }
}

async function createArtifactTreeNode(context: vscode.ExtensionContext, artifact: IArtifact, extensionManager: IFabricExtensionManagerInternal, treeNodeProvider: IFabricTreeNodeProvider | undefined): Promise<ArtifactTreeNode> {
    let artifactNode: ArtifactTreeNode;
    if (treeNodeProvider) {
        artifactNode = await treeNodeProvider.createArtifactTreeNode(artifact);
    }
    else {
        const extensionId: string | undefined = getArtifactExtensionId(artifact);
        if (extensionId && !extensionManager.isAvailable(extensionId)) {
            artifactNode = new MissingExtensionArtifactTreeNode(context, artifact, extensionId);
        }
        else {
            artifactNode = new ArtifactTreeNode(context, artifact);
        }
    }

    if (!artifactNode.iconPath) {
        artifactNode.iconPath = getArtifactIconPath(context.extensionUri, artifact) ?? getArtifactDefaultIconPath(context.extensionUri);
    }
    setContextValue(artifactNode, artifactNode.allowedDesignActions);

    return artifactNode;
}

function setContextValue(artifactNode: ArtifactTreeNode, allowedDesignActions: ArtifactDesignerActions | undefined): void {
    if (!allowedDesignActions) {
        allowedDesignActions = ArtifactDesignerActions.default;
    }
    if (!artifactNode.contextValue) {
        artifactNode.contextValue = `Item${artifactNode.artifact.type}`;
    }
    if (allowedDesignActions & ArtifactDesignerActions.delete) {
        artifactNode.contextValue += '|item-delete';
    }
    if (allowedDesignActions & ArtifactDesignerActions.open) {
        artifactNode.contextValue += '|item-open-in-explorer';
    }
    if (allowedDesignActions & ArtifactDesignerActions.definition || getSupportsArtifactWithDefinition(artifactNode.artifact)) {
        artifactNode.contextValue += '|item-export';
    }
    if (allowedDesignActions & ArtifactDesignerActions.publish) {
        artifactNode.contextValue += '|item-publish';
    }
    if (allowedDesignActions & ArtifactDesignerActions.rename) {
        artifactNode.contextValue += '|item-rename';
    }
    if (allowedDesignActions & ArtifactDesignerActions.viewInPortal) {
        artifactNode.contextValue += '|item-view-in-portal';
    }
}
