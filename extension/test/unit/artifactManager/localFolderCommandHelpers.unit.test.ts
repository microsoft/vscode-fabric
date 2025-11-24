// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import { IApiClientResponse, IArtifactManager, IArtifact } from '@microsoft/vscode-fabric-api';
import { FabricError, TelemetryActivity, UserCancelledError, IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import {
    downloadAndSaveArtifact,
    copyFolderContents,
    showFolderActionDialog,
    performFolderActionAndSavePreference,
    showFolderActionAndSavePreference,
    FolderAction,
    LocalFolderServices,
    FolderActionRequest,
} from '../../../src/artifactManager/localFolderCommandHelpers';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { verifyAddOrUpdateProperties } from '../../utilities/moqUtilities';
import { IItemDefinitionConflictDetector } from '../../../src/itemDefinition/ItemDefinitionConflictDetector';
import { IItemDefinitionWriter } from '../../../src/itemDefinition/ItemDefinitionWriter';
import { ILocalFolderService, LocalFolderSaveBehavior } from '../../../src/LocalFolderService';

const artifactDisplayName = 'Test Artifact';

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

    describe('showFolderActionDialog', () => {
        const testMessage = 'Test message';

        let showInformationMessageStub: sinon.SinonStub;

        beforeEach(() => {
            showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        });

        afterEach(() => {
            sinon.restore();
        });

        it('should show dialog with default options', async () => {
            showInformationMessageStub.resolves({ title: 'Do nothing', action: FolderAction.doNothing });

            const result = await showFolderActionDialog(testMessage);

            assert.ok(showInformationMessageStub.calledOnce, 'Should show dialog');
            const [message, options, ...items] = showInformationMessageStub.firstCall.args;
            assert.strictEqual(message, testMessage);
            assert.deepStrictEqual(options, {});
            assert.ok(items.some((i: any) => i.action === FolderAction.doNothing), 'Should include do nothing');
            assert.strictEqual(result, FolderAction.doNothing);
        });

        it('should show modal dialog when modal option is true', async () => {
            showInformationMessageStub.resolves(undefined);

            await showFolderActionDialog(testMessage, { modal: true });

            const [, options] = showInformationMessageStub.firstCall.args;
            assert.deepStrictEqual(options, { modal: true });
        });

        it('should exclude do nothing when includeDoNothing is false', async () => {
            showInformationMessageStub.resolves(undefined);

            await showFolderActionDialog(testMessage, { includeDoNothing: false });

            const [, , ...items] = showInformationMessageStub.firstCall.args;
            assert.ok(!items.some((i: any) => i.action === FolderAction.doNothing), 'Should not include do nothing');
        });

        it('should return action when user selects an option', async () => {
            showInformationMessageStub.resolves({ title: 'Open in current window', action: FolderAction.openInCurrentWindow });

            const result = await showFolderActionDialog(testMessage);

            assert.strictEqual(result, FolderAction.openInCurrentWindow);
        });

        it('should return undefined when user dismisses', async () => {
            showInformationMessageStub.resolves(undefined);

            const result = await showFolderActionDialog(testMessage);

            assert.strictEqual(result, undefined);
        });
    });

    describe('performFolderActionAndSavePreference', () => {
        const folderUri = vscode.Uri.file('/test/folder');

        let artifactMock: Mock<IArtifact>;
        let localFolderServiceMock: Mock<ILocalFolderService>;
        let configurationProviderMock: Mock<IConfigurationProvider>;
        let showInformationMessageStub: sinon.SinonStub;
        let executeCommandStub: sinon.SinonStub;
        let updateWorkspaceFoldersStub: sinon.SinonStub;

        beforeEach(() => {
            artifactMock = new Mock<IArtifact>();
            localFolderServiceMock = new Mock<ILocalFolderService>();
            configurationProviderMock = new Mock<IConfigurationProvider>();

            artifactMock.setup(a => a.displayName).returns('Test Artifact');

            showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
            executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');
            updateWorkspaceFoldersStub = sinon.stub(vscode.workspace, 'updateWorkspaceFolders');

            localFolderServiceMock.setup(l => l.updateLocalFolder(It.IsAny(), It.IsAny())).returnsAsync(undefined);
        });

        afterEach(() => {
            sinon.restore();
        });

        describe('workspace-updating actions (modal save preference before action)', () => {
            it('should handle save preference with modal before performing open in current window when prompted=true', async () => {
                const action: FolderAction = FolderAction.openInCurrentWindow;
                configurationProviderMock.setup(c => c.get(It.IsAny(), It.IsAny())).returns(LocalFolderSaveBehavior.prompt);
                showInformationMessageStub.resolves('Yes');
                executeCommandStub.resolves();

                const services: LocalFolderServices = {
                    localFolderService: localFolderServiceMock.object(),
                    configurationProvider: configurationProviderMock.object()
                };
                const request: FolderActionRequest = {
                    folderUri,
                    artifact: artifactMock.object(),
                    prompted: true
                };

                await performFolderActionAndSavePreference(request, action, services);

                // Verify modal save preference was shown
                assert.ok(showInformationMessageStub.calledOnce, 'Should show save preference dialog');
                const [message, options] = showInformationMessageStub.firstCall.args;
                assert.ok(message.includes('remember folder'), 'Should ask about remembering folder');
                assert.deepStrictEqual(options, { modal: true }, 'Should be modal');

                // Verify action was performed
                if (action === FolderAction.openInCurrentWindow) {
                    assert.ok(executeCommandStub.calledWith('vscode.openFolder', folderUri, false));
                }
            });

            it('should not show save preference for open in current window when prompted=false', async () => {
                const action: FolderAction = FolderAction.openInCurrentWindow;
                executeCommandStub.resolves();

                const services: LocalFolderServices = {
                    localFolderService: localFolderServiceMock.object(),
                    configurationProvider: configurationProviderMock.object()
                };
                const request: FolderActionRequest = {
                    folderUri,
                    artifact: artifactMock.object(),
                    prompted: false
                };

                await performFolderActionAndSavePreference(request, action, services);

                // Should not show save preference dialog
                assert.ok(!showInformationMessageStub.called, 'Should not show save preference dialog');

                // Verify action was still performed
                if (action === FolderAction.openInCurrentWindow) {
                    assert.ok(executeCommandStub.calledWith('vscode.openFolder', folderUri, false));
                }
            });
        });

        describe('non-workspace-updating actions (non-modal save preference after action)', () => {
            [FolderAction.openInNewWindow, FolderAction.doNothing].forEach(action => {
                it(`should handle save preference non-modally after ${action} when prompted=true`, async () => {
                    configurationProviderMock.setup(c => c.get(It.IsAny(), It.IsAny())).returns(LocalFolderSaveBehavior.prompt);

                    // Non-modal returns a promise that resolves with the choice
                    const choicePromise = Promise.resolve('Yes');
                    showInformationMessageStub.returns(choicePromise);
                    executeCommandStub.resolves();

                    const services: LocalFolderServices = {
                        localFolderService: localFolderServiceMock.object(),
                        configurationProvider: configurationProviderMock.object()
                    };
                    const request: FolderActionRequest = {
                        folderUri,
                        artifact: artifactMock.object(),
                        prompted: true
                    };

                    await performFolderActionAndSavePreference(request, action, services);

                    // Verify action was performed first
                    if (action === FolderAction.openInNewWindow) {
                        assert.ok(executeCommandStub.calledWith('vscode.openFolder', folderUri, true));
                    }

                    // Verify non-modal save preference was shown
                    assert.ok(showInformationMessageStub.calledOnce, 'Should show save preference dialog');
                    const [message, ...options] = showInformationMessageStub.firstCall.args;
                    assert.ok(message.includes('remember folder'), 'Should ask about remembering folder');
                    // For non-modal, first arg after message should be button text, not options object
                    assert.notDeepStrictEqual(options[0], { modal: true }, 'Should not be modal');
                });
            });

            it('should handle openInNewWindow action correctly', async () => {
                configurationProviderMock.setup(c => c.get(It.IsAny(), It.IsAny())).returns(LocalFolderSaveBehavior.never);
                executeCommandStub.resolves();

                const services: LocalFolderServices = {
                    localFolderService: localFolderServiceMock.object(),
                    configurationProvider: configurationProviderMock.object()
                };
                const request: FolderActionRequest = {
                    folderUri,
                    artifact: artifactMock.object(),
                    prompted: false
                };

                await performFolderActionAndSavePreference(request, FolderAction.openInNewWindow, services);

                assert.ok(executeCommandStub.calledWith('vscode.openFolder', folderUri, true));
            });

            it('should not perform any action for doNothing', async () => {
                configurationProviderMock.setup(c => c.get(It.IsAny(), It.IsAny())).returns(LocalFolderSaveBehavior.never);

                const services: LocalFolderServices = {
                    localFolderService: localFolderServiceMock.object(),
                    configurationProvider: configurationProviderMock.object()
                };
                const request: FolderActionRequest = {
                    folderUri,
                    artifact: artifactMock.object(),
                    prompted: false
                };

                await performFolderActionAndSavePreference(request, FolderAction.doNothing, services);

                assert.ok(!executeCommandStub.called, 'Should not execute any command');
                assert.ok(!updateWorkspaceFoldersStub.called, 'Should not update workspace folders');
            });
        });

        describe('save preference behavior', () => {
            it('should auto-save when behavior is always', async () => {
                configurationProviderMock.setup(c => c.get('LocalFolderSaveBehavior', It.IsAny())).returns(LocalFolderSaveBehavior.always);
                executeCommandStub.resolves();

                const services: LocalFolderServices = {
                    localFolderService: localFolderServiceMock.object(),
                    configurationProvider: configurationProviderMock.object()
                };
                const request: FolderActionRequest = {
                    folderUri,
                    artifact: artifactMock.object(),
                    prompted: true
                };

                await performFolderActionAndSavePreference(request, FolderAction.openInCurrentWindow, services);

                // Should auto-save without showing dialog
                assert.ok(!showInformationMessageStub.called, 'Should not show dialog');
                localFolderServiceMock.verify(l => l.updateLocalFolder(artifactMock.object(), folderUri), Times.Once());
            });

            it('should not save when behavior is never', async () => {
                configurationProviderMock.setup(c => c.get('LocalFolderSaveBehavior', It.IsAny())).returns(LocalFolderSaveBehavior.never);
                executeCommandStub.resolves();

                const services: LocalFolderServices = {
                    localFolderService: localFolderServiceMock.object(),
                    configurationProvider: configurationProviderMock.object()
                };
                const request: FolderActionRequest = {
                    folderUri,
                    artifact: artifactMock.object(),
                    prompted: true
                };

                await performFolderActionAndSavePreference(request, FolderAction.openInCurrentWindow, services);

                // Should not save or show dialog
                assert.ok(!showInformationMessageStub.called, 'Should not show dialog');
                localFolderServiceMock.verify(l => l.updateLocalFolder(It.IsAny(), It.IsAny()), Times.Never());
            });
        });
    });

    describe('showFolderActionAndSavePreference', () => {
        const folderUri = vscode.Uri.file('/test/folder');
        const testMessage = 'Test message';

        let artifactMock: Mock<IArtifact>;
        let localFolderServiceMock: Mock<ILocalFolderService>;
        let configurationProviderMock: Mock<IConfigurationProvider>;
        let showInformationMessageStub: sinon.SinonStub;
        let executeCommandStub: sinon.SinonStub;

        beforeEach(() => {
            artifactMock = new Mock<IArtifact>();
            localFolderServiceMock = new Mock<ILocalFolderService>();
            configurationProviderMock = new Mock<IConfigurationProvider>();

            artifactMock.setup(a => a.displayName).returns('Test Artifact');

            showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
            executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');

            localFolderServiceMock.setup(l => l.updateLocalFolder(It.IsAny(), It.IsAny())).returnsAsync(undefined);
            configurationProviderMock.setup(c => c.get(It.IsAny(), It.IsAny())).returns(LocalFolderSaveBehavior.never);
        });

        afterEach(() => {
            sinon.restore();
        });

        it('should show dialog and perform selected action', async () => {
            showInformationMessageStub.onFirstCall().resolves({ title: 'Open in new window', action: FolderAction.openInNewWindow });
            executeCommandStub.resolves();

            const services: LocalFolderServices = {
                localFolderService: localFolderServiceMock.object(),
                configurationProvider: configurationProviderMock.object()
            };
            const request: FolderActionRequest = {
                folderUri,
                artifact: artifactMock.object(),
                prompted: false
            };

            const result = await showFolderActionAndSavePreference(testMessage, request, services);

            assert.strictEqual(result, FolderAction.openInNewWindow);
            assert.ok(executeCommandStub.calledWith('vscode.openFolder', folderUri, true));
        });

        it('should return undefined when user cancels dialog', async () => {
            showInformationMessageStub.resolves(undefined);

            const services: LocalFolderServices = {
                localFolderService: localFolderServiceMock.object(),
                configurationProvider: configurationProviderMock.object()
            };
            const request: FolderActionRequest = {
                folderUri,
                artifact: artifactMock.object(),
                prompted: false
            };

            const result = await showFolderActionAndSavePreference(testMessage, request, services);

            assert.strictEqual(result, undefined);
            assert.ok(!executeCommandStub.called, 'Should not perform any action');
        });

        it('should pass options to showFolderActionDialog', async () => {
            showInformationMessageStub.resolves({ title: 'Do nothing', action: FolderAction.doNothing });

            const services: LocalFolderServices = {
                localFolderService: localFolderServiceMock.object(),
                configurationProvider: configurationProviderMock.object()
            };
            const request: FolderActionRequest = {
                folderUri,
                artifact: artifactMock.object(),
                prompted: false
            };

            await showFolderActionAndSavePreference(
                testMessage,
                request,
                services,
                { modal: true, includeDoNothing: false }
            );

            const [message, options] = showInformationMessageStub.firstCall.args;
            assert.strictEqual(message, testMessage);
            assert.deepStrictEqual(options, { modal: true });
        });

        it('should integrate with performFolderActionAndSavePreference for workspace-updating actions', async () => {
            configurationProviderMock.setup(c => c.get('LocalFolderSaveBehavior', It.IsAny())).returns(LocalFolderSaveBehavior.prompt);
            showInformationMessageStub.onFirstCall().resolves({ title: 'Open in current window', action: FolderAction.openInCurrentWindow });
            showInformationMessageStub.onSecondCall().resolves('Yes'); // Save preference
            executeCommandStub.resolves();

            const services: LocalFolderServices = {
                localFolderService: localFolderServiceMock.object(),
                configurationProvider: configurationProviderMock.object()
            };
            const request: FolderActionRequest = {
                folderUri,
                artifact: artifactMock.object(),
                prompted: true
            };

            const result = await showFolderActionAndSavePreference(testMessage, request, services);

            assert.strictEqual(result, FolderAction.openInCurrentWindow);
            // Should have shown both folder action dialog and save preference dialog
            assert.strictEqual(showInformationMessageStub.callCount, 2);
            // First call: folder action dialog
            assert.strictEqual(showInformationMessageStub.firstCall.args[0], testMessage);
            // Second call: save preference dialog (modal)
            assert.ok(showInformationMessageStub.secondCall.args[0].includes('remember folder'));
            assert.deepStrictEqual(showInformationMessageStub.secondCall.args[1], { modal: true });
        });

        it('should handle doNothing action without performing any folder operation', async () => {
            showInformationMessageStub.resolves({ title: 'Do nothing', action: FolderAction.doNothing });

            const services: LocalFolderServices = {
                localFolderService: localFolderServiceMock.object(),
                configurationProvider: configurationProviderMock.object()
            };
            const request: FolderActionRequest = {
                folderUri,
                artifact: artifactMock.object(),
                prompted: false
            };

            const result = await showFolderActionAndSavePreference(testMessage, request, services);

            assert.strictEqual(result, FolderAction.doNothing);
            assert.ok(!executeCommandStub.called, 'Should not execute any command');
        });
    });
});
