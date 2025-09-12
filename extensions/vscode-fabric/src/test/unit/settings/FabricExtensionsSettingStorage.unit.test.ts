import * as vscode from 'vscode';
import * as assert from 'assert';

import { IFabricExtensionSettings, IFabricWorkspaceSettings, fabricWorkspaceSettingsVersion } from '../../../settings/definitions';
import { FabricExtensionsSettingStorage } from '../../../settings/FabricExtensionsSettingStorage';
import { FabricEnvironmentName, IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { MockFabricEnvironmentProvider } from '../general/serviceCollection';

const settingsFabricWorkspace = 'settingsFabricWorkspace';
const defaultFabricEnvironment = FabricEnvironmentName.MOCK;

class MockMemento implements vscode.Memento {
    private data: Map<string, any> = new Map();

    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string, defaultValue?: T): T {
        let value = this.data.get(key);
        if (typeof value === 'undefined') {
            value = defaultValue;
        }
        return value;
    }

    update(key: string, value: any): Thenable<void> {
        this.data.set(key, value);
        return Promise.resolve();
    }

    keys(): readonly string[] {
        return Array.from(this.data.keys());
    }
}

function createWorkspaceFolder(workspaceId: string, fabricEnvironment?: string): IFabricWorkspaceSettings {
    return {
        workspaceId: workspaceId,
        tenantId: undefined,
        fabricEnv: fabricEnvironment ?? defaultFabricEnvironment,
    };
}

class MockConfigurationProvider implements IConfigurationProvider{
    get<T>(key: string, defaultValue: T): T {
        return defaultValue;
    }
    update<T>(key: string, value: T): Thenable<void> {
        throw new Error('Method not implemented.');
    }
    private onDidConfigurationChangeEmitter = new vscode.EventEmitter<string>();
    readonly onDidConfigurationChange = this.onDidConfigurationChangeEmitter.event;
}

