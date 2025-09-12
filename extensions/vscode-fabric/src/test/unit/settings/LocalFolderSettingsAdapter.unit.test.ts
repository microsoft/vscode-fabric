import * as assert from 'assert';
import { IFabricExtensionSettings, IFabricExtensionsSettingStorage, IFabricWorkspaceSettings } from '../../../settings/definitions';
import { LocalFolderSettingsAdapter } from '../../../settings/LocalFolderSettingsAdapter';
import { FabricEnvironmentName } from '@microsoft/vscode-fabric-util';
import { MockFabricEnvironmentProvider } from '../general/serviceCollection';
import { Mock, Times } from 'moq.ts';

function createWorkspaceFolder(workspaceId: string, localFolder: string, fabricEnvironment?: string): IFabricWorkspaceSettings {
    return {
        workspaceId: workspaceId,
        fabricEnv: fabricEnvironment ?? FabricEnvironmentName.MOCK,
        localFolder: localFolder,
    };
}

describe('LocalFolderSettingsAdapter unit tests', () => {
    let storageMock: Mock<IFabricExtensionsSettingStorage>;
    let storage: IFabricExtensionsSettingStorage;

    beforeEach(() => {
        storageMock = new Mock<IFabricExtensionsSettingStorage>();
        let settings: IFabricExtensionSettings = {
            version: 1,
            workspaces: [],
            artifacts: [],
        };
        storageMock.setup(s => s.settings).returns(settings);
        storageMock.setup(s => s.save()).returns(Promise.resolve());
        storage = storageMock.object();
    });

    it('Contains artifact', async () => {
        const adapter = new LocalFolderSettingsAdapter(storage, new MockFabricEnvironmentProvider());

        // Everything is empty
        assert(!adapter.containsArtifact('artifact1'), 'artifact1 should NOT be found');

        // Contains some elements
        storage.settings.artifacts.push( { artifactId: 'artifact1', localFolder: 'artifact1LocalFolder' } );
        storage.settings.artifacts.push( { artifactId: 'artifact2', localFolder: 'artifact2LocalFolder' } );
        assert(adapter.containsArtifact('artifact1'), 'artifact1 should be found');
        assert(adapter.containsArtifact('artifact2'), 'artifact2 should be found');
        assert(!adapter.containsArtifact('artifact3'), 'artifact3 should NOT be found');

        // Flip the elements
        storage.settings.artifacts = [{ artifactId: 'artifact3', localFolder: 'artifact3LocalFolder' }];
        assert(!adapter.containsArtifact('artifact1'), 'artifact1 should NOT be found');
        assert(!adapter.containsArtifact('artifact2'), 'artifact2 should NOT be found');
        assert(adapter.containsArtifact('artifact3'), 'artifact3 should be found');
    });

    it('Contains workspace', async () => {
        const adapter = new LocalFolderSettingsAdapter(storage, new MockFabricEnvironmentProvider());

        // Everything is empty
        assert(!adapter.containsWorkspace('workspace1'), 'workspace1 should NOT be found');

        // Contains some elements
        storage.settings.workspaces.push(createWorkspaceFolder('workspace1', 'workspace1LocalFolder'));
        storage.settings.workspaces.push(createWorkspaceFolder('workspace2', 'workspace2LocalFolder'));
        assert(adapter.containsWorkspace('workspace1'), 'workspace1 should be found');
        assert(adapter.containsWorkspace('workspace2'), 'workspace2 should be found');
        assert(!adapter.containsWorkspace('workspace3'), 'workspace3 should NOT be found');

        // Flip the elements
        storage.settings.workspaces = [createWorkspaceFolder('workspace3', 'workspace3LocalFolder')];
        assert(!adapter.containsWorkspace('workspace1'), 'workspace1 should NOT be found');
        assert(!adapter.containsWorkspace('workspace2'), 'workspace2 should NOT be found');
        assert(adapter.containsWorkspace('workspace3'), 'workspace3 should be found');
    });

    it('Get artifact', async () => {
        const adapter = new LocalFolderSettingsAdapter(storage, new MockFabricEnvironmentProvider());

        // Contains some elements
        storage.settings.artifacts.push( { artifactId: 'artifact1', localFolder: 'artifact1LocalFolder' } );
        storage.settings.artifacts.push( { artifactId: 'artifact2', localFolder: 'artifact2LocalFolder' } );

        let retrievedValue: string | undefined = adapter.getArtifactFolder('artifact1');
        assert(!!retrievedValue, 'artifact1 should be found');
        assert.equal(retrievedValue, 'artifact1LocalFolder', 'getArtifact for artifact1');

        retrievedValue = adapter.getArtifactFolder('artifact_dne');
        assert(!retrievedValue, 'artifact_dne should NOT be found');
    });

    it('Get workspace', async () => {
        const adapter = new LocalFolderSettingsAdapter(storage, new MockFabricEnvironmentProvider());

        // Contains some elements
        storage.settings.workspaces.push(createWorkspaceFolder('workspace1', 'workspace1LocalFolder'));
        storage.settings.workspaces.push(createWorkspaceFolder('workspace2', 'workspace2LocalFolder'));

        let retrievedValue: string | undefined = adapter.getWorkspaceFolder('workspace1');
        assert(!!retrievedValue, 'workspace1 should be found');
        assert.equal(retrievedValue, 'workspace1LocalFolder', 'getWorkspace for workspace1');

        retrievedValue = adapter.getWorkspaceFolder('workspace_dne');
        assert(!retrievedValue, 'workspace_dne should NOT be found');
    });

    it('Set artifact', async () => {
        const adapter = new LocalFolderSettingsAdapter(storage, new MockFabricEnvironmentProvider());

        // Contains one elements
        storage.settings.artifacts.push( { artifactId: 'artifact1', localFolder: 'artifact1LocalFolder' } );

        await adapter.setArtifactFolder('artifact2', 'artifact2LocalFolder');
        await adapter.setArtifactFolder('artifact1', 'artifact1LocalFolder_renamed');

        assert.equal(storage.settings.artifacts.length, 2, 'Artifact folder count');
        assert.equal(storage.settings.artifacts[0].artifactId, 'artifact1', 'First artifact id');
        assert.equal(storage.settings.artifacts[0].localFolder, 'artifact1LocalFolder_renamed', 'First artifact local folder');
        assert.equal(storage.settings.artifacts[1].artifactId, 'artifact2', 'Second artifact id');
        assert.equal(storage.settings.artifacts[1].localFolder, 'artifact2LocalFolder', 'Second artifact local folder');
        assert(storageMock.verify(s => s.save(), Times.Exactly(2)), 'Values should be saved to storage');
    });

    it('Set workspace', async () => {
        const adapter = new LocalFolderSettingsAdapter(storage, new MockFabricEnvironmentProvider());

        // Contains one elements
        storage.settings.workspaces.push(createWorkspaceFolder('workspace1', 'workspace1LocalFolder'));

        await adapter.setWorkspaceFolder('workspace2', 'workspace2LocalFolder');
        await adapter.setWorkspaceFolder('workspace1', 'workspace1LocalFolder_renamed');

        assert.equal(storage.settings.workspaces.length, 2, 'Workspace folder count');
        assert.equal(storage.settings.workspaces[0].workspaceId, 'workspace1', 'First workspace id');
        assert.equal(storage.settings.workspaces[0].localFolder, 'workspace1LocalFolder_renamed', 'First workspace local folder');
        assert.equal(storage.settings.workspaces[1].workspaceId, 'workspace2', 'Second workspace id');
        assert.equal(storage.settings.workspaces[1].localFolder, 'workspace2LocalFolder', 'Second workspace local folder');
        assert(storageMock.verify(s => s.save(), Times.Exactly(2)), 'Values should be saved to storage');
    });

    it('getWorkspaceFromFolder returns correct workspaceId for exact match', () => {
        const adapter = new LocalFolderSettingsAdapter(storage, new MockFabricEnvironmentProvider());
        storage.settings.workspaces.push(createWorkspaceFolder('ws1', '/path/to/local/folder/ws1'));
        storage.settings.workspaces.push(createWorkspaceFolder('ws2', '/path/to/local/folder/ws2'));

        const result1 = adapter.getWorkspaceFromFolder('/path/to/local/folder/ws1');
        assert.equal(result1, 'ws1', 'Should return ws1 for matching folder');

        const result2 = adapter.getWorkspaceFromFolder('/path/to/local/folder/ws2');
        assert.equal(result2, 'ws2', 'Should return ws2 for matching folder');
    });

    it('getWorkspaceFromFolder returns undefined for non-existent folder', () => {
        const adapter = new LocalFolderSettingsAdapter(storage, new MockFabricEnvironmentProvider());
        storage.settings.workspaces.push(createWorkspaceFolder('ws1', '/path/to/local/folder/ws1'));

        const result = adapter.getWorkspaceFromFolder('/path/to/local/folder/ws3');
        assert.equal(result, undefined, 'Should return undefined for non-existent folder');
    });

    it('getWorkspaceFromFolder is case-insensitive and trims whitespace', () => {
        const adapter = new LocalFolderSettingsAdapter(storage, new MockFabricEnvironmentProvider());
        storage.settings.workspaces.push(createWorkspaceFolder('ws1', '/path/to/local/folder/ws1'));

        const result = adapter.getWorkspaceFromFolder('  /PATH/TO/LOCAL/FOLDER/ws1  ');
        assert.equal(result, 'ws1', 'Should match folder ignoring case and whitespace');
    });

});
