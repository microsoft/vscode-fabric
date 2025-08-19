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

        storage.settings.artifacts = [ { artifactId: 'mockArtifact1'}, { artifactId: 'mockArtifact2'} ];
        storage.settings.workspaces = [ createWorkspaceFolder('mockWorkspace1'), createWorkspaceFolder('mockWorkspace2'), ];

        await storage.save();
        const savedSettings: IFabricExtensionSettings | undefined= memento.get(settingsFabricWorkspace);
        assert(savedSettings, 'Settings should have been saved');
        const expectedSettings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            artifacts: [ 
                { artifactId: 'mockArtifact1'}, 
                { artifactId: 'mockArtifact2'}, 
            ],
            workspaces: [
                createWorkspaceFolder('mockWorkspace1'),
                createWorkspaceFolder('mockWorkspace2'),
            ],
            loginState: undefined,
            displayStyle: undefined,
            currentTenant: undefined,
        };
        assert.deepEqual(savedSettings, expectedSettings, 'Saved settings');

    });

    it('Initial recent workspace is saved correctly', async () => {
        const memento = new MockMemento();
        const settings: IFabricExtensionSettings = {
            version: fabricWorkspaceSettingsVersion,
            loginState: false,
            workspaces: [],
            artifacts: []
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
            ]
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
            ]
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
            ]
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
            artifacts: []
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
            artifacts: []
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

}); 

