import * as vscode from 'vscode';
import { IArtifactManager, IFabricExtension, IFabricExtensionManager, IFabricTreeNodeProvider, ILocalProjectTreeNodeProvider, IWorkspaceManager, IFabricApiClient } from '@fabric/vscode-fabric-api';
import { ILogger, TelemetryService } from '@fabric/vscode-fabric-util';
import { SqlDatabaseTreeNodeProvider } from './SqlDatabaseTreeNodeProvider';
import { SqlEndpointTreeNodeProvider } from './SqlEndpointTreeNodeProvider';
import { registerDatabaseCommands, disposeCommands } from './commands';

export class SqlExtension implements IFabricExtension, vscode.Disposable {
    private workspaceManager: IWorkspaceManager;
    private artifactManager: IArtifactManager;
    private apiClient: IFabricApiClient;

    public identity: string = 'fabric.internal-satellite-sql';
    public apiVersion: string = '0.6';
    public artifactTypes: string[] = ['SQLDatabase, SQLEndpoint'];
    public treeNodeProviders: IFabricTreeNodeProvider[] = [
        new SqlDatabaseTreeNodeProvider(this.context),
        new SqlEndpointTreeNodeProvider(this.context)
    ];
    public localProjectTreeNodeProviders: ILocalProjectTreeNodeProvider[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private telemetryService: TelemetryService,
        private logger: ILogger,
        private extensionManager: IFabricExtensionManager,
    ) {
        const serviceCollection = extensionManager.addExtension(this);

        this.workspaceManager = serviceCollection.workspaceManager;
        this.artifactManager = serviceCollection.artifactManager;
        this.apiClient = serviceCollection.apiClient;

        registerDatabaseCommands(
            this.context,
            this.workspaceManager,
            this.artifactManager,
            this.apiClient,
            this.telemetryService,
        );
    }

    dispose() {
        disposeCommands();
    }
}