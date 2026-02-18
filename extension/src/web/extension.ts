// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// External packages
import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';
import { DIContainer } from '@wessberg/di';
import TelemetryReporter from '@vscode/extension-telemetry';

// Workspace packages
import {
    FabricTreeNode,
    IArtifactManager,
    IFabricApiClient,
    IFabricExtensionManager,
    IFabricExtensionServiceCollection,
    IWorkspaceManager,
} from '@microsoft/vscode-fabric-api';
import {
    ConfigurationProvider,
    DisposableCollection,
    FabricEnvironmentProvider,
    IConfigurationProvider,
    IDisposableCollection,
    IFabricEnvironmentProvider,
    ILogger,
    Logger,
    TelemetryActivity,
    TelemetryService,
} from '@microsoft/vscode-fabric-util';

// Shared utilities
import { createExpansionStateHandler, createTenantChangeHandler, initFabricVirtualDocProvider } from '../shared';

// APIs/Interfaces
import { IArtifactManagerInternal, IFabricExtensionManagerInternal, IGitOperator } from '../apis/internal/fabricExtensionInternal';

// Authentication
import { AccountProvider } from '../authentication/AccountProvider';
import { IAccountProvider, ITokenAcquisitionService } from '../authentication/interfaces';
import { DefaultVsCodeAuthentication, TokenAcquisitionService, VsCodeAuthentication } from '../authentication/TokenAcquisitionService';

// Settings
import { IFabricExtensionsSettingStorage } from '../settings/definitions';
import { FabricExtensionsSettingStorage } from '../settings/FabricExtensionsSettingStorage';
import { FabricFeatureConfiguration, IFabricFeatureConfiguration } from '../settings/FabricFeatureConfiguration';

// Fabric API client
import { FabricApiClient } from '../fabric/FabricApiClient';

// Workspace/Tree views
import { IRootTreeNodeProvider } from '../workspace/definitions';
import { DefinitionFileEditorDecorator } from '../workspace/DefinitionFileEditorDecorator';
import { DefinitionFileSystemProvider } from '../workspace/DefinitionFileSystemProvider';
import { DefinitionVirtualDocumentContentProvider } from '../workspace/DefinitionVirtualDocumentContentProvider';
import { FabricWorkspaceDataProvider, RootTreeNodeProvider } from '../workspace/treeView';
import { ArtifactChildNodeProviderCollection, IArtifactChildNodeProviderCollection } from '../workspace/treeNodes/childNodeProviders/ArtifactChildNodeProviderCollection';
import { IWorkspaceFilterManager, WorkspaceFilterManager } from '../workspace/WorkspaceFilterManager';
import { WorkspaceManager, WorkspaceManagerBase } from '../workspace/WorkspaceManager';

// Artifact manager
import { ArtifactManager } from '../artifactManager/ArtifactManager';
import { registerArtifactCommands } from '../artifactManager/commands';

// Commands
import { FabricCommandManager } from '../commands/FabricCommandManager';
import { IFabricCommandManager } from '../commands/IFabricCommandManager';
import { registerTenantCommands } from '../tenant/commands';
import { registerWorkspaceCommands } from '../workspace/commands';

// Other services
import { CapacityManager, ICapacityManager } from '../CapacityManager';
import { FabricExtensionManager } from '../extensionManager/FabricExtensionManager';
import { FeedbackTreeDataProvider } from '../feedback/FeedbackTreeDataProvider';
import { ILocalFolderManager } from '../ILocalFolderManager';
import { InternalSatelliteManager } from '../internalSatellites/InternalSatelliteManager';
import { Base64Encoder, IBase64Encoder } from '../itemDefinition/ItemDefinitionReader';
import { ILocalFolderService, LocalFolderService } from '../LocalFolderService';
import { FabricExtensionServiceCollection } from '../FabricExtensionServiceCollection';

// Web-specific implementations
import { WebGitOperator } from './WebGitOperator';
import { WebLocalFolderManager } from './WebLocalFolderManager';

let app: FabricVsCodeWebExtension;

/**
 * Activates the web version of the Fabric extension.
 * This is a simplified entry point for browser-based VS Code environments.
 */
