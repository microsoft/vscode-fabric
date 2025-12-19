// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { getArtifactIconPath, getArtifactDefaultIconPath, getSupportsArtifactWithDefinition } from '../../metadata/fabricItemUtilities';
import { IArtifact, ArtifactDesignerActions, ArtifactTreeNode, IFabricTreeNodeProvider, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionManagerInternal } from '../../apis/internal/fabricExtensionInternal';
import { ILocalFolderService } from '../../LocalFolderService';
import { DefinitionFileSystemProvider } from '../DefinitionFileSystemProvider';
import { IFabricFeatureConfiguration } from '../../settings/FabricFeatureConfiguration';
import { ComposableArtifactTreeNode } from './ComposableArtifactTreeNode';
import { MissingExtensionChildNodeProvider } from './MissingExtensionChildNodeProvider';
import { DefinitionFilesChildNodeProvider } from './DefinitionFilesChildNodeProvider';
import { TreeNodeProviderChildNodeAdapter } from './TreeNodeProviderChildNodeAdapter';

/**
 * Creates an artifact tree node with proper icon and context
 */
export async function createArtifactTreeNode(
    context: vscode.ExtensionContext,
    artifact: IArtifact,
    extensionManager: IFabricExtensionManagerInternal,
    treeNodeProvider?: IFabricTreeNodeProvider,
    localFolderService?: ILocalFolderService,
    artifactManager?: IArtifactManager,
    fileSystemProvider?: DefinitionFileSystemProvider,
    featureConfiguration?: IFabricFeatureConfiguration
): Promise<ArtifactTreeNode> {
    let artifactNode: ArtifactTreeNode;
    const childNodeProviders = [];

    // Add missing extension provider (shows install prompt if extension not available)
    childNodeProviders.push(new MissingExtensionChildNodeProvider(context, extensionManager));

    // Add definition files provider if services are available
    if (artifactManager && fileSystemProvider && featureConfiguration) {
        childNodeProviders.push(new DefinitionFilesChildNodeProvider(
            context,
            artifactManager,
            fileSystemProvider,
            featureConfiguration
        ));
    }

    let satelliteAdapter: TreeNodeProviderChildNodeAdapter | undefined;
    if (treeNodeProvider) {
        // If a satellite provides a tree node provider, wrap it as a child node provider
        satelliteAdapter = new TreeNodeProviderChildNodeAdapter(treeNodeProvider, artifact);
        childNodeProviders.push(satelliteAdapter);
    }
    // Create the composable artifact tree node
    artifactNode = new ComposableArtifactTreeNode(context, artifact, childNodeProviders);

    // If a satellite provided a tree node, apply its customizations (icon, context values, etc.)
    if (satelliteAdapter) {
        const satelliteNode = await satelliteAdapter.getSatelliteNode();
        // Apply icon from satellite if it provided one
        if (satelliteNode.iconPath) {
            artifactNode.iconPath = satelliteNode.iconPath;
        }
        // Apply context value customizations from satellite
        if (satelliteNode.contextValue && satelliteNode.contextValue !== artifactNode.contextValue) {
            artifactNode.contextValue = satelliteNode.contextValue;
        }
        // Apply allowed design actions from satellite
        if ('allowedDesignActions' in satelliteNode) {
            artifactNode.allowedDesignActions = (satelliteNode as any).allowedDesignActions;
        }
    }

    if (!artifactNode.iconPath) {
        artifactNode.iconPath = getArtifactIconPath(context.extensionUri, artifact) ?? getArtifactDefaultIconPath(context.extensionUri);
    }
    setContextValue(artifactNode, artifactNode.allowedDesignActions);

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