describe('FabricExtensionsSettingStorage unit tests', () => {
    it('Load gets all of the data', async () => {
        const memento = new MockMemento();
        const expectedSettings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            loginState: false,
            workspaces: [
                createWorkspaceFolder('mockWorkspace1'),
                createWorkspaceFolder('mockWorkspace2'),
            ],
            artifacts: [
                { artifactId: 'mockArtifact1' },
                { artifactId: 'mockArtifact2' },
            ],
            displayStyle: 'MockDisplayStyle',
            currentTenant: undefined,
            viewState: {},
            workspaceFilters: undefined
        };
        await memento.update(settingsFabricWorkspace, expectedSettings);
        const storage = new FabricExtensionsSettingStorage(memento, new MockFabricEnvironmentProvider(), new MockConfigurationProvider());

        const loadResult: boolean = await storage.load();
        assert(loadResult, 'Settings load should have succeeded');

        assert.deepEqual(storage.settings, expectedSettings, 'Loaded settings');
    });

    it('Load handles undefined elements', async () => {
        const memento = new MockMemento();
        const expectedSettings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            workspaces: [],
            artifacts: [],
        };
        await memento.update(settingsFabricWorkspace, expectedSettings);
        const storage = new FabricExtensionsSettingStorage(memento, new MockFabricEnvironmentProvider(), new MockConfigurationProvider());

        const loadResult: boolean = await storage.load();
        assert(loadResult, 'Settings load should have succeeded');

        assert(storage.settings.loginState === undefined, 'Login state should be undefined');
        assert(storage.mostRecentWorkspace === undefined, 'Most recent workspace should be undefined');
        assert(storage.settings.displayStyle === undefined, 'Display style should be undefined');
    });

    it('Load handles non-existent settings', async () => {
        const memento = new MockMemento();
        const storage = new FabricExtensionsSettingStorage(memento, new MockFabricEnvironmentProvider(), new MockConfigurationProvider());

        const loadResult: boolean = await storage.load();
        assert(!loadResult, 'Settings should have failed to load because settings were never defined');
        assert(storage.settings !== undefined, 'Storage settings should be defined');
        assert.equal(storage.settings.version, fabricWorkspaceSettingsVersion);
        assert(storage.settings.workspaces !== undefined, 'Workspace folders should be defined');
        assert.equal(storage.settings.workspaces.length, 0, 'Workspace folders should have no elements');
        assert(storage.settings.artifacts !== undefined, 'Artifact folders should be defined');
        assert(storage.mostRecentWorkspace === undefined, 'Most recent workspace should be undefined');
    });

    it('Load discards old versions', async () => {
        const memento = new MockMemento();
        const settings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion - 1,
            workspaces: [
                createWorkspaceFolder('mockWorkspace1'),
            ],
            artifacts: [],
        };
        await memento.update(settingsFabricWorkspace, settings);

        const storage = new FabricExtensionsSettingStorage(memento, new MockFabricEnvironmentProvider(), new MockConfigurationProvider());
        const loadResult: boolean = await storage.load();
        assert(!loadResult, 'Settings should have failed to load because of old version');
        assert(!memento.get(settingsFabricWorkspace), 'Settings should have been removed because of old version');
    });

    it('Load discards new versions', async () => {
        const memento = new MockMemento();
        const settings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion + 1,
            workspaces: [
                createWorkspaceFolder('mockWorkspace1'),
            ],
            artifacts: [],
        };
        await memento.update(settingsFabricWorkspace, settings);

        const storage = new FabricExtensionsSettingStorage(memento, new MockFabricEnvironmentProvider(), new MockConfigurationProvider());
        const loadResult: boolean = await storage.load();
        assert(!loadResult, 'Settings should have failed to load because of new version');
        assert(!memento.get(settingsFabricWorkspace), 'Settings should have been removed because of new version');
    });

    it('Folder data gets saved', async () => {
        const memento = new MockMemento();
        const settings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            workspaces: [],
            artifacts: [],
        };
        await memento.update(settingsFabricWorkspace, settings);
        const storage = new FabricExtensionsSettingStorage(memento, new MockFabricEnvironmentProvider(), new MockConfigurationProvider());

        const loadResult: boolean = await storage.load();
        assert(loadResult, 'Settings load should have succeeded');

        storage.settings.artifacts = [{ artifactId: 'mockArtifact1' }, { artifactId: 'mockArtifact2' }];
        storage.settings.workspaces = [createWorkspaceFolder('mockWorkspace1'), createWorkspaceFolder('mockWorkspace2')];

        await storage.save();
        const savedSettings: IFabricExtensionSettings | undefined = memento.get(settingsFabricWorkspace);
        assert(savedSettings, 'Settings should have been saved');
        const expectedSettings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            artifacts: [
                { artifactId: 'mockArtifact1' },
                { artifactId: 'mockArtifact2' },
            ],
            workspaces: [
                createWorkspaceFolder('mockWorkspace1'),
                createWorkspaceFolder('mockWorkspace2'),
            ],
            loginState: undefined,
            displayStyle: undefined,
            currentTenant: undefined,
            viewState: {},
            workspaceFilters: undefined
        };
        assert.deepEqual(savedSettings, expectedSettings, 'Saved settings');

    });

    it('Initial recent workspace is saved correctly', async () => {
        const memento = new MockMemento();
        const settings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            loginState: false,
            workspaces: [],
            artifacts: [],
        };
        await memento.update(settingsFabricWorkspace, settings);
        const storage = new FabricExtensionsSettingStorage(memento, new MockFabricEnvironmentProvider(), new MockConfigurationProvider());

        const loadResult: boolean = await storage.load();
        assert(loadResult, 'Settings load should have succeeded');

        storage.mostRecentWorkspace = 'mockWorkspace1';
        await storage.save();
        const expectedSettings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            loginState: false,
            workspaces: [
                createWorkspaceFolder('mockWorkspace1'),
            ],
            artifacts: [],
            displayStyle: undefined,
            currentTenant: undefined,
            viewState: {},
            workspaceFilters: undefined
        };
        assert.deepEqual(memento.get(settingsFabricWorkspace), expectedSettings, 'Updated most recent workspace should have modified save order of workspace folders');

    });

    it('Most recent workspace is saved correctly', async () => {
        const memento = new MockMemento();
        const settings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            loginState: false,
            workspaces: [
                createWorkspaceFolder('mockWorkspace1'),
                createWorkspaceFolder('mockWorkspace2'),
            ],
            artifacts: [
                { artifactId: 'mockArtifact1' },
                { artifactId: 'mockArtifact2' },
            ],
        };
        await memento.update(settingsFabricWorkspace, settings);
        const storage = new FabricExtensionsSettingStorage(memento, new MockFabricEnvironmentProvider(), new MockConfigurationProvider());

        const loadResult: boolean = await storage.load();
        assert(loadResult, 'Settings load should have succeeded');

        storage.mostRecentWorkspace = 'mockWorkspace1';
        await storage.save();
        const expectedSettings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            loginState: false,
            workspaces: [
                createWorkspaceFolder('mockWorkspace2'),
                createWorkspaceFolder('mockWorkspace1'),
            ],
            artifacts: [
                { artifactId: 'mockArtifact1' },
                { artifactId: 'mockArtifact2' },
            ],
            displayStyle: undefined,
            currentTenant: undefined,
            viewState: {},
            workspaceFilters: undefined
        };
        assert.deepEqual(memento.get(settingsFabricWorkspace), expectedSettings, 'Updated most recent workspace should have modified save order of workspace folders');

    });

    it('Most recent workspace is re-saved correctly', async () => {
        const memento = new MockMemento();
        const settings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            loginState: false,
            workspaces: [
                createWorkspaceFolder('mockWorkspace1'),
                createWorkspaceFolder('mockWorkspace2'),
            ],
            artifacts: [
                { artifactId: 'mockArtifact1' },
                { artifactId: 'mockArtifact2' },
            ],
        };
        await memento.update(settingsFabricWorkspace, settings);
        const storage = new FabricExtensionsSettingStorage(memento, new MockFabricEnvironmentProvider(), new MockConfigurationProvider());

        const loadResult: boolean = await storage.load();
        assert(loadResult, 'Settings load should have succeeded');

        storage.mostRecentWorkspace = 'mockWorkspace2';
        await storage.save();
        const expectedSettings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            loginState: false,
            workspaces: [
                createWorkspaceFolder('mockWorkspace1'),
                createWorkspaceFolder('mockWorkspace2'),
            ],
            artifacts: [
                { artifactId: 'mockArtifact1' },
                { artifactId: 'mockArtifact2' },
            ],
            displayStyle: undefined,
            currentTenant: undefined,
            viewState: {},
            workspaceFilters: undefined
        };
        assert.equal(storage.settings.workspaces.length, expectedSettings.workspaces.length, 'Count of saved workspaces');
        assert.deepEqual(memento.get(settingsFabricWorkspace), expectedSettings, 'Updated most recent workspace should have maintained save order of workspace folders');

    });

    it('Most recent workspace is saved even if it does not have a corresponding workspace folder', async () => {
        const memento = new MockMemento();
        const settings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            loginState: false,
            workspaces: [
                createWorkspaceFolder('mockWorkspace1'),
                createWorkspaceFolder('mockWorkspace2'),
            ],
            artifacts: [
                { artifactId: 'mockArtifact1' },
                { artifactId: 'mockArtifact2' },
            ],
        };
        await memento.update(settingsFabricWorkspace, settings);
        const storage = new FabricExtensionsSettingStorage(memento, new MockFabricEnvironmentProvider(), new MockConfigurationProvider());

        const loadResult: boolean = await storage.load();
        assert(loadResult, 'Settings load should have succeeded');

        storage.mostRecentWorkspace = 'mockWorkspace_DNE';
        await storage.save();
        const expectedSettings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            loginState: false,
            workspaces: [
                createWorkspaceFolder('mockWorkspace1'),
                createWorkspaceFolder('mockWorkspace2'),
                createWorkspaceFolder('mockWorkspace_DNE'),
            ],
            artifacts: [
                { artifactId: 'mockArtifact1' },
                { artifactId: 'mockArtifact2' },
            ],
            displayStyle: undefined,
            currentTenant: undefined,
            viewState: {},
            workspaceFilters: undefined
        };
        assert.deepEqual(memento.get(settingsFabricWorkspace), expectedSettings, 'Updated most recent workspace should have modified save order of workspace folders');
    });

    it('Most recent workspace loads based on Fabric environment', async () => {
        const memento = new MockMemento();
        const settings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            loginState: false,
            workspaces: [
                createWorkspaceFolder('customEnvironmentMockWorkspace1'),
                createWorkspaceFolder('defaultEnvironmentMockWorkspace1', FabricEnvironmentName.PROD),
                createWorkspaceFolder('customEnvironmentMockWorkspace2'),
                createWorkspaceFolder('defaultEnvironmentMockWorkspace2', FabricEnvironmentName.PROD),
            ],
            artifacts: [],
        };
        await memento.update(settingsFabricWorkspace, settings);
        const storage = new FabricExtensionsSettingStorage(memento, new MockFabricEnvironmentProvider(), new MockConfigurationProvider());

        const loadResult: boolean = await storage.load();
        assert(loadResult, 'Settings load should have succeeded');
        assert.equal(storage.mostRecentWorkspace, 'customEnvironmentMockWorkspace2');
    });

    it('Checks that the fabric envs match when setting most recent workspace', async () => {
        const memento = new MockMemento();
        const settings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            loginState: false,
            workspaces: [
                createWorkspaceFolder('WorkspaceA', 'MOCK'),
                createWorkspaceFolder('WorkspaceB', 'MOCK'),
                createWorkspaceFolder('WorkspaceA', 'PROD'),
            ],
            artifacts: [],
        };
        await memento.update(settingsFabricWorkspace, settings);
        const storage = new FabricExtensionsSettingStorage(memento, new MockFabricEnvironmentProvider(), new MockConfigurationProvider());

        const loadResult: boolean = await storage.load();
        assert(loadResult, 'Settings load should have succeeded');

        // Previously, mostRecentWorkspace setter did not check the environment which sometimes resulted
        // in the workspace being left in the last array position but with the wrong environment
        // (in this test it would have left 'WorkspaceA, GLOBAL' instead of making 'WorkspaceA, MOCK' be the last element).
        storage.mostRecentWorkspace = 'WorkspaceA';

        // So, when mostRecentWorkspace getter was called at a later time, it would work backwards
        // from the end of the array to find the first workspace that matched the current environment.
        // (in this test it would have skipped 'WorkspaceA, GLOBAL' and selected 'WorkspaceB, MOCK')
        assert.equal(storage.mostRecentWorkspace, 'WorkspaceA');
        assert.equal(storage.settings.workspaces[2].workspaceId, 'WorkspaceA');
        assert.equal(storage.settings.workspaces[2].fabricEnv, 'MOCK');
    });

    it('Workspace filters are saved and loaded correctly', async () => {
        const memento = new MockMemento();
        const testWorkspaceFilters: { [key: string]: string[] } = {};
        testWorkspaceFilters['PROD:tenant-123'] = ['workspace-1', 'workspace-2'];
        testWorkspaceFilters['MOCK:tenant-456'] = ['workspace-3'];
        testWorkspaceFilters['DAILY:tenant-789'] = ['workspace-4', 'workspace-5', 'workspace-6'];
        
        const settings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            loginState: true,
            workspaces: [
                createWorkspaceFolder('workspace-1'),
                createWorkspaceFolder('workspace-2'),
            ],
            artifacts: [
                { artifactId: 'artifact-1' },
            ],
            displayStyle: 'TreeView',
            currentTenant: { 
                tenantId: 'tenant-123', 
                displayName: 'Test Tenant',
                defaultDomain: 'test.onmicrosoft.com'
            },
            workspaceFilters: testWorkspaceFilters
        };
        
        await memento.update(settingsFabricWorkspace, settings);
        const storage = new FabricExtensionsSettingStorage(memento, new MockFabricEnvironmentProvider(), new MockConfigurationProvider());

        // Test loading
        const loadResult: boolean = await storage.load();
        assert(loadResult, 'Settings load should have succeeded');
        
        // Verify workspace filters were loaded correctly
        assert.deepEqual(storage.settings.workspaceFilters, testWorkspaceFilters, 'Workspace filters should be loaded correctly');
        assert.deepEqual(storage.settings.workspaceFilters!['PROD:tenant-123'], ['workspace-1', 'workspace-2'], 'PROD environment filters should be correct');
        assert.deepEqual(storage.settings.workspaceFilters!['MOCK:tenant-456'], ['workspace-3'], 'MOCK environment filters should be correct');
        assert.deepEqual(storage.settings.workspaceFilters!['DAILY:tenant-789'], ['workspace-4', 'workspace-5', 'workspace-6'], 'DAILY environment filters should be correct');

        // Test modifying and saving workspace filters
        storage.settings.workspaceFilters!['PROD:tenant-123'] = ['workspace-1', 'workspace-7'];
        storage.settings.workspaceFilters!['TEST:tenant-999'] = ['workspace-8'];
        delete storage.settings.workspaceFilters!['MOCK:tenant-456'];

        await storage.save();
        
        // Verify the saved data
        const savedSettings: IFabricExtensionSettings | undefined = memento.get(settingsFabricWorkspace);
        assert(savedSettings, 'Settings should have been saved');
        assert(savedSettings.workspaceFilters, 'Workspace filters should be present in saved settings');
        
        const expectedFilters: { [key: string]: string[] } = {};
        expectedFilters['PROD:tenant-123'] = ['workspace-1', 'workspace-7'];
        expectedFilters['DAILY:tenant-789'] = ['workspace-4', 'workspace-5', 'workspace-6'];
        expectedFilters['TEST:tenant-999'] = ['workspace-8'];
        
        assert.deepEqual(savedSettings.workspaceFilters, expectedFilters, 'Modified workspace filters should be saved correctly');
        assert.equal(savedSettings.workspaceFilters!['MOCK:tenant-456'], undefined, 'Deleted filter should not exist in saved settings');
    });

    it('Workspace filters handle undefined and empty values correctly', async () => {
        const memento = new MockMemento();
        
        // Test with undefined workspaceFilters
        const settingsWithUndefinedFilters: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            workspaces: [],
            artifacts: [],
            workspaceFilters: undefined
        };
        
        await memento.update(settingsFabricWorkspace, settingsWithUndefinedFilters);
        const storage1 = new FabricExtensionsSettingStorage(memento, new MockFabricEnvironmentProvider(), new MockConfigurationProvider());
        
        const loadResult1: boolean = await storage1.load();
        assert(loadResult1, 'Settings load should have succeeded with undefined filters');
        assert.equal(storage1.settings.workspaceFilters, undefined, 'Workspace filters should remain undefined');
        
        // Test with empty workspaceFilters object
        const settingsWithEmptyFilters: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            workspaces: [],
            artifacts: [],
            workspaceFilters: {}
        };
        
        await memento.update(settingsFabricWorkspace, settingsWithEmptyFilters);
        const storage2 = new FabricExtensionsSettingStorage(memento, new MockFabricEnvironmentProvider(), new MockConfigurationProvider());
        
        const loadResult2: boolean = await storage2.load();
        assert(loadResult2, 'Settings load should have succeeded with empty filters');
        assert.deepEqual(storage2.settings.workspaceFilters, {}, 'Workspace filters should be empty object');
        
        // Test saving empty filters
        storage2.settings.workspaceFilters = {};
        await storage2.save();
        
        const savedSettings: IFabricExtensionSettings | undefined = memento.get(settingsFabricWorkspace);
        assert(savedSettings, 'Settings should have been saved');
        assert.deepEqual(savedSettings.workspaceFilters, {}, 'Empty workspace filters should be saved correctly');
    });

}); 
