// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { getArtifactIconPath, getArtifactDefaultIconPath, getArtifactExtensionId, getSupportsArtifactWithDefinition } from '../../metadata/fabricItemUtilities';
import { IArtifact, ArtifactDesignerActions, ArtifactTreeNode, IFabricTreeNodeProvider } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionManagerInternal } from '../../apis/internal/fabricExtensionInternal';
import { MissingExtensionArtifactTreeNode } from './MissingExtensionArtifactTreeNode';

/**
 * Creates an artifact tree node with proper icon and context
 */
export async function createArtifactTreeNode(
    context: vscode.ExtensionContext,
    artifact: IArtifact,
    extensionManager: IFabricExtensionManagerInternal,
    treeNodeProvider: IFabricTreeNodeProvider | undefined
): Promise<ArtifactTreeNode> {
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
