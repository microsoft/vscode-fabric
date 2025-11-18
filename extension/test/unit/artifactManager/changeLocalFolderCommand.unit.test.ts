// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import { IArtifactManager, IArtifact } from '@microsoft/vscode-fabric-api';
import { FabricError, TelemetryActivity, UserCancelledError, IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { changeLocalFolderCommand } from '../../../src/artifactManager/changeLocalFolderCommand';
import * as artifactOperations from '../../../src/artifactManager/localFolderCommandHelpers';
import * as utilities from '../../../src/utilities';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { IItemDefinitionConflictDetector } from '../../../src/itemDefinition/ItemDefinitionConflictDetector';
import { IItemDefinitionWriter } from '../../../src/itemDefinition/ItemDefinitionWriter';
import { ILocalFolderService, LocalFolderGetOptions, LocalFolderGetResult, LocalFolderPromptMode } from '../../../src/LocalFolderService';

const artifactDisplayName = 'Test Artifact';
const artifactId = 'Test Artifact Id';

describe('changeLocalFolderCommand', () => {
    const existingFolder = vscode.Uri.file('/path/to/existing/folder');
    const newFolder = vscode.Uri.file('/path/to/new/folder');

    let artifactManagerMock: Mock<IArtifactManager>;
    let artifactMock: Mock<IArtifact>;
    let localFolderServiceMock: Mock<ILocalFolderService>;
    let configurationProviderMock: Mock<IConfigurationProvider>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
    let conflictDetectorMock: Mock<IItemDefinitionConflictDetector>;
    let itemDefinitionWriterMock: Mock<IItemDefinitionWriter>;

    let downloadAndSaveArtifactStub: sinon.SinonStub;
    let copyFolderContentsStub: sinon.SinonStub;
    let showFolderActionAndSavePreferenceStub: sinon.SinonStub;
    let handleLocalFolderSavePreferenceStub: sinon.SinonStub;
    let performFolderActionStub: sinon.SinonStub;
    let exportArtifactCommandStub: sinon.SinonStub;
    let isDirectoryStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;

    beforeEach(() => {
        artifactManagerMock = new Mock<IArtifactManager>();
        artifactMock = new Mock<IArtifact>();
        localFolderServiceMock = new Mock<ILocalFolderService>();
        configurationProviderMock = new Mock<IConfigurationProvider>();
        conflictDetectorMock = new Mock<IItemDefinitionConflictDetector>();
        itemDefinitionWriterMock = new Mock<IItemDefinitionWriter>();

        artifactMock.setup(a => a.id).returns(artifactId);
        artifactMock.setup(a => a.displayName).returns(artifactDisplayName);
        artifactMock.setup(a => a.type).returns('Notebook');

        telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();
        telemetryActivityMock.setup(instance => instance.addOrUpdateProperties(It.IsAny()))
            .returns(undefined);

        // Stub artifactOperations methods
        downloadAndSaveArtifactStub = sinon.stub(artifactOperations, 'downloadAndSaveArtifact').resolves();
        copyFolderContentsStub = sinon.stub(artifactOperations, 'copyFolderContents').resolves();
        showFolderActionAndSavePreferenceStub = sinon.stub(artifactOperations, 'showFolderActionAndSavePreference').resolves(undefined);

        // Stub utilities
        isDirectoryStub = sinon.stub(utilities, 'isDirectory').returns(Promise.resolve(true));

        // Stub VS Code dialogs
        showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');

        localFolderServiceMock.setup(l => l.updateLocalFolder(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve());
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('when no existing folder exists', () => {
        beforeEach(() => {
            localFolderServiceMock.setup(l => l.getLocalFolder(It.IsAny(), It.IsAny()))
                .returns(Promise.resolve(undefined));

            // Need to stub the module function
            exportArtifactCommandStub = sinon.stub().resolves();
            // Override the import
            sinon.replace(require('../../../src/artifactManager/exportArtifactCommand'), 'exportArtifactCommand', exportArtifactCommandStub);
        });

        it('should call exportArtifactCommand', async () => {
            await executeCommand();

            assert.ok(exportArtifactCommandStub.calledOnce, 'exportArtifactCommand should be called');
            assert.ok(showWarningMessageStub.notCalled, 'Should not show warning');
        });
    });

    describe('when existing folder is not a directory', () => {
        beforeEach(() => {
            localFolderServiceMock.setup(l => l.getLocalFolder(It.IsAny(), It.IsAny()))
                .returns(Promise.resolve({ uri: existingFolder, prompted: false, created: false }));
            isDirectoryStub.returns(Promise.resolve(false));

            exportArtifactCommandStub = sinon.stub().resolves();
            sinon.replace(require('../../../src/artifactManager/exportArtifactCommand'), 'exportArtifactCommand', exportArtifactCommandStub);
        });

        it('should call exportArtifactCommand', async () => {
            await executeCommand();

            assert.ok(exportArtifactCommandStub.calledOnce, 'exportArtifactCommand should be called');
            assert.ok(showWarningMessageStub.notCalled, 'Should not show warning');
        });
    });

    describe('when existing folder exists', () => {
        beforeEach(() => {
            localFolderServiceMock
                .setup(l => l.getLocalFolder(It.IsAny(), It.Is<LocalFolderGetOptions>(opts => opts.prompt === LocalFolderPromptMode.never)))
                .returns(Promise.resolve({ uri: existingFolder, prompted: false, created: false }));

            localFolderServiceMock
                .setup(l => l.getLocalFolder(It.IsAny(), It.Is<LocalFolderGetOptions>(opts => opts.prompt === LocalFolderPromptMode.always)))
                .returns(Promise.resolve({ uri: newFolder, prompted: true, created: true }));

            showWarningMessageStub.resolves('Continue');
            showInformationMessageStub.resolves('Download');
        });

        it('should show warning and download to new folder', async () => {
            showFolderActionAndSavePreferenceStub.resolves(artifactOperations.FolderAction.doNothing);

            await executeCommand();

            assert.ok(showWarningMessageStub.calledOnce, 'Should show warning message');
            assert.ok(showInformationMessageStub.calledOnce, 'Should show source choice message');

            assert.ok(downloadAndSaveArtifactStub.calledOnce, 'Should download artifact');
            assert.ok(downloadAndSaveArtifactStub.calledWith(
                artifactMock.object(),
                newFolder,
                artifactManagerMock.object(),
                conflictDetectorMock.object(),
                itemDefinitionWriterMock.object(),
                telemetryActivityMock.object()
            ), 'Should call downloadAndSaveArtifact with correct arguments');

            assert.ok(copyFolderContentsStub.notCalled, 'Should not copy folder');

            localFolderServiceMock.verify(
                l => l.updateLocalFolder(artifactMock.object(), newFolder),
                Times.Once()
            );

            assert.ok(showFolderActionAndSavePreferenceStub.calledOnce, 'Should show folder action dialog');
        });

        it('should copy from existing folder when user chooses Copy', async () => {
            showInformationMessageStub.resolves('Copy');
            showFolderActionAndSavePreferenceStub.resolves(artifactOperations.FolderAction.openInNewWindow);

            await executeCommand();

            assert.ok(copyFolderContentsStub.calledOnce, 'Should copy folder');
            assert.ok(copyFolderContentsStub.calledWith(existingFolder, newFolder), 'Should copy from existing to new folder');

            assert.ok(downloadAndSaveArtifactStub.notCalled, 'Should not download artifact');

            localFolderServiceMock.verify(
                l => l.updateLocalFolder(artifactMock.object(), newFolder),
                Times.Once()
            );
        });

        it('should not call performFolderAction when user dismisses folder action dialog', async () => {
            showFolderActionAndSavePreferenceStub.resolves(undefined);

            await executeCommand();

            assert.ok(showFolderActionAndSavePreferenceStub.calledOnce, 'Should show folder action dialog');
        });

        it('should skip warning when skipWarning option is true', async () => {
            await executeCommand({ skipWarning: true });

            assert.ok(showWarningMessageStub.notCalled, 'Should not show warning message');
            assert.ok(showInformationMessageStub.calledOnce, 'Should show source choice message');
            assert.ok(downloadAndSaveArtifactStub.calledOnce, 'Should download artifact');
        });

        it('should call handleSavePreferenceDialog when promptForSave option is true', async () => {
            await executeCommand({ promptForSave: true });

            localFolderServiceMock.verify(
                l => l.updateLocalFolder(It.IsAny(), It.IsAny()),
                Times.Never()
            );
        });

        it('should throw UserCancelledError when user cancels warning', async () => {
            showWarningMessageStub.resolves(undefined);

            await assert.rejects(
                async () => await executeCommand(),
                (err: Error) => {
                    assert.ok(err instanceof UserCancelledError);
                    assert.strictEqual((err as UserCancelledError).stepName, 'verifyFolderChange');
                    return true;
                }
            );

            assert.ok(downloadAndSaveArtifactStub.notCalled, 'Should not download');
            assert.ok(copyFolderContentsStub.notCalled, 'Should not copy');
        });

        it('should throw UserCancelledError when user cancels source choice', async () => {
            showInformationMessageStub.resolves(undefined);

            await assert.rejects(
                async () => await executeCommand(),
                (err: Error) => {
                    assert.ok(err instanceof UserCancelledError);
                    assert.strictEqual((err as UserCancelledError).stepName, 'populateFolder');
                    return true;
                }
            );

            assert.ok(downloadAndSaveArtifactStub.notCalled, 'Should not download');
            assert.ok(copyFolderContentsStub.notCalled, 'Should not copy');
        });

        it('should throw UserCancelledError when user cancels folder selection', async () => {
            localFolderServiceMock
                .setup(l => l.getLocalFolder(It.IsAny(), It.Is<LocalFolderGetOptions>(opts => opts.prompt === LocalFolderPromptMode.always)))
                .returns(Promise.resolve(undefined));

            await assert.rejects(
                async () => await executeCommand(),
                (err: Error) => {
                    assert.ok(err instanceof UserCancelledError);
                    assert.strictEqual((err as UserCancelledError).stepName, 'selectFolder');
                    return true;
                }
            );

            assert.ok(downloadAndSaveArtifactStub.notCalled, 'Should not download');
            assert.ok(copyFolderContentsStub.notCalled, 'Should not copy');
        });

        it('should propagate UserCancelledError from downloadAndSaveArtifact', async () => {
            const cancelError = new UserCancelledError('overwriteFiles');
            downloadAndSaveArtifactStub.rejects(cancelError);

            await assert.rejects(
                async () => await executeCommand(),
                (err: Error) => {
                    assert.ok(err instanceof UserCancelledError);
                    assert.strictEqual((err as UserCancelledError).stepName, 'overwriteFiles');
                    return true;
                }
            );

            localFolderServiceMock.verify(
                l => l.updateLocalFolder(It.IsAny(), It.IsAny()),
                Times.Never()
            );
            assert.ok(showFolderActionAndSavePreferenceStub.notCalled, 'Should not show folder action dialog');
        });

        it('should wrap generic errors in FabricError', async () => {
            const errorText = 'Test error message';
            downloadAndSaveArtifactStub.rejects(new Error(errorText));

            let error: FabricError | undefined;
            await assert.rejects(
                async () => await executeCommand(),
                (err: Error) => {
                    assert.ok(err instanceof FabricError);
                    error = err as FabricError;
                    assert.ok(error.message.includes('Error changing local folder'));
                    assert.ok(error.message.includes(artifactDisplayName));
                    assert.strictEqual(error.options?.showInUserNotification, 'Information');
                    return true;
                }
            );

            assert.ok(error!.message.includes(errorText), 'Should include original error message');
            localFolderServiceMock.verify(
                l => l.updateLocalFolder(It.IsAny(), It.IsAny()),
                Times.Never()
            );
            assert.ok(showFolderActionAndSavePreferenceStub.notCalled, 'Should not show folder action dialog');
        });
    });

    async function executeCommand(options?: { skipWarning?: boolean; promptForSave?: boolean }): Promise<void> {
        await changeLocalFolderCommand(
            artifactMock.object(),
            artifactManagerMock.object(),
            localFolderServiceMock.object(),
            configurationProviderMock.object(),
            conflictDetectorMock.object(),
            itemDefinitionWriterMock.object(),
            telemetryActivityMock.object(),
            options
        );
    }
});
