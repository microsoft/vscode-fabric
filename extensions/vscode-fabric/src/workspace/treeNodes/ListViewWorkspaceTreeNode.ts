import * as vscode from 'vscode';

import { IWorkspace, IWorkspaceManager, ArtifactTreeNode, IArtifact, IFabricTreeNodeProvider, FabricTreeNode } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionManagerInternal } from '../../apis/internal/fabricExtensionInternal';
import { TelemetryService } from '@microsoft/vscode-fabric-util';
import { WorkspaceTreeNode } from './WorkspaceTreeNode';
import { ArtifactTypeTreeNode } from './ArtifactTypeTreeNode';
import { DisplayStyle } from '../definitions';
import { createArtifactTreeNode } from './artifactTreeNodeFactory';
import { getDisplayName } from '../../metadata/fabricItemUtilities';

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