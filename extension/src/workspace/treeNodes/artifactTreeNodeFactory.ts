// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { getArtifactIconPath, getArtifactDefaultIconPath, getSupportsArtifactWithDefinition } from '../../metadata/fabricItemUtilities';
import { IArtifact, ArtifactDesignerActions, ArtifactTreeNode, IFabricTreeNodeProvider, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { ILocalFolderService } from '../../LocalFolderService';
import { IArtifactChildNodeProviderCollection } from './childNodeProviders/ArtifactChildNodeProviderCollection';

/**
 * Creates an artifact tree node with proper icon and context
 */
export async function createArtifactTreeNode(
    context: vscode.ExtensionContext,
    artifact: IArtifact,
    treeNodeProvider?: IFabricTreeNodeProvider,
    localFolderService?: ILocalFolderService,
    childNodeProviders?: IArtifactChildNodeProviderCollection
): Promise<ArtifactTreeNode> {
    let artifactNode: ArtifactTreeNode;

    // If a satellite has a tree node provider, use it directly
    if (treeNodeProvider) {
        artifactNode = await treeNodeProvider.createArtifactTreeNode(artifact);
    }
    else {
        // No satellite provider, create a default ArtifactTreeNode
        artifactNode = new ArtifactTreeNode(context, artifact);
    }

    if (!artifactNode.iconPath) {
        artifactNode.iconPath = getArtifactIconPath(context.extensionUri, artifact) ?? getArtifactDefaultIconPath(context.extensionUri);
    }
    setContextValue(artifactNode, artifactNode.allowedDesignActions);

    // Check if child node providers will add children, and update collapsible state if needed
    if (childNodeProviders?.canProvideChildren(artifact)) {
        // If we're injecting children, ensure the node is collapsible
        // Override None or undefined, but respect Expanded if satellite set it
        if (artifactNode.collapsibleState !== vscode.TreeItemCollapsibleState.Expanded) {
            artifactNode.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
    }

    // Set tooltip if artifact has a local folder associated with it
    if (localFolderService) {
        try {
            const localFolderResult = await localFolderService.getLocalFolder(artifact, { prompt: 'never' as any });
            if (localFolderResult) {
                artifactNode.tooltip = vscode.l10n.t('Local folder: {0}', localFolderResult.uri.fsPath);
            }
        }
        catch (error) {
            // If there's any error checking for local folder, continue without setting tooltip
        }
    }

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
    if (allowedDesignActions & ArtifactDesignerActions.openLocalFolder || getSupportsArtifactWithDefinition(artifactNode.artifact)) {
        artifactNode.contextValue += '|item-open-local-folder';
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
