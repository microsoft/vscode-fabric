// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import { IArtifactManager, IArtifact } from '@microsoft/vscode-fabric-api';
import { FabricError, TelemetryActivity, UserCancelledError, IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { exportArtifactCommand, showCompletionMessage } from '../../../src/artifactManager/exportArtifactCommand';
import * as artifactOperations from '../../../src/artifactManager/localFolderCommandHelpers';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { IItemDefinitionConflictDetector } from '../../../src/itemDefinition/ItemDefinitionConflictDetector';
import { IItemDefinitionWriter } from '../../../src/itemDefinition/ItemDefinitionWriter';
import { ILocalFolderService, LocalFolderService } from '../../../src/LocalFolderService';
import { IFabricExtensionsSettingStorage } from '../../../src/settings/definitions';
import { MockFabricEnvironmentProvider } from '../general/serviceCollection';

const artifactDisplayName = 'Test Artifact';
const artifactId = 'Test Artifact Id';

describe('exportArtifactCommand', () => {
    const localFolder = vscode.Uri.file('/path/to/local/folder');

    let artifactManagerMock: Mock<IArtifactManager>;
    let artifactMock: Mock<IArtifact>;
    let localFolderServiceMock: Mock<ILocalFolderService>;
    let configurationProviderMock: Mock<IConfigurationProvider>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
    let conflictDetectorMock: Mock<IItemDefinitionConflictDetector>;
    let itemDefinitionWriterMock: Mock<IItemDefinitionWriter>;

    let downloadAndSaveArtifactStub: sinon.SinonStub;
    let showFolderActionAndSavePreferenceStub: sinon.SinonStub;

    beforeEach(() => {
        artifactManagerMock = new Mock<IArtifactManager>();
        artifactMock = new Mock<IArtifact>();
        localFolderServiceMock = new Mock<ILocalFolderService>();
        configurationProviderMock = new Mock<IConfigurationProvider>();
        conflictDetectorMock = new Mock<IItemDefinitionConflictDetector>();
        itemDefinitionWriterMock = new Mock<IItemDefinitionWriter>();

        artifactMock.setup(a => a.id).returns(artifactId);
        artifactMock.setup(a => a.displayName).returns(artifactDisplayName);

        localFolderServiceMock
            .setup(l => l.getLocalFolder(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve({ uri: localFolder, prompted: false, created: true }));

        telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();
        telemetryActivityMock.setup(instance => instance.addOrUpdateProperties(It.IsAny()))
            .returns(undefined);

        // Stub artifactOperations methods
        downloadAndSaveArtifactStub = sinon.stub(artifactOperations, 'downloadAndSaveArtifact').resolves();
        showFolderActionAndSavePreferenceStub = sinon.stub(artifactOperations, 'showFolderActionAndSavePreference').resolves(undefined);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('Export artifact successfully', async () => {
        // Arrange
        showFolderActionAndSavePreferenceStub.resolves(artifactOperations.FolderAction.doNothing);

        // Act
        await executeCommand();

        // Assert
        localFolderServiceMock.verify(
            l => l.getLocalFolder(
                It.Is(artifact => artifact === artifactMock.object()),
                It.IsAny()),
            Times.Once());

        assert.ok(downloadAndSaveArtifactStub.calledOnce, 'downloadAndSaveArtifact should be called once');
        assert.ok(downloadAndSaveArtifactStub.calledWith(
            artifactMock.object(),
            localFolder,
            artifactManagerMock.object(),
            conflictDetectorMock.object(),
            itemDefinitionWriterMock.object(),
            telemetryActivityMock.object()
        ), 'downloadAndSaveArtifact should be called with correct arguments');

        assert.ok(showFolderActionAndSavePreferenceStub.calledOnce, 'showFolderActionAndSavePreference should be called once');
        assert.strictEqual(showFolderActionAndSavePreferenceStub.lastCall.args.length, 4, 'Should be called with 4 arguments');
        assert.strictEqual(showFolderActionAndSavePreferenceStub.lastCall.args[3], undefined, 'Fourth argument should be undefined when options not provided');    
    });

    it('calls showFolderActionAndSavePreference with options when provided', async () => {
        showFolderActionAndSavePreferenceStub.resolves(artifactOperations.FolderAction.doNothing);
        const options = { modal: true, includeDoNothing: false };
        await exportArtifactCommand(
            artifactMock.object(),
            artifactManagerMock.object(),
            localFolderServiceMock.object(),
            configurationProviderMock.object(),
            conflictDetectorMock.object(),
            itemDefinitionWriterMock.object(),
            telemetryActivityMock.object(),
            options
        );
        assert.ok(showFolderActionAndSavePreferenceStub.calledOnce, 'showFolderActionAndSavePreference should be called once');
        assert.strictEqual(showFolderActionAndSavePreferenceStub.lastCall.args.length, 4, 'Should be called with 4 arguments when options provided');
        assert.deepStrictEqual(showFolderActionAndSavePreferenceStub.lastCall.args[3], options, 'Options should be passed as the fourth argument');
    });

    it('Cancel local folder selection', async () => {
        // Arrange
        localFolderServiceMock.setup(l => l.getLocalFolder(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(undefined));

        // Act & Assert
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof UserCancelledError, 'Should throw a UserCancelledError');
                assert.ok(err.stepName, 'Should have a stepName');
                assert.strictEqual(err.stepName!, 'localFolderSelection', 'Step name');
                return true;
            }
        );

        // Assert
        localFolderServiceMock.verify(
            l => l.getLocalFolder(
                It.Is(artifact => artifact === artifactMock.object()),
                It.IsAny()),
            Times.Once());
        assert.ok(downloadAndSaveArtifactStub.notCalled, 'downloadAndSaveArtifact should not be called');
        assert.ok(showFolderActionAndSavePreferenceStub.notCalled, 'showFolderActionAndSavePreference should not be called');
    });

    for (const field of ['displayName', 'type'] as const) {
        for (const value of ['../outside', '..\\outside']) {
            it(`rejects traversal in ${field} without downloading, writing or remembering an export`, async () => {
                const artifact: IArtifact = {
                    id: artifactId,
                    displayName: artifactDisplayName,
                    type: 'Notebook',
                    workspaceId: 'workspace-id',
                    fabricEnvironment: 'MOCK',
                    [field]: value,
                };
                const storageMock = new Mock<IFabricExtensionsSettingStorage>();
                storageMock.setup(s => s.settings).returns({ version: 1, workspaces: [], artifacts: [] });
                const fileSystemMock = new Mock<vscode.FileSystem>();
                const localFolderService = new LocalFolderService(storageMock.object(), new MockFabricEnvironmentProvider(), fileSystemMock.object());
                sinon.stub(vscode.window, 'showOpenDialog').resolves([localFolder]);

                await assert.rejects(
                    () => exportArtifactCommand(
                        artifact,
                        artifactManagerMock.object(),
                        localFolderService,
                        configurationProviderMock.object(),
                        conflictDetectorMock.object(),
                        itemDefinitionWriterMock.object(),
                        telemetryActivityMock.object()
                    ),
                    FabricError
                );

                assert.ok(downloadAndSaveArtifactStub.notCalled);
                assert.ok(showFolderActionAndSavePreferenceStub.notCalled);
                itemDefinitionWriterMock.verify(writer => writer.save(It.IsAny(), It.IsAny()), Times.Never());
                fileSystemMock.verify(fs => fs.createDirectory(It.IsAny()), Times.Never());
                storageMock.verify(s => s.save(), Times.Never());
            });
        }
    }

    it('Error: downloadAndSaveArtifact throws UserCancelledError', async () => {
        // Arrange
        const cancelError = new UserCancelledError('overwriteExportFiles');
        downloadAndSaveArtifactStub.rejects(cancelError);

        // Act & Assert
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof UserCancelledError, 'Should throw UserCancelledError');
                assert.strictEqual((err as UserCancelledError).stepName, 'overwriteExportFiles', 'Step name');
                return true;
            }
        );

        assert.ok(downloadAndSaveArtifactStub.calledOnce, 'downloadAndSaveArtifact should be called');
        assert.ok(showFolderActionAndSavePreferenceStub.notCalled, 'showFolderActionAndSavePreference should not be called');
    });

    it('Error: downloadAndSaveArtifact throws generic error', async () => {
        // Arrange
        const errorText = 'Test - Failed to save artifact - Test';
        downloadAndSaveArtifactStub.rejects(new Error(errorText));

        // Act & Assert
        let error: FabricError | undefined = undefined;
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof FabricError, 'Should throw a FabricError');
                error = err as FabricError;
                assert.ok(error!.message.includes(`Error opening ${artifactDisplayName}`), 'Error message should include display name');
                assert.strictEqual(error.options?.showInUserNotification, 'Information', 'Error options should show in user notification');
                return true;
            }
        );

        assert.ok(downloadAndSaveArtifactStub.calledOnce, 'downloadAndSaveArtifact should be called');
        assert.ok(showFolderActionAndSavePreferenceStub.notCalled, 'showFolderActionAndSavePreference should not be called');
        assert.ok(error!.message.includes(errorText), 'message should include errorText');
    });

    async function executeCommand(): Promise<void> {
        await exportArtifactCommand(
            artifactMock.object(),
            artifactManagerMock.object(),
            localFolderServiceMock.object(),
            configurationProviderMock.object(),
            conflictDetectorMock.object(),
            itemDefinitionWriterMock.object(),
            telemetryActivityMock.object()
        );
    }
});

