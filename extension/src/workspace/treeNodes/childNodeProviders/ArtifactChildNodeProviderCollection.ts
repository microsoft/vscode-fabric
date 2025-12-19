// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionManagerInternal } from '../../../apis/internal/fabricExtensionInternal';
import { IFabricFeatureConfiguration } from '../../../settings/FabricFeatureConfiguration';
import { DefinitionFileSystemProvider } from '../../DefinitionFileSystemProvider';
import { IArtifactChildNodeProvider } from './IArtifactChildNodeProvider';
import { MissingExtensionChildNodeProvider } from './MissingExtensionChildNodeProvider';
import { DefinitionFilesChildNodeProvider } from './DefinitionFilesChildNodeProvider';

/**
 * Centralized collection of child node providers for artifact nodes.
 * This collection is used both to determine if nodes should be collapsible
 * and to inject children when nodes are expanded.
 */
export interface IArtifactChildNodeProviderCollection {
    /**
     * Checks if any provider will provide children for the given artifact.
     */
    canProvideChildren(artifact: IArtifact): boolean;

    /**
     * Gets all providers in the collection.
     */
    getProviders(): ReadonlyArray<IArtifactChildNodeProvider>;
}

export class ArtifactChildNodeProviderCollection implements IArtifactChildNodeProviderCollection {
    private providers: IArtifactChildNodeProvider[];

    constructor(
        context: vscode.ExtensionContext,
        extensionManager: IFabricExtensionManagerInternal,
        artifactManager: IArtifactManager,
        fileSystemProvider: DefinitionFileSystemProvider,
        featureConfiguration: IFabricFeatureConfiguration
    ) {
        this.providers = [
            new MissingExtensionChildNodeProvider(context, extensionManager),
            new DefinitionFilesChildNodeProvider(context, artifactManager, fileSystemProvider, featureConfiguration),
        ];
    }

    canProvideChildren(artifact: IArtifact): boolean {
        return this.providers.some(provider => provider.canProvideChildren(artifact));
    }

    getProviders(): ReadonlyArray<IArtifactChildNodeProvider> {
        return this.providers;
    }
}
