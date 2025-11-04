// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';
import * as querystring from 'querystring';

import { FeedbackTreeDataProvider } from './feedback/FeedbackTreeDataProvider';
import { WorkspaceManager, WorkspaceManagerBase } from './workspace/WorkspaceManager';
import { IFabricExtensionManager, Schema, IArtifactManager, IFabricApiClient, IFabricExtensionServiceCollection, IWorkspaceManager, FabricTreeNode } from '@microsoft/vscode-fabric-api';
import {
    TelemetryService,
    TelemetryActivity,
    FabricUriHandler,
    FabricEnvironmentProvider,
    ConfigurationProvider,
    IConfigurationProvider,
    IFabricEnvironmentProvider,
    ILogger,
    IDisposableCollection,
    DisposableCollection,
    FakeConfigurationProvider,
    MockConsoleLogger,
    VSCodeUIBypass,
} from '@microsoft/vscode-fabric-util';
import { ITokenAcquisitionService, IAccountProvider } from './authentication/interfaces';
import { AccountProvider } from './authentication/AccountProvider';
import { TokenAcquisitionService, VsCodeAuthentication, DefaultVsCodeAuthentication } from './authentication/TokenAcquisitionService';
import { MockTokenAcquisitionService, MockAccountProvider } from './authentication/mocks';
import { FabricApiClient, MockApiClient, FakeFabricApiClient } from './fabric';
import { FabricExtensionServiceCollection } from './FabricExtensionServiceCollection';
import { Logger } from '@microsoft/vscode-fabric-util';
import { LocalProjectTreeDataProvider } from './localProject/LocalProjectTreeDataProvider';
import { ExplorerLocalProjectDiscovery } from './localProject/ExplorerLocalProjectDiscovery';
import { WorkspaceFolderProvider } from './localProject/WorkspaceFolderProvider';
import { IFabricExtensionsSettingStorage } from './settings/definitions';
import { IFabricExtensionManagerInternal, IGitOperator } from './apis/internal/fabricExtensionInternal';
import { FabricWorkspaceDataProvider, RootTreeNodeProvider } from './workspace/treeView';
import { recordExpansionChange } from './workspace/viewExpansionState';
import { IRootTreeNodeProvider } from './workspace/definitions';
import { registerArtifactCommands } from './artifactManager/commands';
import { registerWorkspaceCommands } from './workspace/commands';
import { registerTenantCommands } from './tenant/commands';
import { registerLocalProjectCommands } from './localProject/commands';
import TelemetryReporter from '@vscode/extension-telemetry';
import { FabricExtensionManager } from './extensionManager/FabricExtensionManager';
import { IArtifactManagerInternal } from './apis/internal/fabricExtensionInternal';
import { ICapacityManager, CapacityManager } from './CapacityManager';

// Information about the DI container can be found here: https://raw.githubusercontent.com/wessberg/DI/refs/heads/master/README.md
import { DIContainer } from '@wessberg/di';
import { GitOperator } from './git/GitOperator';
import { FabricExtensionsSettingStorage } from './settings/FabricExtensionsSettingStorage';
import { LocalFolderManager } from './LocalFolderManager';
import { ArtifactManager } from './artifactManager/ArtifactManager';
import { MockArtifactManager } from './artifactManager/MockArtifactManager';
import { MockWorkspaceManager } from './workspace/mockWorkspaceManager';
import { InternalSatelliteManager } from './internalSatellites/InternalSatelliteManager';
import { WorkspaceFilterManager, IWorkspaceFilterManager } from './workspace/WorkspaceFilterManager';
import { FakeTokenAcquisitionService } from './authentication';
import { FabricEnvironmentStatusBar } from './environment/FabricEnvironmentStatusBar';

let app: FabricVsCodeExtension;

export async function activate(context: vscode.ExtensionContext): Promise<IFabricExtensionManager> {
    const container = await composeContainer(context);
    app = new FabricVsCodeExtension(container);
    return await app.activate();
}

export async function deactivate() {
    return await app.deactivate();
}

export class FabricVsCodeExtension {
    constructor(private readonly container: DIContainer) { }

