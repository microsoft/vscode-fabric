// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import { IApiClientResponse, IArtifactManager, IArtifact, IItemDefinition } from '@microsoft/vscode-fabric-api';
import { FabricError, TelemetryActivity, UserCancelledError, IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import {
    downloadAndSaveArtifact,
    copyFolderContents,
    handleSavePreferenceDialog,
    getFolderDisplayName,
    showFolderActionDialog,
    FolderAction,
} from '../../../src/artifactManager/localFolderCommandHelpers';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { verifyAddOrUpdateProperties } from '../../utilities/moqUtilities';
import { IItemDefinitionConflictDetector } from '../../../src/itemDefinition/ItemDefinitionConflictDetector';
import { IItemDefinitionWriter } from '../../../src/itemDefinition/ItemDefinitionWriter';
import { ILocalFolderService, LocalFolderSaveBehavior } from '../../../src/LocalFolderService';

const artifactDisplayName = 'Test Artifact';
const artifactId = 'Test Artifact Id';

describe('localFolderCommandHelpers', () => {
    describe('downloadAndSaveArtifact', () => {
        const targetFolder = vscode.Uri.file('/path/to/target/folder');
        const successDefinition = {
            definition: {
                parts: [
                    { path: 'notebook-content.py', payload: 'IyBGYWJyaW', payloadType: 'InlineBase64' },
                    { path: '.platform', payload: 'ewogICIkc2N', payloadType: 'InlineBase64' },
                ],
            },
        };

        const successResponse = {
            status: 200,
            parsedBody: successDefinition,
        };

        let artifactMock: Mock<IArtifact>;
        let artifactManagerMock: Mock<IArtifactManager>;
        let conflictDetectorMock: Mock<IItemDefinitionConflictDetector>;
        let itemDefinitionWriterMock: Mock<IItemDefinitionWriter>;
        let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
        let showWarningMessageStub: sinon.SinonStub;

        beforeEach(() => {
            artifactMock = new Mock<IArtifact>();
            artifactManagerMock = new Mock<IArtifactManager>();
            conflictDetectorMock = new Mock<IItemDefinitionConflictDetector>();
            itemDefinitionWriterMock = new Mock<IItemDefinitionWriter>();
            telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();

            artifactMock.setup(a => a.displayName).returns(artifactDisplayName);
            artifactMock.setup(a => a.type).returns('Notebook');

            telemetryActivityMock.setup(t => t.addOrUpdateProperties(It.IsAny())).returns(undefined);

            conflictDetectorMock.setup(c => c.getConflictingFiles(It.IsAny(), It.IsAny())).returnsAsync([]);
            itemDefinitionWriterMock.setup(w => w.save(It.IsAny(), It.IsAny())).returnsAsync(undefined);

            showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
        });

        afterEach(() => {
            sinon.restore();
        });

        it('should download and save artifact successfully', async () => {
            const successResponse: IApiClientResponse = {
                status: 200,
                parsedBody: successDefinition,
            };
            artifactManagerMock.setup(am => am.getArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returnsAsync(successResponse);

            await downloadAndSaveArtifact(
                artifactMock.object(),
                targetFolder,
                artifactManagerMock.object(),
                conflictDetectorMock.object(),
                itemDefinitionWriterMock.object(),
                telemetryActivityMock.object()
            );

            artifactManagerMock.verify(am => am.getArtifactDefinition(artifactMock.object(), targetFolder, It.IsAny()), Times.Once());
            verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '200');
        });

        it('should handle conflicts and continue when user confirms', async () => {
            const successResponse: IApiClientResponse = {
                status: 200,
                parsedBody: successDefinition,
            };
            artifactManagerMock.setup(am => am.getArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returnsAsync(successResponse);
            conflictDetectorMock.setup(c => c.getConflictingFiles(It.IsAny(), It.IsAny()))
                .returnsAsync(['file1.txt', 'file2.txt']);
            showWarningMessageStub.resolves('Yes');

            await downloadAndSaveArtifact(
                artifactMock.object(),
                targetFolder,
                artifactManagerMock.object(),
                conflictDetectorMock.object(),
                itemDefinitionWriterMock.object(),
                telemetryActivityMock.object()
            );

            assert.ok(showWarningMessageStub.calledOnce, 'Should show warning message');
            const [message] = showWarningMessageStub.firstCall.args;
            assert.ok(message.includes('file1.txt') && message.includes('file2.txt'), 'Should list conflicting files');
            itemDefinitionWriterMock.verify(w => w.save(It.IsAny(), It.IsAny()), Times.Once());
        });

        it('should throw UserCancelledError when user cancels overwrite', async () => {
            const successResponse: IApiClientResponse = {
                status: 200,
                parsedBody: successDefinition,
            };
            artifactManagerMock.setup(am => am.getArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returnsAsync(successResponse);
            conflictDetectorMock.setup(c => c.getConflictingFiles(It.IsAny(), It.IsAny()))
                .returnsAsync(['file1.txt']);
            showWarningMessageStub.resolves(undefined);

            await assert.rejects(
                async () => await downloadAndSaveArtifact(
                    artifactMock.object(),
                    targetFolder,
                    artifactManagerMock.object(),
                    conflictDetectorMock.object(),
                    itemDefinitionWriterMock.object(),
                    telemetryActivityMock.object()
                ),
                (err: Error) => {
                    assert.ok(err instanceof UserCancelledError);
                    assert.strictEqual((err as UserCancelledError).stepName, 'overwriteExportFiles');
                    return true;
                }
            );

            itemDefinitionWriterMock.verify(w => w.save(It.IsAny(), It.IsAny()), Times.Never());
        });

        it('should throw FabricError on API error', async () => {
            const errorResponse: IApiClientResponse = {
                status: 400,
                parsedBody: {
                    errorCode: 'InvalidInput',
                    message: 'The input was invalid',
                    requestId: 'req-12345',
                },
            };
            artifactManagerMock.setup(am => am.getArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returnsAsync(errorResponse);

            await assert.rejects(
                async () => await downloadAndSaveArtifact(
                    artifactMock.object(),
                    targetFolder,
                    artifactManagerMock.object(),
                    conflictDetectorMock.object(),
                    itemDefinitionWriterMock.object(),
                    telemetryActivityMock.object()
                ),
                (err: Error) => {
                    assert.ok(err instanceof FabricError);
                    return true;
                }
            );

            verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '400');
            verifyAddOrUpdateProperties(telemetryActivityMock, 'requestId', 'req-12345');
            verifyAddOrUpdateProperties(telemetryActivityMock, 'errorCode', 'InvalidInput');
            itemDefinitionWriterMock.verify(w => w.save(It.IsAny(), It.IsAny()), Times.Never());
        });

        it('should pass progress reporter to getArtifactDefinition', async () => {
            // Arrange
            let capturedOptions: any;
            artifactManagerMock
                .setup(am => am.getArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .callback(({ args }) => {
                    const [_artifact, _folder, options] = args;
                    capturedOptions = options;
                    return Promise.resolve(successResponse);
                });

            // Act
            await downloadAndSaveArtifact(
                artifactMock.object(),
                targetFolder,
                artifactManagerMock.object(),
                conflictDetectorMock.object(),
                itemDefinitionWriterMock.object(),
                telemetryActivityMock.object()
            );

            // Assert
            assert.ok(capturedOptions, 'Options should be passed to getArtifactDefinition');
            assert.ok(capturedOptions.progress, 'Progress should be provided in options');
            assert.strictEqual(typeof capturedOptions.progress.report, 'function', 'Progress should have a report method');
        });
    });

    describe('copyFolderContents', () => {
        const sourceFolder = vscode.Uri.file('/source');
        const targetFolder = vscode.Uri.file('/target');

        let fileSystemMock: Mock<vscode.FileSystem>;

        beforeEach(() => {
            fileSystemMock = new Mock<vscode.FileSystem>();
        });

        afterEach(() => {
            sinon.restore();
        });

        it('should copy all files and folders', async () => {
            fileSystemMock.setup(fs => fs.stat(sourceFolder))
                .returns(Promise.resolve({ type: vscode.FileType.Directory } as vscode.FileStat));
            fileSystemMock.setup(fs => fs.readDirectory(sourceFolder))
                .returns(Promise.resolve([
                    ['file1.txt', vscode.FileType.File],
                    ['subfolder', vscode.FileType.Directory],
                ]));
            fileSystemMock
                .setup(fs => fs.copy(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve());

            await copyFolderContents(sourceFolder, targetFolder, fileSystemMock.object());

            fileSystemMock.verify(fs => fs.stat(sourceFolder), Times.Once());
            fileSystemMock.verify(fs => fs.readDirectory(sourceFolder), Times.Once());
            fileSystemMock.verify(fs => fs.copy(It.IsAny(), It.IsAny(), It.IsAny()), Times.Exactly(2));
        });

        it('should throw FabricError when source folder does not exist', async () => {
            fileSystemMock.setup(fs => fs.stat(sourceFolder))
                .throws(new Error('Not found'));

            await assert.rejects(
                async () => await copyFolderContents(sourceFolder, targetFolder, fileSystemMock.object()),
                (err: Error) => {
                    assert.ok(err instanceof FabricError);
                    assert.ok(err.message.includes('Error copying from existing folder'));
                    return true;
                }
            );

            fileSystemMock.verify(fs => fs.copy(It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
        });

        it('should throw FabricError on copy failure', async () => {
            fileSystemMock.setup(fs => fs.stat(sourceFolder))
                .returns(Promise.resolve({ type: vscode.FileType.Directory } as vscode.FileStat));
            fileSystemMock.setup(fs => fs.readDirectory(sourceFolder))
                .returns(Promise.resolve([['file1.txt', vscode.FileType.File]]));
            fileSystemMock.setup(fs => fs.copy(It.IsAny(), It.IsAny(), It.IsAny()))
                .throws(new Error('Permission denied'));

            await assert.rejects(
                async () => await copyFolderContents(sourceFolder, targetFolder, fileSystemMock.object()),
                (err: Error) => {
                    assert.ok(err instanceof FabricError);
                    assert.ok(err.message.includes('Error copying from existing folder'));
                    return true;
                }
            );
        });
    });

    describe('handleSavePreferenceDialog', () => {
        const testFolder = vscode.Uri.file('/test/folder');

        let artifactMock: Mock<IArtifact>;
        let localFolderServiceMock: Mock<ILocalFolderService>;
        let configurationProviderMock: Mock<IConfigurationProvider>;
        let showInformationMessageStub: sinon.SinonStub;

        beforeEach(() => {
            artifactMock = new Mock<IArtifact>();
            localFolderServiceMock = new Mock<ILocalFolderService>();
            configurationProviderMock = new Mock<IConfigurationProvider>();

            artifactMock.setup(a => a.displayName).returns(artifactDisplayName);

            localFolderServiceMock.setup(l => l.updateLocalFolder(It.IsAny(), It.IsAny())).returns(Promise.resolve());
            configurationProviderMock.setup(c => c.update(It.IsAny(), It.IsAny())).returns(Promise.resolve());

            showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        });

        afterEach(() => {
            sinon.restore();
        });

        it('should do nothing when prompted is false', async () => {
            await handleSavePreferenceDialog(
                artifactMock.object(),
                testFolder,
                localFolderServiceMock.object(),
                configurationProviderMock.object(),
                false
            );

            assert.ok(showInformationMessageStub.notCalled, 'Should not show dialog');
            localFolderServiceMock.verify(l => l.updateLocalFolder(It.IsAny(), It.IsAny()), Times.Never());
        });

        it('should auto-save when behavior is always', async () => {
            configurationProviderMock.setup(c => c.get('LocalFolderSaveBehavior', LocalFolderSaveBehavior.prompt))
                .returns(LocalFolderSaveBehavior.always);

            await handleSavePreferenceDialog(
                artifactMock.object(),
                testFolder,
                localFolderServiceMock.object(),
                configurationProviderMock.object(),
                true
            );

            assert.ok(showInformationMessageStub.notCalled, 'Should not show dialog');
            localFolderServiceMock.verify(l => l.updateLocalFolder(artifactMock.object(), testFolder), Times.Once());
        });

        it('should not save when behavior is never', async () => {
            configurationProviderMock.setup(c => c.get('LocalFolderSaveBehavior', LocalFolderSaveBehavior.prompt))
                .returns(LocalFolderSaveBehavior.never);

            await handleSavePreferenceDialog(
                artifactMock.object(),
                testFolder,
                localFolderServiceMock.object(),
                configurationProviderMock.object(),
                true
            );

            assert.ok(showInformationMessageStub.notCalled, 'Should not show dialog');
            localFolderServiceMock.verify(l => l.updateLocalFolder(It.IsAny(), It.IsAny()), Times.Never());
        });

        it('should show dialog when behavior is prompt', async () => {
            configurationProviderMock.setup(c => c.get('LocalFolderSaveBehavior', LocalFolderSaveBehavior.prompt))
                .returns(LocalFolderSaveBehavior.prompt);
            showInformationMessageStub.resolves('Yes');

            await handleSavePreferenceDialog(
                artifactMock.object(),
                testFolder,
                localFolderServiceMock.object(),
                configurationProviderMock.object(),
                true
            );

            assert.ok(showInformationMessageStub.calledOnce, 'Should show dialog');
            const [message, ...buttons] = showInformationMessageStub.firstCall.args;
            assert.ok(message.includes('Do you want to remember'), 'Should ask about remembering folder');
            assert.ok(buttons.includes('Yes'), 'Should have Yes button');
            assert.ok(buttons.includes('No'), 'Should have No button');
            assert.ok(buttons.includes('Always'), 'Should have Always button');
            assert.ok(buttons.includes('Never'), 'Should have Never button');
        });

        [
            { choice: 'Yes', expectSave: true, expectConfigUpdate: false },
            { choice: 'No', expectSave: false, expectConfigUpdate: false },
            { choice: 'Always', expectSave: true, expectConfigUpdate: true, configValue: LocalFolderSaveBehavior.always },
            { choice: 'Never', expectSave: false, expectConfigUpdate: true, configValue: LocalFolderSaveBehavior.never },
        ].forEach(({ choice, expectSave, expectConfigUpdate, configValue }) => {
            it(`should handle ${choice} choice correctly`, async () => {
                configurationProviderMock.setup(c => c.get('LocalFolderSaveBehavior', LocalFolderSaveBehavior.prompt))
                    .returns(LocalFolderSaveBehavior.prompt);
                
                let resolvePromise: (value: string) => void;
                const promise = new Promise<string>((resolve) => { resolvePromise = resolve; });
                showInformationMessageStub.returns(promise);

                const resultPromise = handleSavePreferenceDialog(
                    artifactMock.object(),
                    testFolder,
                    localFolderServiceMock.object(),
                    configurationProviderMock.object(),
                    true
                );

                await resultPromise; // Wait for the function to return (non-blocking promise)

                // Resolve the dialog choice
                resolvePromise!(choice);
                await new Promise(resolve => setTimeout(resolve, 0));

                if (expectSave) {
                    localFolderServiceMock.verify(l => l.updateLocalFolder(artifactMock.object(), testFolder), Times.Once());
                } else {
                    localFolderServiceMock.verify(l => l.updateLocalFolder(It.IsAny(), It.IsAny()), Times.Never());
                }

                if (expectConfigUpdate) {
                    configurationProviderMock.verify(c => c.update('LocalFolderSaveBehavior', configValue!), Times.Once());
                } else {
                    configurationProviderMock.verify(c => c.update(It.IsAny(), It.IsAny()), Times.Never());
                }
            });
        });
    });

    describe('getFolderDisplayName', () => {
        it('should extract folder name from Unix path', () => {
            const uri = vscode.Uri.file('/home/user/workspace/MyFolder');
            assert.strictEqual(getFolderDisplayName(uri), 'MyFolder');
        });

        it('should extract folder name from Windows path', () => {
            const uri = vscode.Uri.file('C:\\Users\\user\\workspace\\MyFolder');
            const name = getFolderDisplayName(uri);
            assert.ok(name === 'MyFolder' || name === 'C:', 'Should extract folder name from Windows path');
        });

        it('should handle root path', () => {
            const uri = vscode.Uri.file('/');
            const name = getFolderDisplayName(uri);
            assert.ok(name.length > 0, 'Should return some name for root');
        });
    });

    describe('showFolderActionDialog', () => {
        const testFolder = vscode.Uri.file('/test/folder');
        const testMessage = 'Test message';

        let showInformationMessageStub: sinon.SinonStub;
        let executeCommandStub: sinon.SinonStub;
        let workspaceFoldersStub: sinon.SinonStub;
        let updateWorkspaceFoldersStub: sinon.SinonStub;

        beforeEach(() => {
            showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
            executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
            
            // Stub workspace properties
            workspaceFoldersStub = sinon.stub(vscode.workspace, 'workspaceFolders').value([
                { uri: vscode.Uri.file('/existing'), name: 'Existing', index: 0 }
            ]);
            updateWorkspaceFoldersStub = sinon.stub(vscode.workspace, 'updateWorkspaceFolders').returns(true);
        });

        afterEach(() => {
            sinon.restore();
        });

        it('should show dialog with default options', async () => {
            showInformationMessageStub.resolves({ title: 'Do nothing', action: FolderAction.doNothing });

            const result = await showFolderActionDialog(testFolder, testMessage);

            assert.ok(showInformationMessageStub.calledOnce, 'Should show dialog');
            const [message, options, ...items] = showInformationMessageStub.firstCall.args;
            assert.strictEqual(message, testMessage);
            assert.deepStrictEqual(options, {});
            assert.ok(items.some((i: any) => i.action === FolderAction.doNothing), 'Should include do nothing');
            assert.strictEqual(result, undefined, 'Do nothing should return undefined');
        });

        it('should show modal dialog when modal option is true', async () => {
            showInformationMessageStub.resolves(undefined);

            await showFolderActionDialog(testFolder, testMessage, { modal: true });

            const [, options] = showInformationMessageStub.firstCall.args;
            assert.deepStrictEqual(options, { modal: true });
        });

        it('should exclude do nothing when includeDoNothing is false', async () => {
            showInformationMessageStub.resolves(undefined);

            await showFolderActionDialog(testFolder, testMessage, { includeDoNothing: false });

            const [, , ...items] = showInformationMessageStub.firstCall.args;
            assert.ok(!items.some((i: any) => i.action === FolderAction.doNothing), 'Should not include do nothing');
        });

        it('should include choose different when includeChooseDifferent is true', async () => {
            showInformationMessageStub.resolves(undefined);

            await showFolderActionDialog(testFolder, testMessage, { includeChooseDifferent: true });

            const [, , ...items] = showInformationMessageStub.firstCall.args;
            assert.ok(items.some((i: any) => i.action === FolderAction.chooseDifferentFolder), 'Should include choose different');
        });

        it('should execute openInCurrentWindow action', async () => {
            showInformationMessageStub.resolves({ title: 'Open in current window', action: FolderAction.openInCurrentWindow });

            const result = await showFolderActionDialog(testFolder, testMessage);

            assert.strictEqual(result, FolderAction.openInCurrentWindow);
            assert.ok(executeCommandStub.calledWith('vscode.openFolder', testFolder, false), 'Should execute open command');
        });

        it('should execute openInNewWindow action', async () => {
            showInformationMessageStub.resolves({ title: 'Open in new window', action: FolderAction.openInNewWindow });

            const result = await showFolderActionDialog(testFolder, testMessage);

            assert.strictEqual(result, FolderAction.openInNewWindow);
            assert.ok(executeCommandStub.calledWith('vscode.openFolder', testFolder, true), 'Should execute open command');
        });

        it('should execute addToWorkspace action', async () => {
            showInformationMessageStub.resolves({ title: 'Add to workspace', action: FolderAction.addToWorkspace });

            const result = await showFolderActionDialog(testFolder, testMessage);

            assert.strictEqual(result, FolderAction.addToWorkspace);
            assert.ok(updateWorkspaceFoldersStub.called, 'Should update workspace folders');
        });

        it('should return chooseDifferentFolder without executing action', async () => {
            showInformationMessageStub.resolves({ title: 'Choose different', action: FolderAction.chooseDifferentFolder });

            const result = await showFolderActionDialog(testFolder, testMessage, { includeChooseDifferent: true });

            assert.strictEqual(result, FolderAction.chooseDifferentFolder);
            assert.ok(executeCommandStub.notCalled, 'Should not execute any commands');
            assert.ok(updateWorkspaceFoldersStub.notCalled, 'Should not update workspace folders');
        });

        it('should return undefined when user dismisses', async () => {
            showInformationMessageStub.resolves(undefined);

            const result = await showFolderActionDialog(testFolder, testMessage);

            assert.strictEqual(result, undefined);
        });

        it('should not include add to workspace when no workspace is open', async () => {
            workspaceFoldersStub.value(undefined);
            showInformationMessageStub.resolves(undefined);

            await showFolderActionDialog(testFolder, testMessage);

            const [, , ...items] = showInformationMessageStub.firstCall.args;
            assert.ok(!items.some((i: any) => i.action === FolderAction.addToWorkspace), 'Should not include add to workspace');
        });
    });
});
