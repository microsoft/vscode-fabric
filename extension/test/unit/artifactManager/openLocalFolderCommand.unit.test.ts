// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import { IArtifactManager, IArtifact } from '@microsoft/vscode-fabric-api';
import { TelemetryActivity, UserCancelledError, IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { openLocalFolderCommand } from '../../../src/artifactManager/openLocalFolderCommand';
import * as artifactOperations from '../../../src/artifactManager/localFolderCommandHelpers';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { IItemDefinitionConflictDetector } from '../../../src/itemDefinition/ItemDefinitionConflictDetector';
import { IItemDefinitionWriter } from '../../../src/itemDefinition/ItemDefinitionWriter';
import { ILocalFolderService, LocalFolderGetOptions, LocalFolderPromptMode } from '../../../src/LocalFolderService';

const artifactDisplayName = 'Test Artifact';
const artifactId = 'Test Artifact Id';

describe('openLocalFolderCommand', () => {
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
    let showFolderActionDialogStub: sinon.SinonStub;
    let showFolderActionAndSavePreferenceStub: sinon.SinonStub;
    let performFolderActionAndSavePreferenceStub: sinon.SinonStub;
    let changeLocalFolderCommandStub: sinon.SinonStub;
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
        showFolderActionDialogStub = sinon.stub(artifactOperations, 'showFolderActionDialog').resolves(undefined);
        showFolderActionAndSavePreferenceStub = sinon.stub(artifactOperations, 'showFolderActionAndSavePreference').resolves(undefined);
        performFolderActionAndSavePreferenceStub = sinon.stub(artifactOperations, 'performFolderActionAndSavePreference').resolves();

        // Stub VS Code dialogs
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');

        localFolderServiceMock.setup(l => l.updateLocalFolder(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve());
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('when existing folder exists', () => {
        beforeEach(() => {
            localFolderServiceMock
                .setup(l => l.getLocalFolder(It.IsAny(), It.Is<LocalFolderGetOptions>(opts => opts.prompt === LocalFolderPromptMode.never)))
                .returns(Promise.resolve({ uri: existingFolder, prompted: false, created: false }));
        });

        it('should show folder action dialog with existing folder', async () => {
            showFolderActionDialogStub.resolves(artifactOperations.FolderAction.openInCurrentWindow);

            await executeCommand();

            assert.ok(showFolderActionDialogStub.calledOnce, 'Should show folder action dialog');
            const [message, options] = showFolderActionDialogStub.firstCall.args;
            assert.ok(message.includes(existingFolder.fsPath), 'Message should include folder path');
            assert.strictEqual(options?.modal, true, 'Dialog should be modal');
            assert.strictEqual(options?.includeDoNothing, false, 'Should not include do nothing option');

            assert.ok(performFolderActionAndSavePreferenceStub.calledOnce, 'Should call performFolderActionAndSavePreference');
            assert.ok(showFolderActionAndSavePreferenceStub.notCalled, 'Should not call showFolderActionAndSavePreference');
            assert.ok(showInformationMessageStub.notCalled, 'Should not show info message for new folder');
            assert.ok(downloadAndSaveArtifactStub.notCalled, 'Should not download artifact');
        });

        it('should call changeLocalFolderCommand when user chooses different folder', async () => {
            showFolderActionDialogStub.resolves(artifactOperations.FolderAction.chooseDifferentFolder);

            changeLocalFolderCommandStub = sinon.stub().resolves();
            sinon.replace(require('../../../src/artifactManager/changeLocalFolderCommand'), 'changeLocalFolderCommand', changeLocalFolderCommandStub);

            await executeCommand();

            assert.ok(changeLocalFolderCommandStub.calledOnce, 'Should call changeLocalFolderCommand');
            const [artifact, am, lfs, cp, cd, writer, ta, options] = changeLocalFolderCommandStub.firstCall.args;
            assert.strictEqual(artifact, artifactMock.object(), 'Should pass artifact');
            assert.strictEqual(options?.skipWarning, true, 'Should skip warning');
            assert.strictEqual(options?.promptForSave, true, 'Should prompt for save');
        });

        it('should handle user dismissing folder action dialog', async () => {
            showFolderActionDialogStub.resolves(undefined);

            await executeCommand();

            assert.ok(showFolderActionDialogStub.calledOnce, 'Should show folder action dialog');
            assert.ok(downloadAndSaveArtifactStub.notCalled, 'Should not download artifact');
        });
    });

    describe('when no existing folder exists', () => {
        beforeEach(() => {
            localFolderServiceMock
                .setup(l => l.getLocalFolder(It.IsAny(), It.Is<LocalFolderGetOptions>(opts => opts.prompt === LocalFolderPromptMode.never)))
                .returns(Promise.resolve(undefined));

            localFolderServiceMock
                .setup(l => l.getLocalFolder(It.IsAny(), It.Is<LocalFolderGetOptions>(opts => opts.prompt === LocalFolderPromptMode.always)))
                .returns(Promise.resolve({ uri: newFolder, prompted: true, created: false }));

            showInformationMessageStub.resolves('Select folder');
        });

        it('should prompt user and download to new folder', async () => {
            // Ararnge
            showFolderActionDialogStub.resolves(artifactOperations.FolderAction.openInCurrentWindow);

            // Act
            await executeCommand();

            // Assert
            assert.ok(showInformationMessageStub.calledOnce, 'Should show info message');
            const [message, options] = showInformationMessageStub.firstCall.args;
            assert.ok(message.includes('No local folder has been selected'), 'Message should indicate no folder selected');
            assert.ok(message.includes(artifactDisplayName), 'Message should include artifact name');
            assert.strictEqual(options?.modal, true, 'Dialog should be modal');

            localFolderServiceMock.verify(
                l => l.getLocalFolder(
                    artifactMock.object(),
                    It.Is<LocalFolderGetOptions>(opts => opts.prompt === LocalFolderPromptMode.always && opts.create === false)
                ),
                Times.Once()
            );

            assert.ok(downloadAndSaveArtifactStub.calledOnce, 'Should download artifact');
            assert.ok(downloadAndSaveArtifactStub.calledWith(
                artifactMock.object(),
                newFolder,
                artifactManagerMock.object(),
                conflictDetectorMock.object(),
                itemDefinitionWriterMock.object(),
                telemetryActivityMock.object()
            ), 'Should call downloadAndSaveArtifact with correct arguments');

            assert.ok(showFolderActionAndSavePreferenceStub.calledOnce, 'Should perform folder action');
        });

        it('should throw UserCancelledError when user cancels folder selection prompt', async () => {
            showInformationMessageStub.resolves(undefined);

            await assert.rejects(
                async () => await executeCommand(),
                (err: Error) => {
                    assert.ok(err instanceof UserCancelledError);
                    assert.strictEqual((err as UserCancelledError).stepName, 'localFolderSelection');
                    return true;
                }
            );

            assert.ok(downloadAndSaveArtifactStub.notCalled, 'Should not download');
        });

        it('should throw UserCancelledError when user cancels folder picker', async () => {
            localFolderServiceMock
                .setup(l => l.getLocalFolder(It.IsAny(), It.Is<LocalFolderGetOptions>(opts => opts.prompt === LocalFolderPromptMode.always)))
                .returns(Promise.resolve(undefined));

            await assert.rejects(
                async () => await executeCommand(),
                (err: Error) => {
                    assert.ok(err instanceof UserCancelledError);
                    assert.strictEqual((err as UserCancelledError).stepName, 'localFolderSelection');
                    return true;
                }
            );

            assert.ok(downloadAndSaveArtifactStub.notCalled, 'Should not download');
        });

        it('should call handleSavePreferenceDialog with correct parameters', async () => {
            await executeCommand();

            assert.ok(showFolderActionAndSavePreferenceStub.calledOnce, 'Should call showFolderActionAndSavePreference');
            const [message, folderUri, artifact, localFolderService, configProvider, prompted] = showFolderActionAndSavePreferenceStub.firstCall.args;
            assert.strictEqual(artifact, artifactMock.object(), 'Should pass artifact');
            assert.strictEqual(folderUri, newFolder, 'Should pass new folder URI');
            assert.strictEqual(localFolderService, localFolderServiceMock.object(), 'Should pass localFolderService');
            assert.strictEqual(configProvider, configurationProviderMock.object(), 'Should pass configurationProvider');
            assert.strictEqual(prompted, true, 'Should pass prompted flag');
        });

        it('should show folder action dialog after download', async () => {
            // Arrange
            showFolderActionAndSavePreferenceStub.resolves(artifactOperations.FolderAction.openInCurrentWindow);

            // Act
            await executeCommand();

            // Assert
            assert.ok(showFolderActionAndSavePreferenceStub.calledOnce, 'Should show folder action dialog');
            const [message, folderUri, artifact, localFolderService, configProvider, prompted, options] = showFolderActionAndSavePreferenceStub.firstCall.args;
            assert.strictEqual(options?.modal, true, 'Dialog should be modal');
            assert.strictEqual(options?.includeDoNothing, false, 'Should not include do nothing option');
            assert.ok(message.includes(newFolder.fsPath), 'Message should include new folder path');
            assert.ok(showFolderActionAndSavePreferenceStub.calledOnce, 'Should perform folder action');
        });
    });

    async function executeCommand(): Promise<void> {
        await openLocalFolderCommand(
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
