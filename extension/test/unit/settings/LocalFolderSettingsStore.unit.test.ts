// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import { IFabricExtensionSettings, IFabricExtensionsSettingStorage } from '../../../src/settings/definitions';
import { LocalFolderSettingsStore } from '../../../src/settings/LocalFolderSettingsStore';
import { Mock, Times } from 'moq.ts';

describe('LocalFolderSettingsStore unit tests', () => {
    let storageMock: Mock<IFabricExtensionsSettingStorage>;
    let storage: IFabricExtensionsSettingStorage;
    let store: LocalFolderSettingsStore;

    beforeEach(() => {
        storageMock = new Mock<IFabricExtensionsSettingStorage>();
        let settings: IFabricExtensionSettings = {
            version: 1,
            workspaces: [],
            artifacts: [],
            localFolders: [],
        };
        storageMock.setup(s => s.settings).returns(settings);
        storageMock.setup(s => s.save()).returns(Promise.resolve());
        storage = storageMock.object();
        store = new LocalFolderSettingsStore(storage);
    });

    describe('getLocalFolder', () => {
        it('should return undefined when artifacts array is empty', () => {
            const result = store.getLocalFolder('artifact1');
            assert.strictEqual(result, undefined);
        });

        it('should return undefined when artifacts array is undefined', () => {
            storage.settings.localFolders = undefined as any;
            const result = store.getLocalFolder('artifact1');
            assert.strictEqual(result, undefined);
        });

        it('should return undefined when artifact is not found', () => {
            storage.settings.localFolders?.push({ artifactId: 'artifact1', localFolder: 'path1', workspaceId: 'workspace-id' });
            storage.settings.localFolders?.push({ artifactId: 'artifact2', localFolder: 'path2', workspaceId: 'workspace-id' });

            const result = store.getLocalFolder('artifact3');
            assert.strictEqual(result, undefined);
        });

        it('should return local folder when artifact is found', () => {
            storage.settings.localFolders?.push({ artifactId: 'artifact1', localFolder: 'path1', workspaceId: 'workspace-id' });
            storage.settings.localFolders?.push({ artifactId: 'artifact2', localFolder: 'path2', workspaceId: 'workspace-id' });

            const result = store.getLocalFolder('artifact1');
            assert.strictEqual(result, 'path1');
        });

        it('should return local folder for exact artifact ID match', () => {
            storage.settings.localFolders?.push({ artifactId: 'artifact1', localFolder: 'path1', workspaceId: 'workspace-id' });
            storage.settings.localFolders?.push({ artifactId: 'artifact11', localFolder: 'path11', workspaceId: 'workspace-id' });

            const result = store.getLocalFolder('artifact1');
            assert.strictEqual(result, 'path1');
        });
    });

    describe('setLocalFolder', () => {
        it('should initialize artifacts array if undefined', async () => {
            storage.settings.localFolders = undefined as any;

            await store.setLocalFolder('artifact1', 'path1', 'workspace-id');

            assert.ok(Array.isArray(storage.settings.localFolders));
            assert.strictEqual(storage.settings.localFolders.length, 1);
            assert.strictEqual(storage.settings.localFolders[0].artifactId, 'artifact1');
            assert.strictEqual(storage.settings.localFolders[0].localFolder, 'path1');
            storageMock.verify(s => s.save(), Times.Once());
        });

        it('should add new artifact when not exists', async () => {
            await store.setLocalFolder('artifact1', 'path1', 'workspace-id');

            assert.ok(storage.settings.localFolders, 'localFolders should be defined');
            assert.strictEqual(storage.settings.localFolders.length, 1);
            assert.strictEqual(storage.settings.localFolders[0].artifactId, 'artifact1');
            assert.strictEqual(storage.settings.localFolders[0].localFolder, 'path1');
            storageMock.verify(s => s.save(), Times.Once());
        });

        it('should update existing artifact when already exists', async () => {
            storage.settings.localFolders?.push({ artifactId: 'artifact1', localFolder: 'oldPath', workspaceId: 'workspace-id' });
            storage.settings.localFolders?.push({ artifactId: 'artifact2', localFolder: 'path2', workspaceId: 'workspace-id' });

            await store.setLocalFolder('artifact1', 'newPath', 'workspace-id');

            assert.ok(storage.settings.localFolders, 'localFolders should be defined');
            assert.strictEqual(storage.settings.localFolders.length, 2);
            assert.strictEqual(storage.settings.localFolders[0].artifactId, 'artifact1');
            assert.strictEqual(storage.settings.localFolders[0].localFolder, 'newPath');
            assert.strictEqual(storage.settings.localFolders[1].artifactId, 'artifact2');
            assert.strictEqual(storage.settings.localFolders[1].localFolder, 'path2');
            storageMock.verify(s => s.save(), Times.Once());
        });

        it('should add multiple artifacts correctly', async () => {
            await store.setLocalFolder('artifact1', 'path1', 'workspace-id');
            await store.setLocalFolder('artifact2', 'path2', 'workspace-id');
            await store.setLocalFolder('artifact3', 'path3', 'workspace-id');

            assert.ok(storage.settings.localFolders, 'localFolders should be defined');
            assert.strictEqual(storage.settings.localFolders.length, 3);

            const artifact1 = storage.settings.localFolders.find(a => a.artifactId === 'artifact1');
            const artifact2 = storage.settings.localFolders.find(a => a.artifactId === 'artifact2');
            const artifact3 = storage.settings.localFolders.find(a => a.artifactId === 'artifact3');

            assert.strictEqual(artifact1?.localFolder, 'path1');
            assert.strictEqual(artifact2?.localFolder, 'path2');
            assert.strictEqual(artifact3?.localFolder, 'path3');
            storageMock.verify(s => s.save(), Times.Exactly(3));
        });

        it('should update artifact with empty string path', async () => {
            storage.settings.localFolders?.push({ artifactId: 'artifact1', localFolder: 'oldPath', workspaceId: 'workspace-id' });

            await store.setLocalFolder('artifact1', '', 'workspace-id');

            assert.ok(storage.settings.localFolders, 'localFolders should be defined');
            assert.strictEqual(storage.settings.localFolders.length, 1);
            assert.strictEqual(storage.settings.localFolders[0].localFolder, '');
            storageMock.verify(s => s.save(), Times.Once());
        });

        it('should handle special characters in artifact ID and path', async () => {
            const specialArtifactId = 'artifact-123_test!@#';
            const specialPath = 'C:\\Users\\Test User\\Documents\\My Folder (1)';

            await store.setLocalFolder(specialArtifactId, specialPath, 'workspace-id');

            assert.ok(storage.settings.localFolders, 'localFolders should be defined');
            assert.strictEqual(storage.settings.localFolders.length, 1);
            assert.strictEqual(storage.settings.localFolders[0].artifactId, specialArtifactId);
            assert.strictEqual(storage.settings.localFolders[0].localFolder, specialPath);
            storageMock.verify(s => s.save(), Times.Once());
        });

        it('should preserve other artifact properties when updating', async () => {
            // Add an artifact with additional properties (as might exist in the interface)
            storage.settings.localFolders?.push({ 
                artifactId: 'artifact1', 
                localFolder: 'oldPath',
                // Simulating any other properties that might exist
                ...({ extraProperty: 'extraValue' } as any)
            });

            await store.setLocalFolder('artifact1', 'newPath', 'workspace-id');

            assert.ok(storage.settings.localFolders, 'localFolders should be defined');
            assert.strictEqual(storage.settings.localFolders.length, 1);
            assert.strictEqual(storage.settings.localFolders[0].artifactId, 'artifact1');
            assert.strictEqual(storage.settings.localFolders[0].localFolder, 'newPath');
            assert.strictEqual((storage.settings.localFolders[0] as any).extraProperty, 'extraValue');
            storageMock.verify(s => s.save(), Times.Once());
        });
    });

    describe('integration scenarios', () => {
        it('should handle get after set correctly', async () => {
            // Set a value
            await store.setLocalFolder('artifact1', 'testPath', 'workspace-id');

            // Get the value back
            const result = store.getLocalFolder('artifact1');
            assert.strictEqual(result, 'testPath');
        });

        it('should handle multiple set operations on same artifact', async () => {
            await store.setLocalFolder('artifact1', 'path1', 'workspace-id');
            await store.setLocalFolder('artifact1', 'path2', 'workspace-id');
            await store.setLocalFolder('artifact1', 'path3', 'workspace-id');

            const result = store.getLocalFolder('artifact1');
            assert.strictEqual(result, 'path3');
            assert.ok(storage.settings.localFolders, 'localFolders should be defined');
            assert.strictEqual(storage.settings.localFolders.length, 1);
            storageMock.verify(s => s.save(), Times.Exactly(3));
        });

        it('should handle mixed operations correctly', async () => {
            // Add some initial data
            await store.setLocalFolder('artifact1', 'path1', 'workspace-id');
            await store.setLocalFolder('artifact2', 'path2', 'workspace-id');

            // Verify initial state
            assert.strictEqual(store.getLocalFolder('artifact1'), 'path1');
            assert.strictEqual(store.getLocalFolder('artifact2'), 'path2');
            assert.strictEqual(store.getLocalFolder('artifact3'), undefined);

            // Update existing and add new
            await store.setLocalFolder('artifact1', 'newPath1', 'workspace-id');
            await store.setLocalFolder('artifact3', 'path3', 'workspace-id');

            // Verify final state
            assert.strictEqual(store.getLocalFolder('artifact1'), 'newPath1');
            assert.strictEqual(store.getLocalFolder('artifact2'), 'path2');
            assert.strictEqual(store.getLocalFolder('artifact3'), 'path3');
            assert.ok(storage.settings.localFolders, 'localFolders should be defined');
            assert.strictEqual(storage.settings.localFolders.length, 3);
        });
    });
});
