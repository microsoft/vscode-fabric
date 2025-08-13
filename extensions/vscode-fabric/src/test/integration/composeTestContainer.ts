// filepath: /Users/kw/repos/vsfab/extensions/vscode-fabric/src/test/integration/composeTestContainer.ts
import { DIContainer } from '@wessberg/di';
import * as vscode from 'vscode';
import { AccountProvider, ConfigurationProvider, DisposableCollection, FabricEnvironmentProvider, FabricUriHandler, FakeTokenAcquisitionService, IAccountProvider, IConfigurationProvider, IDisposableCollection, IFabricEnvironmentProvider, ILogger, ITokenAcquisitionService, MockApiClient, MockConsoleLogger, TelemetryService } from '@fabric/vscode-fabric-util';
import { IArtifactManager, IFabricApiClient, IFabricExtensionServiceCollection, IWorkspaceManager } from '@fabric/vscode-fabric-api';
import { GitOperator } from '../../git/GitOperator';
import { FabricExtensionServiceCollection } from '../../FabricExtensionServiceCollection';
import { FabricWorkspaceDataProvider, IRootTreeNodeProvider, RootTreeNodeProvider } from '../../workspace/treeView';
import { LocalFolderManager } from '../../LocalFolderManager';
import { FabricExtensionsSettingStorage } from '../../settings/FabricExtensionsSettingStorage';
import { IFabricExtensionsSettingStorage } from '../../settings/definitions';
import { ExtensionContext, Memento } from 'vscode';
import { FabricExtensionManager } from '../../extensionManager/FabricExtensionManager';
import { ArtifactManager } from '../../artifactManager/ArtifactManager';
import { WorkspaceManager } from '../../workspace/WorkspaceManager';
import { IArtifactManagerInternal, IFabricExtensionManagerInternal, IGitOperator } from '../../apis/internal/fabricExtensionInternal';
import { It, Mock } from 'moq.ts';
import { TenantStatusBar } from '../../tenant/TenantStatusBar';
import { InternalSatelliteManager } from '../../internalSatellites/InternalSatelliteManager';
import { ICapacityManager, CapacityManager } from '../../CapacityManager';

// Define an extended Memento interface with setKeysForSync method
interface ExtendedMemento extends vscode.Memento {
    setKeysForSync(keys: readonly string[]): void;
}

/**
 * Creates mock objects for vscode.ExtensionContext including workspaceState and globalState
 * with properly typed Memento objects
 * @returns A tuple containing the mock context and a shared memento store for test state
 */
export function createMockExtensionContext(): [Mock<vscode.ExtensionContext>, Map<string, any>] {
    const mockContext = new Mock<vscode.ExtensionContext>();
    mockContext.setup(context => context.subscriptions).returns([]);

    const mementoStore = new Map<string, any>();
    
    // Create a mock using the extended interface
    const mockGlobalState = new Mock<ExtendedMemento>();
    
    mockGlobalState.setup(x => x.get(It.IsAny<string>(), It.IsAny()))
        .callback(interaction => {
            const key = interaction.args[0];
            const defaultValue = interaction.args[1];
            return mementoStore.get(key) ?? defaultValue;
        });

    mockGlobalState.setup(x => x.update(It.IsAny<string>(), It.IsAny()))
        .callback(interaction => {
            const key = interaction.args[0];
            const value = interaction.args[1];
            mementoStore.set(key, value);
            return Promise.resolve();
        });
    
    mockGlobalState.setup(x => x.setKeysForSync(It.IsAny<readonly string[]>()))
        .returns(undefined);

    const mockMemento = new Mock<vscode.Memento>();
    mockMemento.setup(x => x.get(It.IsAny<string>(), It.IsAny()))
        .callback(interaction => {
            const key = interaction.args[0];
            const defaultValue = interaction.args[1];
            return mementoStore.get(key) ?? defaultValue;
        });

    mockMemento.setup(x => x.update(It.IsAny<string>(), It.IsAny()))
        .callback(interaction => {
            const key = interaction.args[0];
            const value = interaction.args[1];
            mementoStore.set(key, value);
            return Promise.resolve();
        });

    mockContext.setup((x) => x.workspaceState).returns(mockMemento.object());
    mockContext.setup((x) => x.globalState).returns(mockGlobalState.object());
    
    return [mockContext, mementoStore];
}

/**
 * Sets up the test dependency injection container with production and mock services.
 * This container configuration uses actual implementations for most services but substitutes:
 * - MockConsoleLogger instead of the production logger
 * - FakeTokenAcquisitionService for authentication
 * - MockApiClient for backend communication
 * 
 * All services can be overridden during test setup by registering a new service in the container. 
 * 
 * This approach allows testing the extension with minimal mocking while avoiding
 * external service dependencies.
 */
