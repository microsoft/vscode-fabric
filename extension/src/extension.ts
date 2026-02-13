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
    FakeConfigurationProvider,
    IConfigurationProvider,
    IDisposableCollection,
    IFabricEnvironmentProvider,
    ILogger,
    Logger,
    MockConsoleLogger,
    TelemetryActivity,
    TelemetryService,
    VSCodeUIBypass,
} from '@microsoft/vscode-fabric-util';

// Shared utilities
import { createExpansionStateHandler, createTenantChangeHandler, initFabricVirtualDocProvider } from './shared';

// APIs/Interfaces
import { IArtifactManagerInternal, IFabricExtensionManagerInternal, IGitOperator } from './apis/internal/fabricExtensionInternal';

// Authentication
import { FakeTokenAcquisitionService } from './authentication';
import { AccountProvider } from './authentication/AccountProvider';
import { IAccountProvider, ITokenAcquisitionService } from './authentication/interfaces';
import { MockAccountProvider, MockTokenAcquisitionService } from './authentication/mocks';
import { DefaultVsCodeAuthentication, TokenAcquisitionService, VsCodeAuthentication } from './authentication/TokenAcquisitionService';

// Settings
import { IFabricExtensionsSettingStorage } from './settings/definitions';
import { FabricExtensionsSettingStorage } from './settings/FabricExtensionsSettingStorage';
import { FabricFeatureConfiguration, IFabricFeatureConfiguration } from './settings/FabricFeatureConfiguration';

// Fabric API client
import { FabricApiClient, FakeFabricApiClient, MockApiClient } from './fabric';

// Workspace/Tree views
import { IRootTreeNodeProvider } from './workspace/definitions';
import { DefinitionFileEditorDecorator } from './workspace/DefinitionFileEditorDecorator';
import { DefinitionFileSystemProvider } from './workspace/DefinitionFileSystemProvider';
import { ReadonlyDefinitionFileSystemProvider } from './workspace/ReadonlyDefinitionFileSystemProvider';
import { DefinitionFileCodeLensProvider } from './workspace/DefinitionFileCodeLensProvider';
cimport { MockWorkspaceManager } from './workspace/mockWorkspaceManager';
import { FabricWorkspaceDataProvider, RootTreeNodeProvider } from './workspace/treeView';
import { ArtifactChildNodeProviderCollection, IArtifactChildNodeProviderCollection } from './workspace/treeNodes/childNodeProviders/ArtifactChildNodeProviderCollection';
import { IWorkspaceFilterManager, WorkspaceFilterManager } from './workspace/WorkspaceFilterManager';
import { WorkspaceManager, WorkspaceManagerBase } from './workspace/WorkspaceManager';

// Artifact manager
import { ArtifactManager } from './artifactManager/ArtifactManager';
import { registerArtifactCommands } from './artifactManager/commands';
import { registerArtifactExportCommands } from './artifactManager/commands.export';
import { MockArtifactManager } from './artifactManager/MockArtifactManager';

// Local project
import { registerLocalProjectCommands } from './localProject/commands';
import { ExplorerLocalProjectDiscovery } from './localProject/ExplorerLocalProjectDiscovery';
import { LocalProjectTreeDataProvider } from './localProject/LocalProjectTreeDataProvider';
import { WorkspaceFolderProvider } from './localProject/WorkspaceFolderProvider';

// Commands
import { FabricCommandManager } from './commands/FabricCommandManager';
import { IFabricCommandManager } from './commands/IFabricCommandManager';
import { registerTenantCommands } from './tenant/commands';
import { registerWorkspaceCommands } from './workspace/commands';

// Other services
import { CapacityManager, ICapacityManager } from './CapacityManager';
import { FabricExtensionManager } from './extensionManager/FabricExtensionManager';
import { ExtensionUriHandler } from './ExtensionUriHandler';
import { FabricExtensionServiceCollection } from './FabricExtensionServiceCollection';
import { FeedbackTreeDataProvider } from './feedback/FeedbackTreeDataProvider';
import { GitOperator } from './git/GitOperator';
import { ILocalFolderManager } from './ILocalFolderManager';
import { InternalSatelliteManager } from './internalSatellites/InternalSatelliteManager';
import { Base64Encoder, IBase64Encoder } from './itemDefinition/ItemDefinitionReader';
import { LocalFolderManager } from './LocalFolderManager';
import { ILocalFolderService, LocalFolderService } from './LocalFolderService';

