import * as vscode from 'vscode';
import { FabricTreeNode, ILocalProjectTreeNodeProvider, LocalProjectTreeNode, LocalProjectTreeNodeProvider } from '@fabric/vscode-fabric-api';
import { ILogger, TelemetryService, withErrorHandling } from '@fabric/vscode-fabric-util';
import { ILocalProjectDiscovery, ILocalProjectInformation } from './definitions';
import { IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { getDisplayNamePlural, getArtifactIconPath, getArtifactDefaultIconPath, getSupportsArtifactWithDefinition } from '../metadata/fabricItemUtilities';
import { commandNames } from '../constants';

export class LocalProjectTreeDataProvider implements vscode.TreeDataProvider<FabricTreeNode> {
    private localProjects: LocalProjectTreeNodeCollection;
    private static refreshCommandDisposable: vscode.Disposable | null;
    
    public constructor(private context: vscode.ExtensionContext, private readonly discovery: ILocalProjectDiscovery, private readonly extensionManager: IFabricExtensionManagerInternal, private readonly logger: ILogger, private readonly telemetryService: TelemetryService | null) {
        this.localProjects = new LocalProjectTreeNodeCollection(context, this.extensionManager);
        this.extensionManager.onExtensionsUpdated(() => this.refresh());
        this.discovery.projects.onItemAdded(() => this.refresh());
        this.discovery.projects.onItemRemoved(() => this.refresh());
        this.discovery.projects.onReset(() => this.refresh());

        LocalProjectTreeDataProvider.refreshCommandDisposable?.dispose();
        LocalProjectTreeDataProvider.refreshCommandDisposable = 
            vscode.commands.registerCommand(commandNames.refreshLocalProjectView, async (...cmdArgs) => {
                await (withErrorHandling('refreshLocalProjectView', this.logger, this.telemetryService, async () => {
                    this.refresh();
                }))();
            });
        context.subscriptions.push(LocalProjectTreeDataProvider.refreshCommandDisposable);
    }

    private _onDidChangeTreeData: vscode.EventEmitter<FabricTreeNode | FabricTreeNode[] | undefined | null | void> = new vscode.EventEmitter<FabricTreeNode | FabricTreeNode[] | undefined | null | void>();
    /**
     * An optional event to signal that an element or root has changed.
     * This will trigger the view to update the changed element/root and its children recursively (if shown).
     * To signal that root has changed, do not pass any argument or pass `undefined` or `null`.
     */
    onDidChangeTreeData: vscode.Event<void | FabricTreeNode | FabricTreeNode[] | null | undefined> = this._onDidChangeTreeData.event;

    private refresh() {
        this.localProjects = new LocalProjectTreeNodeCollection(this.context, this.extensionManager);
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
        await (withErrorHandling('LocalProjectTreeDataProvider', this.logger, this.telemetryService, async () => {
            // Asking for the root node
            if (!element) {
                for (const project of this.discovery.projects.items) {
                    await this.localProjects.addProject(project);
                }
                this.localProjects.getTreeNodes().forEach((node) => nodes.push(node));
            }
            else {
                nodes = await element.getChildNodes();
            }
        }))();
        return nodes;
    }
}

class LocalProjectTreeNodeCollection {
    private localProjectProviders: Map<string, ArtifactTypeTreeNode>;

    constructor(private context: vscode.ExtensionContext, private extensionManager: IFabricExtensionManagerInternal) {
        this.localProjectProviders = new Map<string, ArtifactTypeTreeNode>();
    }

    public async addProject(project: ILocalProjectInformation) {
        if (!this.localProjectProviders.has(project.artifactType)) {
            const localProjectProvider = this.extensionManager.localProjectTreeNodeProviders.get(project.artifactType);

            // TODO: Show a missing extension node if the extension is not installed

            if (localProjectProvider) {
                this.localProjectProviders.set(project.artifactType, new ArtifactTypeTreeNode(this.context, localProjectProvider));
            }
            else if (getSupportsArtifactWithDefinition(project.artifactType)) {
                const defaultProvider = new DefinitionLocalProjectTreeNodeProvider(this.context, project.artifactType);
                this.localProjectProviders.set(project.artifactType, new ArtifactTypeTreeNode(this.context, defaultProvider));
            }
        }
        await this.localProjectProviders.get(project.artifactType)?.addProject(project);
    }

    public getTreeNodes(): FabricTreeNode[] {
        if (this.localProjectProviders.size > 0) {
            return [...this.localProjectProviders.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
        }

        return [];
    }
}

class ArtifactTypeTreeNode extends FabricTreeNode {
    private _children = new Map<string, LocalProjectTreeNode>();

    public get displayName() {
        return getDisplayNamePlural(this.treeNodeProvider.artifactType) ?? this.treeNodeProvider.artifactType;
    };

    constructor(context: vscode.ExtensionContext, private treeNodeProvider: ILocalProjectTreeNodeProvider) {
        super(context, getDisplayNamePlural(treeNodeProvider.artifactType) ?? treeNodeProvider.artifactType, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = getArtifactIconPath(context.extensionUri, treeNodeProvider.artifactType) ?? getArtifactDefaultIconPath(context.extensionUri);
    }

    public async addProject(project: ILocalProjectInformation) {
        if (!this._children.has(project.path.path.toLowerCase())) {
            const node = await this.treeNodeProvider.createLocalProjectTreeNode(project.path);
            if (node) {
                if (!node.iconPath) {
                    node.iconPath = getArtifactIconPath(this.context.extensionUri, this.treeNodeProvider.artifactType) ?? getArtifactDefaultIconPath(this.context.extensionUri);
                }
                if (!node.tooltip) {
                    node.tooltip = project.path.fsPath;
                }

                this._children.set(project.path.path.toLowerCase(), node);
            }
        }
    }

    public async getChildNodes(): Promise<FabricTreeNode[]> {
        const sortedArtifacts = [...this._children.values()].sort((a, b) => a.displayName.toLocaleLowerCase().localeCompare(b.displayName.toLocaleLowerCase()));
        return sortedArtifacts;
    }
}

class DefinitionLocalProjectTreeNodeProvider extends LocalProjectTreeNodeProvider {
    constructor(context: vscode.ExtensionContext, artifactType: string) {
        super(context, artifactType);
    }

    public async createLocalProjectTreeNode(projectPath: vscode.Uri): Promise<LocalProjectTreeNode | undefined> {
        const node = await super.createLocalProjectTreeNode(projectPath);
        if (node) {
            if (!node.contextValue) {
                node.contextValue = 'item-import';
            }
            else if (!node.contextValue.split('|').includes('item-import')) {
                node.contextValue += '|item-import';
            }
        }
        return node;
    }
}