describe('showCompletionMessage', () => {
    let artifactMock: Mock<IArtifact>;
    let localFolderServiceMock: Mock<ILocalFolderService>;
    let configurationProviderMock: Mock<IConfigurationProvider>;

    let showFolderActionAndSavePreferenceStub: sinon.SinonStub;
    let performFolderActionStub: sinon.SinonStub;
    let handleLocalFolderSavePreferenceStub: sinon.SinonStub;

    const testArtifact = {
        id: 'test-artifact-id',
        displayName: 'Test Notebook',
        type: 'Notebook',
        workspaceId: 'test-workspace',
        description: 'Test artifact',
        fabricEnvironment: 'Test'
    };

    const testFolderUri = vscode.Uri.file('/path/to/TestNotebook.Notebook');

    beforeEach(() => {
        artifactMock = new Mock<IArtifact>();
        localFolderServiceMock = new Mock<ILocalFolderService>();
        configurationProviderMock = new Mock<IConfigurationProvider>();

        artifactMock.setup(a => a.displayName).returns(testArtifact.displayName);
        artifactMock.setup(a => a.id).returns(testArtifact.id);

        showFolderActionAndSavePreferenceStub = sinon.stub(artifactOperations, 'showFolderActionAndSavePreference').resolves(undefined);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should call showFolderActionDialog with correct message', async () => {
        const localFolderResults = { uri: testFolderUri, prompted: false };

        await showCompletionMessage(
            artifactMock.object(),
            localFolderResults,
            localFolderServiceMock.object(),
            configurationProviderMock.object()
        );

        assert.ok(showFolderActionAndSavePreferenceStub.calledOnce, 'showFolderActionDialog should be called once');
        const [message] = showFolderActionAndSavePreferenceStub.firstCall.args;
        assert.ok(message.includes('Test Notebook'), 'Message should include artifact name');
        assert.ok(message.includes('TestNotebook.Notebook'), 'Message should include folder name');
    });

    it('should not call performFolderAction when user dismisses dialog', async () => {
        const localFolderResults = { uri: testFolderUri, prompted: true };
        showFolderActionAndSavePreferenceStub.resolves(undefined);

        await showCompletionMessage(
            artifactMock.object(),
            localFolderResults,
            localFolderServiceMock.object(),
            configurationProviderMock.object()
        );

        assert.ok(showFolderActionAndSavePreferenceStub.called, 'showFolderActionAndSavePreference should be called');
    });
});