    async activate(): Promise<IFabricExtensionManager> {
        const logger = this.container.get<ILogger>();
        const telemetryService = this.container.get<TelemetryService>();
        const eventName: string = 'extension/start';
        try {

            const context = this.container.get<ExtensionContext>();
            const activateActivity = new TelemetryActivity('activation', telemetryService);

            // Create feedback view
            context.subscriptions.push(vscode.window.createTreeView('vscode-fabric.view.feedback', {
                treeDataProvider: new FeedbackTreeDataProvider(context),
            }));

            const storage = this.container.get<IFabricExtensionsSettingStorage>();
            await storage.load();

            const extensionManager = this.container.get<IFabricExtensionManagerInternal>();
            const account = this.container.get<IAccountProvider>();
            const workspaceManager = this.container.get<IWorkspaceManager>() as WorkspaceManagerBase;
            const workspaceFilterManager = this.container.get<IWorkspaceFilterManager>();
            const dataProvider = this.container.get<FabricWorkspaceDataProvider>();
            const artifactManager = this.container.get<IArtifactManagerInternal>();
            const localFolderManager = this.container.get<LocalFolderManager>();
            const apiClient = this.container.get<IFabricApiClient>();
            const fabricEnvironmentProvider = this.container.get<IFabricEnvironmentProvider>();
            const configurationProvider = this.container.get<IConfigurationProvider>();
            const capacityManager = this.container.get<ICapacityManager>();

            const environmentStatusBar = new FabricEnvironmentStatusBar(configurationProvider, fabricEnvironmentProvider);
            await environmentStatusBar.initialize(context);
            context.subscriptions.push(environmentStatusBar);

            const treeView: vscode.TreeView<FabricTreeNode> = vscode.window.createTreeView('vscode-fabric.view.workspace',
                { treeDataProvider: dataProvider, showCollapseAll: true });

            // Persist top-level expansion state (Option C)
            const updateExpansionState = async (element: FabricTreeNode | undefined, expand: boolean) => {
                try {
                    if (!element || !('id' in element) || !element.id) {
                        return;
                    }
                    const id = (element as any).id as string;
                    if (!id.startsWith('tenant:') && !id.startsWith('ws:') && !id.startsWith('grp:')) {
                        return;
                    }
                    await recordExpansionChange(storage, fabricEnvironmentProvider, account, id, expand);
                }
                catch { /* ignore */ }
            };

            treeView.onDidExpandElement(async (e) => updateExpansionState(e.element, true));
            treeView.onDidCollapseElement(async (e) => updateExpansionState(e.element, false));

            const rootTreeNodeProvider = this.container.get<IRootTreeNodeProvider>() as RootTreeNodeProvider;
            await rootTreeNodeProvider.enableCommands();

            // TODO this is strange. The dependencies should be injected...
            // And it seems cyclical. The dataProvider is created with the workspaceManager, but the workspaceManager depends dataProvider ??
            workspaceManager.tvProvider = dataProvider;
            workspaceManager.treeView = treeView;

            registerWorkspaceCommands(context, account, workspaceManager, capacityManager, telemetryService, logger, workspaceFilterManager);
            registerTenantCommands(context, account, telemetryService, logger);
            await registerArtifactCommands(context, workspaceManager, fabricEnvironmentProvider, artifactManager, dataProvider, extensionManager, workspaceFilterManager, capacityManager, telemetryService, logger);
            registerLocalProjectCommands(context, workspaceManager, fabricEnvironmentProvider, artifactManager, extensionManager, localFolderManager, workspaceFilterManager, capacityManager, dataProvider, telemetryService, logger);

            const coreServiceCollection: IFabricExtensionServiceCollection = this.container.get<IFabricExtensionServiceCollection>();
            extensionManager.serviceCollection = coreServiceCollection;

            const workspaceFolderProvider = await WorkspaceFolderProvider.create(logger, telemetryService);
            context.subscriptions.push(workspaceFolderProvider);

            // Create/register the local project tree view
            const explorerLocalProjectDiscovery = await ExplorerLocalProjectDiscovery.create(workspaceFolderProvider);
            context.subscriptions.push(vscode.window.createTreeView('vscode-fabric.view.local', {
                treeDataProvider: new LocalProjectTreeDataProvider(context, explorerLocalProjectDiscovery, extensionManager, logger, telemetryService),
            }));

            // Register the virtual document provider
            initFabricVirtualDocProvider(context);

            // Set up default telemetry property for Fabric environment
            async function onEnvironmentChanged() {
                const environment = fabricEnvironmentProvider.getCurrent();
                if (environment) {
                    telemetryService?.addOrUpdateDefaultProperty('fabricEnvironment', environment.env);
                }
            }
            fabricEnvironmentProvider.onDidEnvironmentChange(async () => await onEnvironmentChanged());
            await onEnvironmentChanged();

            // Handler to update session properties for telemetry
            async function updateDefaultAccountProperties() {
                const sessionPropertiesForTelemetry = await account.getDefaultTelemetryProperties();
                telemetryService?.addOrUpdateDefaultProperty('tenantid', sessionPropertiesForTelemetry.tenantid);

                telemetryService?.addOrUpdateDefaultProperty('useralias', sessionPropertiesForTelemetry.useralias);
                telemetryService?.addOrUpdateDefaultProperty('ismicrosoftinternal', sessionPropertiesForTelemetry.isMicrosoftInternal);
            }
            // Update the default account properties when the user signs in or out, including switching tenants
            account.onSignInChanged(async () => await updateDefaultAccountProperties());
            // Initialize the default account properties for the first time
            await updateDefaultAccountProperties();

            async function tenantChanged() {
                const tenantInformation = await account.getCurrentTenant();
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
            account.onTenantChanged(async () => await tenantChanged());
            account.onTenantChanged(async () => await updateDefaultAccountProperties());

            // set testhooks in the extension manager
            if (process.env.VSCODE_FABRIC_ENABLE_TEST_HOOKS === 'true' && context.extensionMode !== vscode.ExtensionMode.Production) {
                extensionManager.testHooks = {
                    'accountProvider': account,
                    'fabricApiClient': apiClient,
                    'fabricExtensionsSettingStorage': storage,
                    'serviceCollection': coreServiceCollection,
                    'context': context,
                    'logger': logger,
                    'fabricEnvironmentProvider': fabricEnvironmentProvider,
                    'telemetryService': telemetryService,
                    'configurationProvider': configurationProvider,
                    'workspaceDataProvider': this.container.get<FabricWorkspaceDataProvider>(),
                    'vscodeUIBypass': new VSCodeUIBypass(),
                    'artifactManager': artifactManager,

                };

                // If using fakes, also expose the fake client for test configuration
                if (process.env.VSCODE_FABRIC_ENABLE_TEST_FAKES === 'true' && apiClient instanceof FakeFabricApiClient) {
                    extensionManager.testHooks['fakeFabricApiClient'] = apiClient;
                }
            }
            // register the uri handler
            context.subscriptions.push(
                vscode.window.registerUriHandler(this.container.get<FabricUriHandler>())
            );

            const internalSatelliteManger = this.container.get<InternalSatelliteManager>();
            internalSatelliteManger.activateAll();
            context.subscriptions.push(internalSatelliteManger);

            activateActivity.end();
            activateActivity.sendTelemetry();

            // Send successful activation
            telemetryService?.sendTelemetryEvent(eventName);

            // We want to have as much of the extension initialized as possible before we refresh the connection, causing
            // much code to execute. This is to ensure that the extension is initialized before we start executing code
            // So we call refreshConnectionToFabric() but don't await it.
            // This solves the problem of calling the code to draw tree nodes before the extension is completely initialized
            void workspaceManager.refreshConnectionToFabric();

            return extensionManager;
        }
        catch (ex) {
            logger.reportExceptionTelemetryAndLog('activate', eventName, ex, telemetryService);
            throw ex;
        }
    }
    async deactivate(): Promise<void> {
        const logger = this.container.get<ILogger>();
        const telemetryService = this.container.get<TelemetryService>();
        const context = this.container.get<ExtensionContext>();
        let eventName: string = 'extension/exit';

        try {
            // Report successful deactivation
            telemetryService?.sendTelemetryEvent(eventName, { shutdownReason: 'Normal' });

            // Manually dispose and clear subscriptionsx
            // This is redundant because VS Code will do it automatically
            // but allows for manual programatic cleanup (i.e., for testing)
            if (context?.subscriptions) {
                // Copy array first to avoid issues with disposal potentially modifying the array
                [...context.subscriptions].forEach(sub => sub.dispose());

                // Clear the array to prevent double disposal by VS Code.
                // Not entirely necessary, but good insurance against improperly
                // implemented disposableslemented disposables that are potentially
                // not idempotent.
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

function initFabricVirtualDocProvider(context: vscode.ExtensionContext) {
    const provider = new class implements vscode.TextDocumentContentProvider {
        provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
            let content = querystring.parse(uri.query).content as string;
            let result = '';
            try {
                const jsconContent = JSON.parse(content);
                if (jsconContent.payloadContentType === 'InlineJson' && jsconContent.workloadPayload) { // expand stringified json
                    const jsPayload = JSON.parse(jsconContent.workloadPayload);
                    jsconContent.workloadPayload = jsPayload;
                }
                // Format all of the content and set indents & spacing to 2
                result += JSON.stringify(jsconContent, null, 2);
            }
            catch (error) {
                result = JSON.stringify(error);
            }
            return result;
        }
    };
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(Schema.fabricVirtualDoc, provider)
    );
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

    container.registerSingleton<IFabricExtensionManagerInternal, FabricExtensionManager>();
    container.registerTransient<IDisposableCollection, DisposableCollection>();
    container.registerSingleton<IConfigurationProvider, ConfigurationProvider>();

    container.registerSingleton<IFabricEnvironmentProvider, FabricEnvironmentProvider>();
    container.registerSingleton<VsCodeAuthentication, DefaultVsCodeAuthentication>();
    container.registerSingleton<ITokenAcquisitionService, TokenAcquisitionService>();
    container.registerSingleton<IAccountProvider, AccountProvider>();

    container.registerSingleton<IFabricApiClient>(() => new FabricApiClient(
        container.get<IAccountProvider>(),
        container.get<IConfigurationProvider>(),
        container.get<IFabricEnvironmentProvider>(),
        container.get<TelemetryService>(),
        container.get<ILogger>()
    ));
    container.registerSingleton<IGitOperator, GitOperator>();

    container.registerSingleton<vscode.Memento>(() => container.get<ExtensionContext>().globalState);
    container.registerSingleton<IFabricExtensionsSettingStorage, FabricExtensionsSettingStorage>();
    container.registerSingleton<LocalFolderManager>();
    container.registerSingleton<IWorkspaceManager, WorkspaceManager>();
    container.registerSingleton<IRootTreeNodeProvider, RootTreeNodeProvider>();
    container.registerSingleton<IWorkspaceFilterManager, WorkspaceFilterManager>();
    container.registerSingleton<FabricWorkspaceDataProvider>();

    container.registerSingleton<IArtifactManager, ArtifactManager>();
    container.registerSingleton<IArtifactManagerInternal>(() => container.get<IArtifactManager>() as IArtifactManagerInternal);
    container.registerSingleton<IFabricExtensionServiceCollection, FabricExtensionServiceCollection>();

    container.registerSingleton<ICapacityManager, CapacityManager>();

    container.registerSingleton<FabricUriHandler>();
    container.registerSingleton<InternalSatelliteManager>();

    if (process.env.VSCODE_FABRIC_USE_MOCKS === 'true' && context.extensionMode !== vscode.ExtensionMode.Production) {
        // if mocks are requested, override with mock implementations
        container.registerSingleton<ILogger>(() => new MockConsoleLogger('Fabric'));
        container.registerSingleton<IArtifactManager, MockArtifactManager>();
        container.registerSingleton<IWorkspaceManager, MockWorkspaceManager>();
        container.registerSingleton<ITokenAcquisitionService, MockTokenAcquisitionService>();
        container.registerSingleton<IAccountProvider, MockAccountProvider>();
        container.registerSingleton<IFabricApiClient>(() => new MockApiClient(container.get<ILogger>())); // registering the same item, the last one registered always wins.
        container.registerSingleton<IConfigurationProvider, FakeConfigurationProvider>();
    }

    if (process.env.VSCODE_FABRIC_ENABLE_TEST_FAKES === 'true' && context.extensionMode !== vscode.ExtensionMode.Production) {
        // if fakes are requested, override with fake implementations that extend real implementations
        container.registerSingleton<ILogger>(() => new MockConsoleLogger('Fabric'));
        container.registerSingleton<IFabricApiClient>(() => new FakeFabricApiClient(
            container.get<IAccountProvider>(),
            container.get<IConfigurationProvider>(),
            container.get<IFabricEnvironmentProvider>(),
            container.get<TelemetryService>(),
            container.get<ILogger>()
        )); // registering the same item, the last one registered always wins.
        container.registerSingleton<ITokenAcquisitionService>(() => new FakeTokenAcquisitionService());
        container.registerSingleton<IConfigurationProvider, FakeConfigurationProvider>();
    }

    return container;
}
