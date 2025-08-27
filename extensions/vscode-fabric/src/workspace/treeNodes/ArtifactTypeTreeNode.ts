import * as vscode from 'vscode';
import { getDisplayNamePlural, getArtifactDefaultIconPath, getArtifactIconPath } from '../../metadata/fabricItemUtilities';
import { IArtifact, FabricTreeNode, IFabricTreeNodeProvider, ArtifactTreeNode,  } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionManagerInternal } from '../../apis/internal/fabricExtensionInternal';
import { createArtifactTreeNode } from './artifactTreeNodeFactory';


export class ArtifactTypeTreeNode extends FabricTreeNode {
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