let app: FabricVsCodeExtension;

export async function activate(context: vscode.ExtensionContext): Promise<IFabricExtensionManager> {
    const container = await composeContainer(context);
    app = new FabricVsCodeExtension(container);
    return await app.activate();
}

export async function deactivate() {
    // Clean shutdown
    if (app) {
        await app.deactivate();
    }
}

export class FabricVsCodeExtension {
    constructor(private readonly container: DIContainer) { }

    async activate(): Promise<IFabricExtensionManager> {
        const logger = this.container.get<ILogger>();
        const telemetryService = this.container.get<TelemetryService>();
        const eventName: string = 'extension/start';
        try {
            const activateActivity = new TelemetryActivity('activation', telemetryService);

            const storage = this.container.get<IFabricExtensionsSettingStorage>();
            await storage.load();

            // Prompt user to install MCP Server extension (async, non-blocking)
            void this.promptMcpServerInstall();

            const treeView = await this.registerViews();
            this.registerProviders();
            await this.registerCommands();
            this.setupEventHandlers(treeView);
            this.setupTelemetry();
            this.setupTestHooks();

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
     * Registers all tree views: feedback, workspace, and local project.
     * Returns the workspace tree view for use in event handlers.
     */
    private async registerViews(): Promise<vscode.TreeView<FabricTreeNode>> {
        const context = this.container.get<ExtensionContext>();
        const dataProvider = this.container.get<FabricWorkspaceDataProvider>();
        const workspaceManager = this.container.get<IWorkspaceManager>() as WorkspaceManagerBase;
        const logger = this.container.get<ILogger>();
        const telemetryService = this.container.get<TelemetryService>();
        const extensionManager = this.container.get<IFabricExtensionManagerInternal>();

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

        // Local project view
        const workspaceFolderProvider = await WorkspaceFolderProvider.create(vscode.workspace.fs, logger, telemetryService);
        context.subscriptions.push(workspaceFolderProvider);

        const explorerLocalProjectDiscovery = await ExplorerLocalProjectDiscovery.create(workspaceFolderProvider);
        context.subscriptions.push(vscode.window.createTreeView('vscode-fabric.view.local', {
            treeDataProvider: new LocalProjectTreeDataProvider(context, explorerLocalProjectDiscovery, extensionManager, logger, telemetryService),
        }));

        return treeView;
    }

    /**
     * Registers file system and document content providers.
     */
    private registerProviders(): void {
        const context = this.container.get<ExtensionContext>();

        // Definition file system provider (editable)
        const definitionFileSystemProvider = this.container.get<DefinitionFileSystemProvider>();
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider(DefinitionFileSystemProvider.scheme, definitionFileSystemProvider, {
                isCaseSensitive: true,
                isReadonly: false,
            })
        );

        // Definition file system provider (read-only)
        const readonlyFileSystemProvider = this.container.get<ReadonlyDefinitionFileSystemProvider>();
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider(ReadonlyDefinitionFileSystemProvider.scheme, readonlyFileSystemProvider, {
                isCaseSensitive: true,
                isReadonly: true,
            })
        );


        // Register CodeLens provider for readonly definition files
        context.subscriptions.push(
            vscode.languages.registerCodeLensProvider(
                { scheme: ReadonlyDefinitionFileSystemProvider.scheme },
                codeLensProvider
            )
        );
    }

