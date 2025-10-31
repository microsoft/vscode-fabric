// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Mock, Times, It } from 'moq.ts';

import { LocalFolderService, LocalFolderPromptMode, LocalFolderGetOptions } from '../../../src/LocalFolderService';
import { IFabricExtensionSettings, IFabricExtensionsSettingStorage, ILocalFolderSettingsStore } from '../../../src/settings/definitions';
import { IArtifact } from '@microsoft/vscode-fabric-api';
import { MockFabricEnvironmentProvider } from './serviceCollection';

describe('LocalFolderService unit tests', () => {
    let storageMock: Mock<IFabricExtensionsSettingStorage>;
    let storage: IFabricExtensionsSettingStorage;
    let settingsStoreMock: Mock<ILocalFolderSettingsStore>;
    let settingsStore: ILocalFolderSettingsStore;
    let fileSystemMock: Mock<vscode.FileSystem>;
    let fileSystem: vscode.FileSystem;
    let service: LocalFolderService;
    let showOpenDialogStub: sinon.SinonStub;

    const mockArtifact: IArtifact = {
        id: 'artifact-123',
        type: 'Notebook',
        displayName: 'MyNotebook',
        description: 'Test notebook',
        workspaceId: 'workspace-456',
        fabricEnvironment: 'MOCK',
    };

    const testFolderPath = '/test/folder/path';
    const testFolderUri = vscode.Uri.file(testFolderPath);

    beforeEach(() => {
        // Setup storage mock
        storageMock = new Mock<IFabricExtensionsSettingStorage>();
        let settings: IFabricExtensionSettings = {
            version: 1,
            workspaces: [],
            artifacts: [],
        };
        storageMock.setup(s => s.settings).returns(settings);
        storageMock.setup(s => s.save()).returns(Promise.resolve());
        storage = storageMock.object();

        // Setup settings store mock
        settingsStoreMock = new Mock<ILocalFolderSettingsStore>();
        settingsStore = settingsStoreMock.object();

        // Setup file system mock
        fileSystemMock = new Mock<vscode.FileSystem>();
        fileSystem = fileSystemMock.object();

        // Create service with mocked dependencies
        service = new LocalFolderService(storage, new MockFabricEnvironmentProvider(), fileSystem);
        (service as any).settingsStore = settingsStore;

        // Setup VS Code API stubs
        showOpenDialogStub = sinon.stub(vscode.window, 'showOpenDialog');
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('getLocalFolder', () => {
        describe('when existing path is found', () => {
            it('should return existing path without prompting when prompt mode is discretionary', async () => {
                settingsStoreMock.setup(s => s.getLocalFolder(mockArtifact.id)).returns(testFolderPath);

                const result = await service.getLocalFolder(mockArtifact, { prompt: LocalFolderPromptMode.discretionary });

                assert.ok(result);
                assert.strictEqual(result.uri.fsPath, testFolderUri.fsPath);
                assert.strictEqual(result.prompted, false);
                assert.strictEqual(result.created, false);
                assert.ok(showOpenDialogStub.notCalled, 'showOpenDialog should not be called');
                settingsStoreMock.verify(s => s.setLocalFolder(It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
                settingsStoreMock.verify(s => s.setLocalFolder(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
            });

            it('should return existing path without prompting when prompt mode is never', async () => {
                settingsStoreMock.setup(s => s.getLocalFolder(mockArtifact.id)).returns(testFolderPath);

                const result = await service.getLocalFolder(mockArtifact, { prompt: LocalFolderPromptMode.never });

                assert.ok(result);
                assert.strictEqual(result.uri.fsPath, testFolderUri.fsPath);
                assert.strictEqual(result.prompted, false);
                assert.strictEqual(result.created, false);
                assert.ok(showOpenDialogStub.notCalled, 'showOpenDialog should not be called');
            });

            it('should show prompt with existing path as default when prompt mode is always', async () => {
                const selectedUri = vscode.Uri.file('/new/selected/path');
                const expectedArtifactUri = vscode.Uri.joinPath(selectedUri, `${mockArtifact.displayName}.${mockArtifact.type}`);

                settingsStoreMock.setup(s => s.getLocalFolder(mockArtifact.id)).returns(testFolderPath);

                showOpenDialogStub.callsFake((options: vscode.OpenDialogOptions) => {
                    assert.ok(options.defaultUri);
                    // Should use parent folder of existing path as default
                    const expectedParentPath = vscode.Uri.joinPath(testFolderUri, '..').fsPath;
                    assert.strictEqual(options.defaultUri.fsPath, expectedParentPath);
                    return Promise.resolve([selectedUri]);
                });

                const result = await service.getLocalFolder(mockArtifact, { prompt: LocalFolderPromptMode.always });

                assert.ok(result);
                assert.strictEqual(result.uri.fsPath, expectedArtifactUri.fsPath);
                assert.strictEqual(result.prompted, true);
                assert.strictEqual(result.created, false);
                assert.ok(showOpenDialogStub.calledOnce, 'showOpenDialog should be called once');
            });
        });

        describe('when no existing path is found', () => {
            it('should return undefined when prompt mode is never', async () => {
                settingsStoreMock.setup(s => s.getLocalFolder(mockArtifact.id)).returns(undefined);

                const result = await service.getLocalFolder(mockArtifact, { prompt: LocalFolderPromptMode.never });

                assert.strictEqual(result, undefined);
                assert.ok(showOpenDialogStub.notCalled, 'showOpenDialog should not be called');
            });

            it('should show prompt without default URI when prompt mode is discretionary', async () => {
                const selectedUri = vscode.Uri.file('/selected/path');
                const expectedArtifactUri = vscode.Uri.joinPath(selectedUri, `${mockArtifact.displayName}.${mockArtifact.type}`);

                settingsStoreMock.setup(s => s.getLocalFolder(mockArtifact.id)).returns(undefined);

                showOpenDialogStub.callsFake((options: vscode.OpenDialogOptions) => {
                    assert.strictEqual(options.defaultUri, undefined);
                    assert.strictEqual(options.canSelectFiles, false);
                    assert.strictEqual(options.canSelectFolders, true);
                    assert.strictEqual(options.canSelectMany, false);
                    return Promise.resolve([selectedUri]);
                });

                const result = await service.getLocalFolder(mockArtifact, { prompt: LocalFolderPromptMode.discretionary });

                assert.ok(result);
                assert.strictEqual(result.uri.fsPath, expectedArtifactUri.fsPath);
                assert.strictEqual(result.prompted, true);
                assert.strictEqual(result.created, false);
                assert.ok(showOpenDialogStub.calledOnce, 'showOpenDialog should be called once');
            });

            it('should return undefined when user cancels dialog', async () => {
                settingsStoreMock.setup(s => s.getLocalFolder(mockArtifact.id)).returns(undefined);
                showOpenDialogStub.resolves(undefined);

                const result = await service.getLocalFolder(mockArtifact, { prompt: LocalFolderPromptMode.discretionary });

                assert.strictEqual(result, undefined);
                assert.ok(showOpenDialogStub.calledOnce, 'showOpenDialog should be called once');
                settingsStoreMock.verify(s => s.setLocalFolder(It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
                settingsStoreMock.verify(s => s.setLocalFolder(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
            });

            it('should return undefined when user selects empty array', async () => {
                settingsStoreMock.setup(s => s.getLocalFolder(mockArtifact.id)).returns(undefined);
                showOpenDialogStub.resolves([]);

                const result = await service.getLocalFolder(mockArtifact, { prompt: LocalFolderPromptMode.discretionary });

                assert.strictEqual(result, undefined);
                assert.ok(showOpenDialogStub.calledOnce, 'showOpenDialog should be called once');
                settingsStoreMock.verify(s => s.setLocalFolder(It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
                settingsStoreMock.verify(s => s.setLocalFolder(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
            });
        });

        describe('default options behavior', () => {
            it('should use discretionary prompt mode by default', async () => {
                settingsStoreMock.setup(s => s.getLocalFolder(mockArtifact.id)).returns(testFolderPath);

                const result = await service.getLocalFolder(mockArtifact);

                assert.ok(result);
                assert.strictEqual(result.uri.fsPath, testFolderUri.fsPath);
                assert.strictEqual(result.prompted, false);
                assert.ok(showOpenDialogStub.notCalled, 'showOpenDialog should not be called');
            });

            it('should not create folder by default', async () => {
                settingsStoreMock.setup(s => s.getLocalFolder(mockArtifact.id)).returns(testFolderPath);

                const result = await service.getLocalFolder(mockArtifact);

                assert.ok(result);
                assert.strictEqual(result.created, false);
                fileSystemMock.verify(fs => fs.stat(It.IsAny()), Times.Never());
                fileSystemMock.verify(fs => fs.createDirectory(It.IsAny()), Times.Never());
            });
        });

        describe('folder creation', () => {
            it('should not create folder when create option is false', async () => {
                settingsStoreMock.setup(s => s.getLocalFolder(mockArtifact.id)).returns(testFolderPath);

                const result = await service.getLocalFolder(mockArtifact, { create: false });

                assert.ok(result);
                assert.strictEqual(result.created, false);
                fileSystemMock.verify(fs => fs.stat(It.IsAny()), Times.Never());
                fileSystemMock.verify(fs => fs.createDirectory(It.IsAny()), Times.Never());
            });

            it('should not create folder when it already exists', async () => {
                const existingPath = testFolderPath;

                settingsStoreMock.setup(s => s.getLocalFolder(mockArtifact.id)).returns(existingPath);
                fileSystemMock.setup(fs => fs.stat(It.IsAny())).returns(Promise.resolve({ type: vscode.FileType.Directory } as vscode.FileStat));

                const result = await service.getLocalFolder(mockArtifact, { create: true });

                assert.ok(result);
                assert.strictEqual(result.created, false);
                fileSystemMock.verify(fs => fs.stat(It.IsAny()), Times.Once());
                fileSystemMock.verify(fs => fs.createDirectory(It.IsAny()), Times.Never());
            });

            it('should create folder when it does not exist and create option is true', async () => {
                const existingPath = testFolderPath;

                settingsStoreMock.setup(s => s.getLocalFolder(mockArtifact.id)).returns(existingPath);
                fileSystemMock.setup(fs => fs.stat(It.IsAny())).returns(Promise.reject(new Error('File not found')));
                fileSystemMock.setup(fs => fs.createDirectory(It.IsAny())).returns(Promise.resolve());

                const result = await service.getLocalFolder(mockArtifact, { create: true });

                assert.ok(result);
                assert.strictEqual(result.created, true);
                fileSystemMock.verify(fs => fs.stat(It.IsAny()), Times.Once());
                fileSystemMock.verify(fs => fs.createDirectory(It.IsAny()), Times.Once());
            });

            it('should throw error when folder creation fails', async () => {
                const createError = new Error('Permission denied');
                const existingPath = testFolderPath;

                settingsStoreMock.setup(s => s.getLocalFolder(mockArtifact.id)).returns(existingPath);
                fileSystemMock.setup(fs => fs.stat(It.IsAny())).returns(Promise.reject(new Error('File not found')));
                fileSystemMock.setup(fs => fs.createDirectory(It.IsAny())).returns(Promise.reject(createError));

                await assert.rejects(
                    () => service.getLocalFolder(mockArtifact, { create: true }),
                    /Unable to create folder/
                );

                fileSystemMock.verify(fs => fs.stat(It.IsAny()), Times.Once());
                fileSystemMock.verify(fs => fs.createDirectory(It.IsAny()), Times.Once());
            });
        });

        describe('path construction', () => {
            it('should construct artifact folder path correctly', async () => {
                const selectedUri = vscode.Uri.file('/base/folder');
                const expectedPath = vscode.Uri.joinPath(selectedUri, `${mockArtifact.displayName}.${mockArtifact.type}`);

                settingsStoreMock.setup(s => s.getLocalFolder(mockArtifact.id)).returns(undefined);
                showOpenDialogStub.resolves([selectedUri]);

                const result = await service.getLocalFolder(mockArtifact, { prompt: LocalFolderPromptMode.discretionary });

                assert.ok(result);
                assert.strictEqual(result.uri.fsPath, expectedPath.fsPath);
            });

            it('should handle special characters in artifact name and type', async () => {
                const specialArtifact: IArtifact = {
                    ...mockArtifact,
                    displayName: 'My Special Artifact (v2)',
                    type: 'Custom-Type',
                };
                const selectedUri = vscode.Uri.file('/base/folder');
                const expectedPath = vscode.Uri.joinPath(selectedUri, `${specialArtifact.displayName}.${specialArtifact.type}`);

                settingsStoreMock.setup(s => s.getLocalFolder(specialArtifact.id)).returns(undefined);
                settingsStoreMock.setup(s => s.setLocalFolder(specialArtifact.id, expectedPath.fsPath, specialArtifact.workspaceId)).returns(Promise.resolve());
                showOpenDialogStub.resolves([selectedUri]);

                const result = await service.getLocalFolder(specialArtifact, { prompt: LocalFolderPromptMode.discretionary });

                assert.ok(result);
                assert.strictEqual(result.uri.fsPath, expectedPath.fsPath);
            });
        });
    });

    describe('updateLocalFolder', () => {
        it('should update local folder in settings store', async () => {
            const newFolderUri = vscode.Uri.file('/new/folder/path');
            settingsStoreMock.setup(s => s.setLocalFolder(mockArtifact.id, newFolderUri.fsPath, mockArtifact.workspaceId, mockArtifact.fabricEnvironment)).returns(Promise.resolve());

            await service.updateLocalFolder(mockArtifact, newFolderUri);

            settingsStoreMock.verify(s => s.setLocalFolder(mockArtifact.id, newFolderUri.fsPath, mockArtifact.workspaceId, mockArtifact.fabricEnvironment), Times.Once());
        });

        it('should handle error from settings store', async () => {
            const newFolderUri = vscode.Uri.file('/new/folder/path');
            const storeError = new Error('Storage error');
            settingsStoreMock.setup(s => s.setLocalFolder(mockArtifact.id, newFolderUri.fsPath, mockArtifact.workspaceId, mockArtifact.fabricEnvironment)).returns(Promise.reject(storeError));

            await assert.rejects(
                () => service.updateLocalFolder(mockArtifact, newFolderUri),
                storeError
            );
        });

        it('should update with Windows path format', async () => {
            const windowsFolderUri = vscode.Uri.file('C:\\Users\\Test\\Documents\\Fabric');
            settingsStoreMock.setup(s => s.setLocalFolder(mockArtifact.id, windowsFolderUri.fsPath, mockArtifact.workspaceId, mockArtifact.fabricEnvironment)).returns(Promise.resolve());

            await service.updateLocalFolder(mockArtifact, windowsFolderUri);

            settingsStoreMock.verify(s => s.setLocalFolder(mockArtifact.id, windowsFolderUri.fsPath, mockArtifact.workspaceId, mockArtifact.fabricEnvironment), Times.Once());
        });
    });

    describe('integration scenarios', () => {
        it('should work with real LocalFolderSettingsStore', async () => {
            // Create a service with real settings store for integration testing
            const realService = new LocalFolderService(storage, new MockFabricEnvironmentProvider(), vscode.workspace.fs);
            const selectedUri = vscode.Uri.file('/integration/test/path');
            const expectedArtifactUri = vscode.Uri.joinPath(selectedUri, `${mockArtifact.displayName}.${mockArtifact.type}`);

            showOpenDialogStub.resolves([selectedUri]);

            const result = await realService.getLocalFolder(mockArtifact, { prompt: LocalFolderPromptMode.discretionary });

            assert.ok(result);
            assert.strictEqual(result.uri.fsPath, expectedArtifactUri.fsPath);
            assert.strictEqual(result.prompted, true);

            await realService.updateLocalFolder(mockArtifact, result.uri);

            // Verify it was saved by getting it again without prompting
            const secondResult = await realService.getLocalFolder(mockArtifact, { prompt: LocalFolderPromptMode.never });
            assert.ok(secondResult);
            assert.strictEqual(secondResult.uri.fsPath, expectedArtifactUri.fsPath);
            assert.strictEqual(secondResult.prompted, false);
        });

        it('should handle update then get scenario', async () => {
            const realService = new LocalFolderService(storage, new MockFabricEnvironmentProvider(), vscode.workspace.fs);
            const updateUri = vscode.Uri.file('/updated/path');

            await realService.updateLocalFolder(mockArtifact, updateUri);

            const result = await realService.getLocalFolder(mockArtifact, { prompt: LocalFolderPromptMode.never });

            assert.ok(result);
            assert.strictEqual(result.uri.fsPath, updateUri.fsPath);
            assert.strictEqual(result.prompted, false);
        });
    });

    describe('dialog options validation', () => {
        it('should pass correct options to showOpenDialog', async () => {
            settingsStoreMock.setup(s => s.getLocalFolder(mockArtifact.id)).returns(undefined);

            showOpenDialogStub.callsFake((options: vscode.OpenDialogOptions) => {
                assert.strictEqual(options.canSelectFiles, false, 'canSelectFiles should be false');
                assert.strictEqual(options.canSelectFolders, true, 'canSelectFolders should be true');
                assert.strictEqual(options.canSelectMany, false, 'canSelectMany should be false');
                assert.ok(options.openLabel, 'openLabel should be set');
                assert.ok(options.title, 'title should be set');
                assert.ok(options.title.includes(mockArtifact.displayName), 'title should include artifact name');
                return Promise.resolve([]);
            });

            await service.getLocalFolder(mockArtifact, { prompt: LocalFolderPromptMode.discretionary });

            assert.ok(showOpenDialogStub.calledOnce, 'showOpenDialog should be called once');
        });
    });
});
