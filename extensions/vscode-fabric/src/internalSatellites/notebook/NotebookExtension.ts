import * as vscode from 'vscode';
import { IFabricExtension, IFabricExtensionManager, IFabricTreeNodeProvider, ILocalProjectTreeNodeProvider, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { NotebookTreeNodeProvider } from './NotebookTreeNodeProvider';
import { registerNotebookCommands, disposeCommands } from './commands';
import { TelemetryService } from '@microsoft/vscode-fabric-util';

export class NotebookExtension implements IFabricExtension, vscode.Disposable{
    public identity: string = 'fabric.internal-satellite-notebook';
    public apiVersion: string = '0.6';
    public artifactTypes: string[] = ['Notebook'];
    public treeNodeProviders: IFabricTreeNodeProvider[] = [
        new NotebookTreeNodeProvider(this.context)
    ];
    public localProjectTreeNodeProviders: ILocalProjectTreeNodeProvider[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private telemetryService: TelemetryService,
        extensionManager: IFabricExtensionManager
    ) {
        const serviceCollection = extensionManager.addExtension(this);

        const workspaceManager = serviceCollection.workspaceManager;
        const artifactManager = serviceCollection.artifactManager;

        registerNotebookCommands(
            this.context,
            workspaceManager,
            artifactManager,
            this.telemetryService
        );
    }

    dispose() {
        disposeCommands();
    }
}