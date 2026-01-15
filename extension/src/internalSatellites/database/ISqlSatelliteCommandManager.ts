// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { IFabricCommandManagerBase } from '@microsoft/vscode-fabric-util';
import { IWorkspaceManager, IFabricApiClient, IArtifactManager } from '@microsoft/vscode-fabric-api';

/**
 * Interface for SQL satellite command manager that extends the base with satellite-specific dependencies
 */
export interface ISqlSatelliteCommandManager extends IFabricCommandManagerBase {
    // Satellite-specific dependencies available through service collection
    readonly workspaceManager: IWorkspaceManager;
    readonly artifactManager: IArtifactManager;
    readonly apiClient: IFabricApiClient;
}
