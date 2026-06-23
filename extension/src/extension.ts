// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// External packages
import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';
import { DIContainer } from '@wessberg/di';

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
    FakeConfigurationProvider,
    IConfigurationProvider,
    IFabricEnvironmentProvider,
    ILogger,
    MockConsoleLogger,
    TelemetryService,
    VSCodeUIBypass,
} from '@microsoft/vscode-fabric-util';

// APIs/Interfaces
import { IArtifactManagerInternal, IFabricExtensionManagerInternal, IGitOperator } from './apis/internal/fabricExtensionInternal';

// Authentication
import { FakeTokenAcquisitionService } from './authentication';
import { IAccountProvider, ITokenAcquisitionService } from './authentication/interfaces';
import { MockAccountProvider, MockTokenAcquisitionService } from './authentication/mocks';

// Fabric API client
import { FakeFabricApiClient, MockApiClient } from './fabric';

// Workspace/Tree views
import { FabricWorkspaceDataProvider } from './workspace/treeView';
import { MockWorkspaceManager } from './workspace/mockWorkspaceManager';
import { IWorkspaceFilterManager } from './workspace/WorkspaceFilterManager';
import { WorkspaceManagerBase } from './workspace/WorkspaceManager';

// Artifact manager
import { registerArtifactExportCommands } from './artifactManager/commands.export';
import { MockArtifactManager } from './artifactManager/MockArtifactManager';

// Local project
import { registerLocalProjectCommands } from './localProject/commands';
import { ExplorerLocalProjectDiscovery } from './localProject/ExplorerLocalProjectDiscovery';
import { LocalProjectTreeDataProvider } from './localProject/LocalProjectTreeDataProvider';
import { WorkspaceFolderProvider } from './localProject/WorkspaceFolderProvider';

// Other services
import { ICapacityManager } from './CapacityManager';
import { ExtensionUriHandler } from './ExtensionUriHandler';
import { GitOperator } from './git/GitOperator';
import { ILocalFolderManager } from './ILocalFolderManager';
import { LocalFolderManager } from './LocalFolderManager';
import { ILocalFolderService } from './LocalFolderService';
import { IFabricExtensionsSettingStorage } from './settings/definitions';

// Base class
import { FabricVsCodeExtensionBase, composeBaseContainer } from './FabricVsCodeExtensionBase';

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

export class FabricVsCodeExtension extends FabricVsCodeExtensionBase {
    /**
     * Prompts the user to install the MCP Server extension (fire-and-forget, non-blocking).
     */
    protected override async beforeActivate(): Promise<void> {
        void this.promptMcpServerInstall();
    }

    /**
     * Sets up integration test hooks after activation completes.
     */
    protected override async afterActivate(): Promise<void> {
        this.setupTestHooks();
    }

    /**
     * Registers feedback, workspace, and local project tree views.
     */
    protected override async registerViews(): Promise<vscode.TreeView<FabricTreeNode>> {
        const treeView = await super.registerViews();

        const context = this.container.get<ExtensionContext>();
        const logger = this.container.get<ILogger>();
        const telemetryService = this.container.get<TelemetryService>();
        const extensionManager = this.container.get<IFabricExtensionManagerInternal>();

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
     * Registers workspace, tenant, artifact, export, and local project commands.
     */
    protected override async registerCommands(): Promise<void> {
        await super.registerCommands();

        const context = this.container.get<ExtensionContext>();
        const logger = this.container.get<ILogger>();
        const telemetryService = this.container.get<TelemetryService>();
        const workspaceManager = this.container.get<IWorkspaceManager>() as WorkspaceManagerBase;
        const artifactManager = this.container.get<IArtifactManagerInternal>();
        const fabricEnvironmentProvider = this.container.get<IFabricEnvironmentProvider>();
        const extensionManager = this.container.get<IFabricExtensionManagerInternal>();
        const workspaceFilterManager = this.container.get<IWorkspaceFilterManager>();
        const capacityManager = this.container.get<ICapacityManager>();
        const dataProvider = this.container.get<FabricWorkspaceDataProvider>();
        const localFolderService = this.container.get<ILocalFolderService>();
        const configurationProvider = this.container.get<IConfigurationProvider>();
        const accountProvider = this.container.get<IAccountProvider>();

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
    protected override setupEventHandlers(treeView: vscode.TreeView<FabricTreeNode>): void {
        super.setupEventHandlers(treeView);

        const context = this.container.get<ExtensionContext>();

        // URI handler
        context.subscriptions.push(
            vscode.window.registerUriHandler(this.container.get<ExtensionUriHandler>())
        );
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
    const container = composeBaseContainer(context);

    // Local folder and git operations (desktop-native implementations)
    container.registerSingleton<ILocalFolderManager, LocalFolderManager>();
    container.registerSingleton<IGitOperator, GitOperator>();

    // URI handler (desktop only)
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