    /**
     * Registers all commands: workspace, tenant, artifact, export, and local project.
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
        const localFolderService = this.container.get<ILocalFolderService>();
        const configurationProvider = this.container.get<IConfigurationProvider>();

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

        registerArtifactExportCommands(
            context,
            workspaceManager,
            fabricEnvironmentProvider,
            artifactManager,
            localFolderService,
            configurationProvider,
            accountProvider,
            telemetryService,
            logger
        );

        registerLocalProjectCommands(
            context,
            workspaceManager,
            fabricEnvironmentProvider,
            artifactManager,
            extensionManager,
            localFolderService,
            workspaceFilterManager,
            capacityManager,
            dataProvider,
            telemetryService,
            logger);
    }

    /**
     * Sets up event handlers for expansion state, tenant changes, and URI handling.
     */
    private setupEventHandlers(treeView: vscode.TreeView<FabricTreeNode>): void {
        const context = this.container.get<ExtensionContext>();
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

        // URI handler
        context.subscriptions.push(
            vscode.window.registerUriHandler(this.container.get<ExtensionUriHandler>())
        );
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

    /**
     * Sets up test hooks for integration testing (non-production only).
     */
    private setupTestHooks(): void {
        const context = this.container.get<ExtensionContext>();
        const extensionManager = this.container.get<IFabricExtensionManagerInternal>();

        if (process.env.VSCODE_FABRIC_ENABLE_TEST_HOOKS !== 'true' || context.extensionMode === vscode.ExtensionMode.Production) {
            return;
        }

        const storage = this.container.get<IFabricExtensionsSettingStorage>();
        const account = this.container.get<IAccountProvider>();
        const logger = this.container.get<ILogger>();
        const telemetryService = this.container.get<TelemetryService>();
        const fabricEnvironmentProvider = this.container.get<IFabricEnvironmentProvider>();
        const apiClient = this.container.get<IFabricApiClient>();
        const artifactManager = this.container.get<IArtifactManagerInternal>();
        const coreServiceCollection = this.container.get<IFabricExtensionServiceCollection>();

        extensionManager.testHooks = {
            'accountProvider': account,
            'fabricApiClient': apiClient,
            'fabricExtensionsSettingStorage': storage,
            'serviceCollection': coreServiceCollection,
            'context': context,
            'logger': logger,
            'fabricEnvironmentProvider': fabricEnvironmentProvider,
            'telemetryService': telemetryService,
            'configurationProvider': this.container.get<IConfigurationProvider>(),
            'workspaceDataProvider': this.container.get<FabricWorkspaceDataProvider>(),
            'vscodeUIBypass': new VSCodeUIBypass(),
            'artifactManager': artifactManager,
        };

        // If using fakes, also expose the fake client for test configuration
        if (process.env.VSCODE_FABRIC_ENABLE_TEST_FAKES === 'true' && apiClient instanceof FakeFabricApiClient) {
            extensionManager.testHooks['fakeFabricApiClient'] = apiClient;
        }
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

    /**
     * Prompts the user to install the Fabric MCP Server extension if not already installed.
     * This is called asynchronously during activation to avoid blocking startup.
     * Only prompts if GitHub Copilot extension is installed.
     */
    private async promptMcpServerInstall(): Promise<void> {
        const telemetryService = this.container.get<TelemetryService>();
        const configurationProvider = this.container.get<IConfigurationProvider>();
        const logger = this.container.get<ILogger>();

        const copilotExtensionId = 'github.copilot-chat';
        const mcpExtensionId = 'fabric.vscode-fabric-mcp-server';
        const configKey = 'Fabric.McpServer.PromptInstall';

        try {
            // Only prompt if GitHub Copilot is installed
            const copilotExtension = vscode.extensions.getExtension(copilotExtensionId);
            if (!copilotExtension) {
                return; // Copilot not installed, no need to prompt for MCP server
            }

            // Check if the MCP extension is already installed
            const mcpExtension = vscode.extensions.getExtension(mcpExtensionId);
            if (mcpExtension) {
                return; // Already installed, nothing to do
            }

            // Check if user has opted out of the prompt
            const shouldPrompt = configurationProvider.get<boolean>(configKey, true);
            if (!shouldPrompt) {
                return;
            }

            // Show the prompt with three options
            const installOption = vscode.l10n.t('Install');
            const notNowOption = vscode.l10n.t('Not Now');
            const neverAskAgainOption = vscode.l10n.t("Don't Ask Again");

            const choice = await vscode.window.showInformationMessage(
                vscode.l10n.t('Enhance your Fabric Copilot experience by installing the Fabric MCP Server extension.'),
                installOption,
                notNowOption,
                neverAskAgainOption
            );

            let userChoice: string;

            if (choice === installOption) {
                userChoice = 'installed';
                let installed = false;

                // Try to install stable version first
                try {
                    logger.info(`Attempting to install stable version of ${mcpExtensionId}...`);
                    await vscode.commands.executeCommand('workbench.extensions.installExtension', mcpExtensionId);
                    installed = !!vscode.extensions.getExtension(mcpExtensionId);
                }
                catch (stableError) {
                    logger.info(`Stable version not available: ${stableError}`);
                }

                // If stable version was not installed, try prerelease
                if (!installed) {
                    try {
                        logger.info(`Attempting to install prerelease version of ${mcpExtensionId}...`);
                        await vscode.commands.executeCommand('workbench.extensions.installExtension', mcpExtensionId, {
                            installPreReleaseVersion: true,
                        });
                        installed = !!vscode.extensions.getExtension(mcpExtensionId);
                    } catch (prereleaseError) {
                        logger.warn(`Failed to install prerelease version: ${prereleaseError}`);
                    }
                }

                // Log final result
                if (installed) {
                    logger.info(`Successfully installed ${mcpExtensionId}`);
                }
                else {
                    logger.warn(`Failed to install ${mcpExtensionId} - extension not found after installation attempts`);
                }
            }
            else if (choice === neverAskAgainOption) {
                userChoice = 'neverAskAgain';
                await configurationProvider.update<boolean>(configKey, false);
            }
            else {
                userChoice = 'dismissed';
            }

            // Track telemetry
            telemetryService?.sendTelemetryEvent('mcp/installPrompt', { userChoice });

        }
        catch (ex) {
            logger.error(`Failed to prompt for MCP Server extension install: ${ex}`);
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

    // Local folder and git operations
    container.registerSingleton<ILocalFolderManager, LocalFolderManager>();
    container.registerSingleton<ILocalFolderService, LocalFolderService>();
    container.registerSingleton<IGitOperator, GitOperator>();

    // Commands
    container.registerSingleton<IFabricCommandManager, FabricCommandManager>();

    // Other services
    container.registerSingleton<ICapacityManager, CapacityManager>();
    container.registerSingleton<IFabricExtensionManagerInternal, FabricExtensionManager>();
    container.registerTransient<IDisposableCollection, DisposableCollection>();
    container.registerSingleton<IFabricExtensionServiceCollection, FabricExtensionServiceCollection>();
    container.registerSingleton<InternalSatelliteManager>();
    container.registerSingleton<ExtensionUriHandler>();

    // Mock overrides (non-production only)
    if (process.env.VSCODE_FABRIC_USE_MOCKS === 'true' && context.extensionMode !== vscode.ExtensionMode.Production) {
        container.registerSingleton<ILogger>(() => new MockConsoleLogger('Fabric'));
        container.registerSingleton<IConfigurationProvider, FakeConfigurationProvider>();
        container.registerSingleton<ITokenAcquisitionService, MockTokenAcquisitionService>();
        container.registerSingleton<IAccountProvider, MockAccountProvider>();
        container.registerSingleton<IFabricApiClient>(() => new MockApiClient(container.get<ILogger>()));
        container.registerSingleton<IWorkspaceManager, MockWorkspaceManager>();
        container.registerSingleton<IArtifactManager, MockArtifactManager>();
    }

    // Fake overrides for integration testing (non-production only)
    if (process.env.VSCODE_FABRIC_ENABLE_TEST_FAKES === 'true' && context.extensionMode !== vscode.ExtensionMode.Production) {
        container.registerSingleton<ILogger>(() => new MockConsoleLogger('Fabric'));
        container.registerSingleton<IConfigurationProvider, FakeConfigurationProvider>();
        container.registerSingleton<ITokenAcquisitionService>(() => new FakeTokenAcquisitionService());
        container.registerSingleton<IFabricApiClient>(() => new FakeFabricApiClient(
            container.get<IAccountProvider>(),
            container.get<IConfigurationProvider>(),
            container.get<IFabricEnvironmentProvider>(),
            container.get<TelemetryService>(),
            container.get<ILogger>()
        ));
    }

    return container;
}