export async function activate(context: vscode.ExtensionContext): Promise<IFabricExtensionManager> {
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

    async activate(): Promise<IFabricExtensionManager> {
        const logger = this.container.get<ILogger>();
        const telemetryService = this.container.get<TelemetryService>();
        const eventName: string = 'extension/start';
        try {
            const activateActivity = new TelemetryActivity('activation', telemetryService);

            const storage = this.container.get<IFabricExtensionsSettingStorage>();
            await storage.load();

            const treeView = this.registerViews();
            this.registerProviders();
            await this.registerCommands();
            this.setupEventHandlers(treeView);
            this.setupTelemetry();

            activateActivity.end();
            activateActivity.sendTelemetry();
            telemetryService?.sendTelemetryEvent(eventName);

            // Start async refresh (non-blocking)
            const workspaceManager = this.container.get<IWorkspaceManager>() as WorkspaceManagerBase;
            void workspaceManager.refreshConnectionToFabric();

            // Initialize extension manager for public API and satellites
            const extensionManager = this.initializeExtensionManager();

            return extensionManager;
        }
        catch (ex) {
            logger.reportExceptionTelemetryAndLog('activate', eventName, ex, telemetryService);
            throw ex;
        }
    }

    /**
     * Registers all tree views: feedback and workspace.
     * Returns the workspace tree view for use in event handlers.
     */
    private registerViews(): vscode.TreeView<FabricTreeNode> {
        const context = this.container.get<ExtensionContext>();
        const dataProvider = this.container.get<FabricWorkspaceDataProvider>();
        const workspaceManager = this.container.get<IWorkspaceManager>() as WorkspaceManagerBase;

        // Feedback view
        context.subscriptions.push(vscode.window.createTreeView('vscode-fabric.view.feedback', {
            treeDataProvider: new FeedbackTreeDataProvider(context),
        }));

        // Workspace view
        const treeView: vscode.TreeView<FabricTreeNode> = vscode.window.createTreeView('vscode-fabric.view.workspace',
            { treeDataProvider: dataProvider, showCollapseAll: true });

        // TODO this is strange. The dependencies should be injected...
        // And it seems cyclical. The dataProvider is created with the workspaceManager, but the workspaceManager depends dataProvider ??
        workspaceManager.tvProvider = dataProvider;
        workspaceManager.treeView = treeView;

        return treeView;
    }

    /**
     * Registers file system and document content providers.
     */
    private registerProviders(): void {
        const context = this.container.get<ExtensionContext>();
        const definitionFileSystemProvider = this.container.get<DefinitionFileSystemProvider>();

        // Virtual document provider
        initFabricVirtualDocProvider(context);

        // Definition file system provider
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider(DefinitionFileSystemProvider.scheme, definitionFileSystemProvider, {
                isCaseSensitive: true,
                isReadonly: false,
            })
        );

        // Read-only definition document provider
        const readOnlyProvider = new DefinitionVirtualDocumentContentProvider(definitionFileSystemProvider);
        context.subscriptions.push(
            vscode.workspace.registerTextDocumentContentProvider(DefinitionVirtualDocumentContentProvider.scheme, readOnlyProvider)
        );

        // Definition file editor decorator
        const editorDecorator = new DefinitionFileEditorDecorator();
        context.subscriptions.push(editorDecorator);
    }

    /**
     * Registers all commands: workspace, artifact, and tenant.
     */
    private async registerCommands(): Promise<void> {
        const context = this.container.get<ExtensionContext>();
        const logger = this.container.get<ILogger>();
        const telemetryService = this.container.get<TelemetryService>();
        const accountProvider = this.container.get<IAccountProvider>();
        const workspaceManager = this.container.get<IWorkspaceManager>() as WorkspaceManagerBase;
        const workspaceFilterManager = this.container.get<IWorkspaceFilterManager>();
        const dataProvider = this.container.get<FabricWorkspaceDataProvider>();
        const artifactManager = this.container.get<IArtifactManagerInternal>();
        const extensionManager = this.container.get<IFabricExtensionManagerInternal>();
        const fabricEnvironmentProvider = this.container.get<IFabricEnvironmentProvider>();
        const capacityManager = this.container.get<ICapacityManager>();

        const commandManager = this.container.get<IFabricCommandManager>();
        await commandManager.initialize();

        const rootTreeNodeProvider = this.container.get<IRootTreeNodeProvider>() as RootTreeNodeProvider;
        await rootTreeNodeProvider.enableCommands();

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

        registerTenantCommands(
            context,
            accountProvider,
            telemetryService,
            logger
        );

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
    }

    /**
     * Sets up event handlers for expansion state and tenant changes.
     */
    private setupEventHandlers(treeView: vscode.TreeView<FabricTreeNode>): void {
        const storage = this.container.get<IFabricExtensionsSettingStorage>();
        const accountProvider = this.container.get<IAccountProvider>();
        const fabricEnvironmentProvider = this.container.get<IFabricEnvironmentProvider>();

        // Expansion state persistence
        const updateExpansionState = createExpansionStateHandler(storage, fabricEnvironmentProvider, accountProvider);
        treeView.onDidExpandElement(async (e) => updateExpansionState(e.element, true));
        treeView.onDidCollapseElement(async (e) => updateExpansionState(e.element, false));

        // Tenant change persistence
        const tenantChanged = createTenantChangeHandler(storage, accountProvider);
        accountProvider.onTenantChanged(tenantChanged);
    }

    /**
     * Initializes the extension manager with service collection and activates internal satellites.
     */
    private initializeExtensionManager(): IFabricExtensionManagerInternal {
        const context = this.container.get<ExtensionContext>();
        const extensionManager = this.container.get<IFabricExtensionManagerInternal>();
        const coreServiceCollection = this.container.get<IFabricExtensionServiceCollection>();

        // Set up service collection for public API
        extensionManager.serviceCollection = coreServiceCollection;

        // Activate internal satellites
        const internalSatelliteManager = this.container.get<InternalSatelliteManager>();
        internalSatelliteManager.activateAll();
        context.subscriptions.push(internalSatelliteManager);

        return extensionManager;
    }

    /**
     * Sets up telemetry default properties for environment and account.
     */
    private setupTelemetry(): void {
        const telemetryService = this.container.get<TelemetryService>();
        const account = this.container.get<IAccountProvider>();
        const fabricEnvironmentProvider = this.container.get<IFabricEnvironmentProvider>();

        // Environment property
        async function onEnvironmentChanged() {
            const environment = fabricEnvironmentProvider.getCurrent();
            if (environment) {
                telemetryService?.addOrUpdateDefaultProperty('fabricEnvironment', environment.env);
            }
        }
        fabricEnvironmentProvider.onDidEnvironmentChange(async () => await onEnvironmentChanged());
        void onEnvironmentChanged();

        // Account properties
        async function updateDefaultAccountProperties() {
            const sessionPropertiesForTelemetry = await account.getDefaultTelemetryProperties();
            telemetryService?.addOrUpdateDefaultProperty('tenantid', sessionPropertiesForTelemetry.tenantid);
            telemetryService?.addOrUpdateDefaultProperty('useralias', sessionPropertiesForTelemetry.useralias);
            telemetryService?.addOrUpdateDefaultProperty('ismicrosoftinternal', sessionPropertiesForTelemetry.isMicrosoftInternal);
        }
        account.onSignInChanged(async () => await updateDefaultAccountProperties());
        account.onTenantChanged(async () => await updateDefaultAccountProperties());
        void updateDefaultAccountProperties();
    }

    async deactivate(): Promise<void> {
        const logger = this.container.get<ILogger>();
        const telemetryService = this.container.get<TelemetryService>();
        const context = this.container.get<ExtensionContext>();
        const eventName = 'extension/exit';

        try {
            // Report successful deactivation
            telemetryService?.sendTelemetryEvent(eventName, { shutdownReason: 'Normal' });

            // Manually dispose and clear subscriptions
            // This is redundant because VS Code will do it automatically
            // but allows for manual programmatic cleanup (i.e., for testing)
            if (context?.subscriptions) {
                // Copy array first to avoid issues with disposal potentially modifying the array
                [...context.subscriptions].forEach(sub => sub.dispose());

                // Clear the array to prevent double disposal by VS Code.
                // Not entirely necessary, but good insurance against improperly
                // implemented disposables that are potentially not idempotent.
                context.subscriptions.length = 0;
            }
        }
        catch (ex) {
            logger.reportExceptionTelemetryAndLog('deactivate', eventName, ex, telemetryService, { shutdownReason: 'Abnormal' });
            throw ex;
        }
        finally {
            void telemetryService?.dispose();
        }
    }
}

