import { IArtifactManager, IFabricApiClient, IFabricExtensionServiceCollection, IWorkspaceManager } from '@fabric/vscode-fabric-api';

export class FabricExtensionServiceCollection implements IFabricExtensionServiceCollection {
    public constructor(
        public readonly artifactManager: IArtifactManager,
        public readonly workspaceManager: IWorkspaceManager,
        public readonly apiClient: IFabricApiClient,
    ) {
    }
}