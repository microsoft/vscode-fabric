import { IArtifactManager, IFabricApiClient, IFabricExtensionServiceCollection, IWorkspaceManager } from '@microsoft/vscode-fabric-api';

export class FabricExtensionServiceCollection implements IFabricExtensionServiceCollection {
    public constructor(
        public readonly artifactManager: IArtifactManager,
        public readonly workspaceManager: IWorkspaceManager,
        public readonly apiClient: IFabricApiClient
    ) {
    }
}