export async function composeTestContainer(): Promise<DIContainer> {
    const container = new DIContainer();

    const [mockContext, mementoStore] = createMockExtensionContext();

    // Need to register as both ExtensionContext and vscode.ExtensionContext, bug in DIContainer?
    container.registerSingleton<ExtensionContext>(() => mockContext.object());
    container.registerSingleton<vscode.ExtensionContext>(() => mockContext.object());

    // Logger and TelemetryService are initialized at the very beginning to ensure we catch all errors
    container.registerSingleton<ILogger>(() => new MockConsoleLogger('Fabric (tests)'));
    container.registerSingleton<TelemetryService>(() => null!);
    container.registerSingleton<TelemetryService | null>(() => null);

    container.registerSingleton<IFabricExtensionManagerInternal>(() => 
        new FabricExtensionManager(container.get<TelemetryService>(), container.get<ILogger>()));

    container.registerTransient<IDisposableCollection>(() => new DisposableCollection(mockContext.object()));
    container.registerSingleton<IConfigurationProvider>(() => new ConfigurationProvider(container.get<IDisposableCollection>()));

    container.registerSingleton<IFabricEnvironmentProvider>(() =>
        new FabricEnvironmentProvider(container.get<IConfigurationProvider>(), container.get<ILogger>()));

    // auth related mocks
    container.registerSingleton<ITokenAcquisitionService>(() => new FakeTokenAcquisitionService());
    container.registerSingleton<IAccountProvider>(() => new AccountProvider(container.get<ITokenAcquisitionService>()));
    container.registerSingleton<IFabricApiClient>(() => new MockApiClient(container.get<ILogger>()));

    container.registerSingleton<IGitOperator>(() => new GitOperator(container.get<ILogger>()));

    // Use the properly mocked globalState that includes setKeysForSync
    container.registerSingleton<Memento>(() => mockContext.object().globalState);
    container.registerSingleton<IFabricExtensionsSettingStorage>(() =>
        new FabricExtensionsSettingStorage(
            container.get<Memento>(),
            container.get<IFabricEnvironmentProvider>(),
            container.get<IConfigurationProvider>()
        )
    );

    container.registerSingleton<LocalFolderManager>(() => 
        new LocalFolderManager(container.get<IFabricExtensionsSettingStorage>(), container.get<IFabricEnvironmentProvider>()));

    container.registerSingleton<IWorkspaceManager>(() => 
        new WorkspaceManager(
            container.get<IAccountProvider>(),
            container.get<IFabricEnvironmentProvider>(),
            container.get<IFabricExtensionsSettingStorage>(), 
            container.get<LocalFolderManager>(),
            container.get<IFabricApiClient>(),
            container.get<ILogger>(),
            container.get<IGitOperator>(),
        )
    );

    container.registerSingleton<IRootTreeNodeProvider>(() =>
        new RootTreeNodeProvider(
            container.get<IFabricExtensionsSettingStorage>(),
            container.get<ExtensionContext>(),
            container.get<IFabricExtensionManagerInternal>(), 
            container.get<IWorkspaceManager>(),
            container.get<TelemetryService>()
        )
    );

    container.registerSingleton<FabricWorkspaceDataProvider>(() => 
        new FabricWorkspaceDataProvider(
            container.get<ExtensionContext>(),
            container.get<IFabricExtensionManagerInternal>(),
            container.get<IWorkspaceManager>(), 
            container.get<IRootTreeNodeProvider>(),
            container.get<ILogger>(),
            container.get<TelemetryService>()
        )
    );

    container.registerSingleton<IArtifactManager>(() =>
        new ArtifactManager(
            container.get<IFabricExtensionManagerInternal>(),
            container.get<IWorkspaceManager>(),
            container.get<IFabricEnvironmentProvider>(),
            container.get<IFabricApiClient>(),
            container.get<ILogger>(),
            null,
            container.get<FabricWorkspaceDataProvider>()
        )
    );

    container.registerSingleton<IArtifactManagerInternal>(() => container.get<IArtifactManager>() as IArtifactManagerInternal);

    container.registerSingleton<IFabricExtensionServiceCollection>(() =>
        new FabricExtensionServiceCollection(
            container.get<IArtifactManager>(),
            container.get<IWorkspaceManager>(),
            container.get<IFabricApiClient>()
        )
    );

    container.registerSingleton<FabricUriHandler>(() =>
        new FabricUriHandler(
            container.get<IFabricExtensionServiceCollection>(),
            container.get<TelemetryService>(),
            container.get<ILogger>(),
            container.get<IFabricEnvironmentProvider>(),
            container.get<IConfigurationProvider>()
        )
    );

    container.registerSingleton<TenantStatusBar>(() =>
        new TenantStatusBar(container.get<IFabricExtensionsSettingStorage>()));

    container.registerSingleton<InternalSatelliteManager>(() =>
        new InternalSatelliteManager(
            container.get<ExtensionContext>(),
            container.get<TelemetryService>(),
            container.get<ILogger>(),
            container.get<IFabricExtensionManagerInternal>()
        )
    );

    container.registerSingleton<ICapacityManager>(() =>
        new CapacityManager(
            container.get<IFabricApiClient>(),
        )
    );

    return container;
}