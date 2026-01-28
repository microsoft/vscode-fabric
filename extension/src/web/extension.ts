// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';

import { FabricTreeNode, IWorkspaceManager, IFabricApiClient, IArtifactManager } from '@microsoft/vscode-fabric-api';
import {
    TelemetryService,
    ILogger,
    ConfigurationProvider,
    IConfigurationProvider,
    IDisposableCollection,
    DisposableCollection,
} from '@microsoft/vscode-fabric-util';

import { Logger, FabricEnvironmentProvider, IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import TelemetryReporter from '@vscode/extension-telemetry';

import { DIContainer } from '@wessberg/di';
import { ITokenAcquisitionService, IAccountProvider } from '../authentication/interfaces';
import { AccountProvider } from '../authentication/AccountProvider';
import { TokenAcquisitionService, VsCodeAuthentication, DefaultVsCodeAuthentication } from '../authentication/TokenAcquisitionService';
import { FeedbackTreeDataProvider } from '../feedback/FeedbackTreeDataProvider';
import { FabricWorkspaceDataProvider, RootTreeNodeProvider } from '../workspace/treeView';
import { IArtifactManagerInternal, IFabricExtensionManagerInternal } from '../apis/internal/fabricExtensionInternal';
import { FabricExtensionManager } from '../extensionManager/FabricExtensionManager';
import { WorkspaceManager, WorkspaceManagerBase } from '../workspace/WorkspaceManager';
import { IRootTreeNodeProvider } from '../workspace/definitions';
import { WorkspaceFilterManager, IWorkspaceFilterManager } from '../workspace/WorkspaceFilterManager';
import { IFabricExtensionsSettingStorage } from '../settings/definitions';
import { FabricExtensionsSettingStorage } from '../settings/FabricExtensionsSettingStorage';
import { ILocalFolderService, LocalFolderService } from '../LocalFolderService';
import { IFabricFeatureConfiguration, FabricFeatureConfiguration } from '../settings/FabricFeatureConfiguration';
import { IArtifactChildNodeProviderCollection, ArtifactChildNodeProviderCollection } from '../workspace/treeNodes/childNodeProviders/ArtifactChildNodeProviderCollection';
import { ILocalFolderManager } from '../ILocalFolderManager';
import { WebLocalFolderManager } from './WebLocalFolderManager';
import { FabricApiClient } from '../fabric/FabricApiClient';
import { IGitOperator } from '../apis/internal/fabricExtensionInternal';
import { WebGitOperator } from './WebGitOperator';
import { ArtifactManager } from '../artifactManager/ArtifactManager';
import { DefinitionFileSystemProvider } from '../workspace/DefinitionFileSystemProvider';
import { IBase64Encoder, Base64Encoder } from '../itemDefinition/ItemDefinitionReader';
import { DefinitionVirtualDocumentContentProvider } from '../workspace/DefinitionVirtualDocumentContentProvider';
import { registerWorkspaceCommands } from '../workspace/commands';
import { registerArtifactCommands } from '../artifactManager/commands';
import { registerTenantCommands } from '../tenant/commands';
import { ICapacityManager, CapacityManager } from '../CapacityManager';

let app: FabricVsCodeWebExtension;

/**
 * Activates the web version of the Fabric extension.
 * This is a simplified entry point for browser-based VS Code environments.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Register a simple hello world command
    const helloCommand = vscode.commands.registerCommand('vscode-fabric.helloWeb', async () => {
        await vscode.window.showInformationMessage('Hello from Fabric Web Extension! Running in: ' + vscode.env.uiKind);
    });

    context.subscriptions.push(helloCommand);

    const container = await composeContainer(context);
    app = new FabricVsCodeWebExtension(container);
    return await app.activate();
}

export async function deactivate() {
    // Clean shutdown
    if (app) {
        await app.deactivate();
    }
}

export class FabricVsCodeWebExtension {
    constructor(private readonly container: DIContainer) { }

    async activate(): Promise<void> {
        const context = this.container.get<ExtensionContext>();
        const logger = this.container.get<ILogger>();

        // Create feedback view
        context.subscriptions.push(vscode.window.createTreeView('vscode-fabric.view.feedback', {
            treeDataProvider: new FeedbackTreeDataProvider(context),
        }));

        // Create workspaces view
        const dataProvider = this.container.get<FabricWorkspaceDataProvider>();
        const treeView: vscode.TreeView<FabricTreeNode> = vscode.window.createTreeView('vscode-fabric.view.workspace',
            { treeDataProvider: dataProvider, showCollapseAll: true });

        // TODO this is strange. The dependencies should be injected...
        // And it seems cyclical. The dataProvider is created with the workspaceManager, but the workspaceManager depends dataProvider ??
        const workspaceManager = this.container.get<IWorkspaceManager>() as WorkspaceManagerBase;
        workspaceManager.tvProvider = dataProvider;
        workspaceManager.treeView = treeView;

        // Register workspace commands
        const accountProvider = this.container.get<IAccountProvider>();
        const capacityManager = this.container.get<ICapacityManager>();
        const telemetryService = this.container.get<TelemetryService | null>();
        const workspaceFilterManager = this.container.get<IWorkspaceFilterManager>();
        const fabricEnvironmentProvider = this.container.get<IFabricEnvironmentProvider>();
        registerWorkspaceCommands(
            context,
            accountProvider,
            workspaceManager,
            capacityManager,
            telemetryService,
            logger,
            workspaceFilterManager,
            fabricEnvironmentProvider
        );

        // Register artifact commands
        const artifactManager = this.container.get<IArtifactManagerInternal>();
        const extensionManager = this.container.get<IFabricExtensionManagerInternal>();

        await registerArtifactCommands(
            context,
            workspaceManager,
            fabricEnvironmentProvider,
            artifactManager,
            dataProvider,
            extensionManager,
            workspaceFilterManager,
            capacityManager,
            telemetryService,
            logger
        );

        // Register tenant commands
        registerTenantCommands(
            context,
            accountProvider,
            telemetryService,
            logger
        );

        const storage = this.container.get<IFabricExtensionsSettingStorage>();
        await storage.load();

        async function tenantChanged() {
            const tenantInformation = await accountProvider.getCurrentTenant();
            if (!tenantInformation) {
                storage.settings.currentTenant = undefined;
            }
            else {
                // Save the tenant information
                storage.settings.currentTenant = {
                    tenantId: tenantInformation.tenantId,
                    defaultDomain: tenantInformation.defaultDomain,
                    displayName: tenantInformation.displayName,
                };
            }
            await storage.save();
        }
        accountProvider.onTenantChanged(async () => await tenantChanged());


        // Register the read-only definition document provider
        const definitionFileSystemProvider = this.container.get<DefinitionFileSystemProvider>();
        const readOnlyProvider = new DefinitionVirtualDocumentContentProvider(definitionFileSystemProvider);
        context.subscriptions.push(
            vscode.workspace.registerTextDocumentContentProvider(DefinitionVirtualDocumentContentProvider.scheme, readOnlyProvider)
        );
    }

    async deactivate(): Promise<void> {
    }
}

async function composeContainer(context: vscode.ExtensionContext): Promise<DIContainer> {
    const container = new DIContainer();

    // Need to register as both ExtensionContext and vscode.ExtensionContext, bug in DIContainer?
    container.registerSingleton<ExtensionContext>(() => context);
    container.registerSingleton<vscode.ExtensionContext>(() => context);

    // Logger and TelemtryService are initialized at the very beginning to ensure we catch all errors
    container.registerSingleton<ILogger>(() => new Logger('Fabric'));
    container.registerSingleton<TelemetryReporter>(() => new TelemetryReporter(context.extension.packageJSON.aiKey));

    // Need to register the telemetry service as a singleton and as a singleton of type TelemetryService | null
    const telemetryService = new TelemetryService(container.get<TelemetryReporter>(), { extensionMode: context.extensionMode });
    container.registerSingleton<TelemetryService>(() => telemetryService);
    container.registerSingleton<TelemetryService | null>(() => telemetryService);

    // Registration necessary for the Sign In command
    container.registerSingleton<IAccountProvider, AccountProvider>();
    container.registerSingleton<ITokenAcquisitionService, TokenAcquisitionService>();
    container.registerSingleton<IFabricEnvironmentProvider, FabricEnvironmentProvider>();
    container.registerSingleton<VsCodeAuthentication, DefaultVsCodeAuthentication>();

    container.registerSingleton<IConfigurationProvider, ConfigurationProvider>();
    container.registerTransient<IDisposableCollection, DisposableCollection>();

    // Registration for the workspace data provider
    container.registerSingleton<FabricWorkspaceDataProvider>();
    container.registerSingleton<IFabricExtensionManagerInternal, FabricExtensionManager>();
    container.registerSingleton<IWorkspaceManager, WorkspaceManager>();
    container.registerSingleton<IRootTreeNodeProvider, RootTreeNodeProvider>();
    container.registerSingleton<IWorkspaceFilterManager, WorkspaceFilterManager>();
    container.registerSingleton<IFabricExtensionsSettingStorage, FabricExtensionsSettingStorage>();
    container.registerSingleton<ILocalFolderService, LocalFolderService>();
    container.registerSingleton<IFabricFeatureConfiguration, FabricFeatureConfiguration>();
    container.registerSingleton<IArtifactChildNodeProviderCollection, ArtifactChildNodeProviderCollection>();

    // Register child dependencies
    container.registerSingleton<vscode.Memento>(() => container.get<ExtensionContext>().globalState);
    container.registerSingleton<ILocalFolderManager, WebLocalFolderManager>();
    container.registerSingleton<IFabricApiClient>(() => new FabricApiClient(
        container.get<IAccountProvider>(),
        container.get<IConfigurationProvider>(),
        container.get<IFabricEnvironmentProvider>(),
        container.get<TelemetryService>(),
        container.get<ILogger>()
    ));
    container.registerSingleton<IGitOperator, WebGitOperator>();
    container.registerSingleton<vscode.FileSystem>(() => vscode.workspace.fs);
    container.registerSingleton<IArtifactManager, ArtifactManager>();
    container.registerSingleton<DefinitionFileSystemProvider>();
    container.registerSingleton<IBase64Encoder, Base64Encoder>();

    container.registerSingleton<ICapacityManager, CapacityManager>();
    container.registerSingleton<IWorkspaceManager, WorkspaceManager>();

    container.registerSingleton<IArtifactManagerInternal>(() => container.get<IArtifactManager>() as IArtifactManagerInternal);

    return container;
}