async function composeContainer(context: vscode.ExtensionContext): Promise<DIContainer> {
    const container = new DIContainer();

    // Need to register as both ExtensionContext and vscode.ExtensionContext, bug in DIContainer?
    container.registerSingleton<ExtensionContext>(() => context);
    container.registerSingleton<vscode.ExtensionContext>(() => context);

    // Logging and telemetry (initialized early to catch all errors)
    container.registerSingleton<ILogger>(() => new Logger('Fabric'));
    container.registerSingleton<TelemetryReporter>(() => new TelemetryReporter(context.extension.packageJSON.aiKey));

    // Need to register the telemetry service as a singleton and as a singleton of type TelemetryService | null
    const telemetryService = new TelemetryService(container.get<TelemetryReporter>(), { extensionMode: context.extensionMode });
    container.registerSingleton<TelemetryService>(() => telemetryService);
    container.registerSingleton<TelemetryService | null>(() => telemetryService);

    // Configuration and settings
    container.registerSingleton<IConfigurationProvider, ConfigurationProvider>();
    container.registerSingleton<IFabricFeatureConfiguration, FabricFeatureConfiguration>();
    container.registerSingleton<IFabricExtensionsSettingStorage, FabricExtensionsSettingStorage>();
    container.registerSingleton<vscode.Memento>(() => container.get<ExtensionContext>().globalState);

    // Authentication
    container.registerSingleton<VsCodeAuthentication, DefaultVsCodeAuthentication>();
    container.registerSingleton<ITokenAcquisitionService, TokenAcquisitionService>();
    container.registerSingleton<IAccountProvider, AccountProvider>();
    container.registerSingleton<IFabricEnvironmentProvider, FabricEnvironmentProvider>();

    // Fabric API client
    container.registerSingleton<IFabricApiClient>(() => new FabricApiClient(
        container.get<IAccountProvider>(),
        container.get<IConfigurationProvider>(),
        container.get<IFabricEnvironmentProvider>(),
        container.get<TelemetryService>(),
        container.get<ILogger>()
    ));

    // Workspace and tree views
    container.registerSingleton<IWorkspaceManager, WorkspaceManager>();
    container.registerSingleton<FabricWorkspaceDataProvider>();
    container.registerSingleton<IRootTreeNodeProvider, RootTreeNodeProvider>();
    container.registerSingleton<IWorkspaceFilterManager, WorkspaceFilterManager>();
    container.registerSingleton<IArtifactChildNodeProviderCollection, ArtifactChildNodeProviderCollection>();

    // Artifact manager
    container.registerSingleton<IArtifactManager, ArtifactManager>();
    container.registerSingleton<IArtifactManagerInternal>(() => container.get<IArtifactManager>() as IArtifactManagerInternal);

    // Definition file system
    container.registerSingleton<DefinitionFileSystemProvider>();
    container.registerSingleton<IBase64Encoder, Base64Encoder>();
    container.registerSingleton<vscode.FileSystem>(() => vscode.workspace.fs);

    // Local folder and git operations (web-specific implementations)
    container.registerSingleton<ILocalFolderManager, WebLocalFolderManager>();
    container.registerSingleton<ILocalFolderService, LocalFolderService>();
    container.registerSingleton<IGitOperator, WebGitOperator>();

    // Commands
    container.registerSingleton<IFabricCommandManager, FabricCommandManager>();

    // Other services
    container.registerSingleton<ICapacityManager, CapacityManager>();
    container.registerSingleton<IFabricExtensionManagerInternal, FabricExtensionManager>();
    container.registerTransient<IDisposableCollection, DisposableCollection>();
    container.registerSingleton<IFabricExtensionServiceCollection, FabricExtensionServiceCollection>();
    container.registerSingleton<InternalSatelliteManager>();

    return container;
}
