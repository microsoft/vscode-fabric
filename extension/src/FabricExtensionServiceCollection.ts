// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { IArtifactManager, IFabricApiClient, IFabricExtensionServiceCollection, IFolderManager, IWorkspaceManager } from '@microsoft/vscode-fabric-api';

export class FabricExtensionServiceCollection implements IFabricExtensionServiceCollection {
    public constructor(
        public readonly artifactManager: IArtifactManager,
        public readonly workspaceManager: IWorkspaceManager,
        public readonly folderManager: IFolderManager,
        public readonly apiClient: IFabricApiClient
    ) {
    }
}
