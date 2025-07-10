import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import { deleteArtifactCommand } from '../../../artifactManager/deleteArtifactCommand';
import { IApiClientResponse, IArtifactManager, IWorkspaceManager, IArtifact } from '@fabric/vscode-fabric-api';
import { FabricError, ILogger, TelemetryActivity} from '@fabric/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../../../TelemetryEventNames';
import { FabricWorkspaceDataProvider } from '../../../workspace/treeView';
import { verifyAddOrUpdateProperties, verifyAddOrUpdatePropertiesNever } from '../../utilities/moqUtilities';
import { UserCancelledError } from '@fabric/vscode-fabric-util';

const artifactDisplayName = 'Test Artifact';
const artifactId = 'Test Artifact Id';

describe('deleteArtifactCommand', () => {
    let artifactManagerMock: Mock<IArtifactManager>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let artifactMock: Mock<IArtifact>;
    let fileSystemMock: Mock<vscode.FileSystem>;
    let loggerMock: Mock<ILogger>;
    let dataProviderMock: Mock<FabricWorkspaceDataProvider>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;

    let showInformationMessageStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let workspaceFoldersStub: sinon.SinonStub;

    beforeEach(() => {
        artifactManagerMock = new Mock<IArtifactManager>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        artifactMock = new Mock<IArtifact>();
        fileSystemMock = new Mock<vscode.FileSystem>();
        loggerMock = new Mock<ILogger>();

        artifactMock.setup(a => a.id).returns(artifactId);
        artifactMock.setup(a => a.displayName).returns(artifactDisplayName);

        fileSystemMock.setup(fs => fs.stat(It.IsAny()))
            .returns(Promise.resolve({ type: vscode.FileType.Directory } as vscode.FileStat));
        fileSystemMock.setup(fs => fs.delete(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve());

        artifactManagerMock.setup(am => am.deleteArtifact(It.IsAny()))
            .returns(Promise.resolve({ status: 200 }));

        workspaceManagerMock.setup(wm => wm.getLocalFolderForArtifact(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(undefined));

        loggerMock.setup(l => l.reportExceptionTelemetryAndLog(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()))
            .returns();

        telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();
        telemetryActivityMock.setup(instance => instance.addOrUpdateProperties(It.IsAny()))
            .returns(undefined);
        
        dataProviderMock = new Mock<FabricWorkspaceDataProvider>();
        dataProviderMock.setup(instance => instance.refresh())
            .returns(undefined);

        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
        workspaceFoldersStub = sinon.stub(vscode.workspace, 'workspaceFolders').value(undefined);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('Unknown local folder', async () => {
        // Arrange
        showInformationMessageStub.callsFake(async (msg, opts, ...items) => {
            assert.strictEqual(opts.modal, false, 'showInformationMessage modal');
            assert.strictEqual(msg, `Deleted ${artifactDisplayName}`, 'showInformationMessage message');
        });
        showWarningMessageStub.callsFake(async (msg, opts, ...items) => {
            assert.strictEqual(items.length, 1); // Only one option should be present ("Delete")
            assert.ok(items[0].title.includes('Delete'), 'The action item should contain "Delete" in the title');
            return items[0]; // Simulate user selecting the only option
        });

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(
            am => am.deleteArtifact(
                It.Is<IArtifact>(a => a.id === artifactId)
            ),
            Times.Once()
        );
        workspaceManagerMock.verify(
            wm => wm.getLocalFolderForArtifact(
                It.Is<IArtifact>(a => a.id === artifactId), 
                It.Is<{ createIfNotExists: boolean }>(options => options.createIfNotExists === false)
            ), 
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.stat(It.IsAny()),
            Times.Never()
        );
        fileSystemMock.verify(
            fs => fs.delete(It.IsAny(), It.IsAny()),
            Times.Never()
        );
        
        assert.strictEqual(showInformationMessageStub.callCount, 1, 'showInformationMessage call count');
        assert.strictEqual(showWarningMessageStub.callCount, 1, 'showWarningMessage call count');
        assert.strictEqual(showErrorMessageStub.callCount, 0, 'showErrorMessage call count');
        assert.strictEqual(workspaceFoldersStub.callCount, 0, 'workspaceFoldersStub call count');

        dataProviderMock.verify(
            instance => instance.refresh(),
            Times.Once()
        );

        verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '200');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'requestId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'errorCode');
    });

    it('Unknown local folder, user cancels', async () => {
        // Arrange
        showWarningMessageStub.resolves(undefined);

        // Act & Assert
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof UserCancelledError, 'Should throw a UserCancelledError');
                assert.ok(err.stepName, 'Should have a stepName');
                assert.strictEqual(err.stepName!, 'remoteOnly', 'Step name');
                return true;
            } 
        );

        // Assert
        artifactManagerMock.verify(
            am => am.deleteArtifact(
                It.Is<IArtifact>(a => a.id === artifactId)
            ),
            Times.Never()
        );
        workspaceManagerMock.verify(
            wm => wm.getLocalFolderForArtifact(
                It.Is<IArtifact>(a => a.id === artifactId), 
                It.Is<{ createIfNotExists: boolean }>(options => options.createIfNotExists === false)
            ), 
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.stat(It.IsAny()),
            Times.Never()
        );
        fileSystemMock.verify(
            fs => fs.delete(It.IsAny(), It.IsAny()),
            Times.Never()
        );
        assert.strictEqual(showWarningMessageStub.callCount, 1, 'showWarningMessage call count');
        assert.strictEqual(showErrorMessageStub.callCount, 0, 'showErrorMessage call count');
        assert.strictEqual(workspaceFoldersStub.callCount, 0, 'workspaceFoldersStub call count');
    });

    it('Known local folder exists, remote only', async () => {
        // Arrange
        const localFolder = vscode.Uri.file(`/path/to/local/folder/${artifactId}`);
        workspaceManagerMock
            .setup(wm => wm.getLocalFolderForArtifact(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(localFolder));
        showWarningMessageStub.callsFake(async (msg, opts, ...items) => {
            assert.strictEqual(items.length, 2);
            return items[0];
        });

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(
            am => am.deleteArtifact(
                It.Is<IArtifact>(a => a.id === artifactId)
            ),
            Times.Once()
        );
        workspaceManagerMock.verify(
            wm => wm.getLocalFolderForArtifact(
                It.Is<IArtifact>(a => a.id === artifactId), 
                It.Is<{ createIfNotExists: boolean }>(options => options.createIfNotExists === false)
            ), 
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.stat(It.IsAny()),
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.delete(It.IsAny(), It.IsAny()),
            Times.Never()
        );
    });

    it('Known local folder exists, local and remote', async () => {
        // Arrange
        const localFolder = vscode.Uri.file(`/path/to/local/folder/${artifactId}`);
        workspaceManagerMock
            .setup(wm => wm.getLocalFolderForArtifact(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(localFolder));
        // Simulate user choosing "Local and Remote" (second item)
        showWarningMessageStub.callsFake(async (msg, opts, ...items) => {
            assert.strictEqual(items.length, 2);
            return items[1];
        });

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(
            am => am.deleteArtifact(
                It.Is<IArtifact>(a => a.id === artifactId)
            ),
            Times.Once()
        );
        workspaceManagerMock.verify(
            wm => wm.getLocalFolderForArtifact(
                It.Is<IArtifact>(a => a.id === artifactId), 
                It.Is<{ createIfNotExists: boolean }>(options => options.createIfNotExists === false)
            ), 
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.stat(It.IsAny()),
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.delete(It.IsAny(), It.IsAny()),
            Times.Once()
        );
        assert.strictEqual(showWarningMessageStub.callCount, 1, 'showWarningMessage call count');
        assert.strictEqual(showErrorMessageStub.callCount, 0, 'showErrorMessage call count');
        assert.strictEqual(workspaceFoldersStub.callCount, 0, 'workspaceFoldersStub call count');
    });

    it('Known local folder exists, local and remote, workspace folder descendant', async () => {
        // Arrange
        const localFolder = vscode.Uri.file(`/path/to/local/folder/${artifactId}`);
        workspaceManagerMock
            .setup(wm => wm.getLocalFolderForArtifact(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(localFolder));
        workspaceFoldersStub.value([
            { uri: vscode.Uri.file('/path/to/local'), name: 'local', index: 0 } as vscode.WorkspaceFolder
        ]);
        // Simulate user choosing "Local and Remote" (second item)
        showWarningMessageStub.onFirstCall().callsFake(async (msg, opts, ...items) => {
            assert.strictEqual(opts.modal, true);
            assert.strictEqual(items.length, 2);
            return items[1];
        });
        // Simulate warning for folder open in workspace
        showWarningMessageStub.onSecondCall().callsFake(async (msg, opts, ...items) => {
            assert.strictEqual(opts.modal, false);
            assert.ok(msg.includes('currently open in the workspace.'));
            assert.strictEqual(items.length, 0);
            return undefined;
        });

        // Act & Assert
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof UserCancelledError, 'Should throw a UserCancelledError');
                assert.ok(err.stepName, 'Should have a stepName');
                assert.strictEqual(err.stepName!, 'folderActive', 'Step name');
                return true;
            } 
        );

        // Assert
        artifactManagerMock.verify(
            am => am.deleteArtifact(
                It.Is<IArtifact>(a => a.id === artifactId)
            ),
            Times.Never()
        );
        workspaceManagerMock.verify(
            wm => wm.getLocalFolderForArtifact(
                It.Is<IArtifact>(a => a.id === artifactId), 
                It.Is<{ createIfNotExists: boolean }>(options => options.createIfNotExists === false)
            ), 
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.stat(It.IsAny()),
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.delete(It.IsAny(), It.IsAny()),
            Times.Never()
        );
        assert.strictEqual(showWarningMessageStub.callCount, 2, 'showWarningMessage call count');
        assert.strictEqual(showErrorMessageStub.callCount, 0, 'showErrorMessage call count');
        assert.strictEqual(workspaceFoldersStub.callCount, 0, 'workspaceFoldersStub call count');
    });

    it('Known local folder exists, local and remote, not in workspace', async () => {
        // Arrange
        const localFolder = vscode.Uri.file(`/path/to/local/folder/${artifactId}`);
        workspaceManagerMock
            .setup(wm => wm.getLocalFolderForArtifact(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(localFolder));
        workspaceFoldersStub.value([
            { uri: vscode.Uri.file('/path/to/different'), name: 'different', index: 0 } as vscode.WorkspaceFolder
        ]);
        showWarningMessageStub.onFirstCall().callsFake(async (msg, opts, ...items) => {
            assert.strictEqual(opts.modal, true);
            assert.strictEqual(items.length, 2);
            return items[1];
        });

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(
            am => am.deleteArtifact(
                It.Is<IArtifact>(a => a.id === artifactId)
            ),
            Times.Once()
        );
        workspaceManagerMock.verify(
            wm => wm.getLocalFolderForArtifact(
                It.Is<IArtifact>(a => a.id === artifactId), 
                It.Is<{ createIfNotExists: boolean }>(options => options.createIfNotExists === false)
            ), 
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.stat(It.IsAny()),
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.delete(It.IsAny(), It.IsAny()),
            Times.Once()
        );
        loggerMock.verify(
            l => l.reportExceptionTelemetryAndLog(
                It.IsAny(), // methodName
                It.IsAny(), // errorEventName
                It.IsAny(), // exception
                It.IsAny(), // telemetryService
                It.IsAny() // properties
            ),
            Times.Never()
        );
        assert.strictEqual(showWarningMessageStub.callCount, 1, 'showWarningMessage call count');
        assert.strictEqual(showErrorMessageStub.callCount, 0, 'showErrorMessage call count');
        assert.strictEqual(workspaceFoldersStub.callCount, 0, 'workspaceFoldersStub call count');
    });

    it('Known local folder exists, user cancels', async () => {
        // Arrange
        const localFolder = vscode.Uri.file(`/path/to/local/folder/${artifactId}`);
        workspaceManagerMock
            .setup(wm => wm.getLocalFolderForArtifact(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(localFolder));
        showWarningMessageStub.resolves(undefined);

        // Act & Assert
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof UserCancelledError, 'Should throw a UserCancelledError');
                assert.ok(err.stepName, 'Should have a stepName');
                assert.strictEqual(err.stepName!, 'folderOpened', 'Step name');
                return true;
            } 
        );

        // Assert
        artifactManagerMock.verify(
            am => am.deleteArtifact(
                It.Is<IArtifact>(a => a.id === artifactId)
            ),
            Times.Never()
        );
        workspaceManagerMock.verify(
            wm => wm.getLocalFolderForArtifact(
                It.Is<IArtifact>(a => a.id === artifactId), 
                It.Is<{ createIfNotExists: boolean }>(options => options.createIfNotExists === false)
            ), 
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.stat(It.IsAny()),
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.delete(It.IsAny(), It.IsAny()),
            Times.Never()
        );
        assert.strictEqual(showWarningMessageStub.callCount, 1, 'showWarningMessage call count');
        assert.strictEqual(showErrorMessageStub.callCount, 0, 'showErrorMessage call count');
        assert.strictEqual(workspaceFoldersStub.callCount, 0, 'workspaceFoldersStub call count');
    });

    it('Known local folder not exists', async () => {
        // Arrange
        const localFolder = vscode.Uri.file(`/path/to/local/folder/${artifactId}`);
        workspaceManagerMock
            .setup(wm => wm.getLocalFolderForArtifact(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(localFolder));
        showWarningMessageStub.callsFake(async (msg, opts, ...items) => {
            assert.strictEqual(items.length, 1); // Only one option should be present ("Delete")
            assert.ok(items[0].title.includes('Delete'), 'The action item should contain "Delete" in the title');
            return items[0]; // Simulate user selecting the only option
        });
        fileSystemMock
            .setup(fs => fs.stat(It.IsAny()))
            .throws(new Error('File not found')); // Simulate local folder not existing

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(
            am => am.deleteArtifact(
                It.Is<IArtifact>(a => a.id === artifactId)
            ),
            Times.Once()
        );
        workspaceManagerMock.verify(
            wm => wm.getLocalFolderForArtifact(
                It.Is<IArtifact>(a => a.id === artifactId), 
                It.Is<{ createIfNotExists: boolean }>(options => options.createIfNotExists === false)
            ), 
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.stat(It.IsAny()),
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.delete(It.IsAny(), It.IsAny()),
            Times.Never()
        );
        assert.strictEqual(showWarningMessageStub.callCount, 1, 'showWarningMessage call count');
        assert.strictEqual(showErrorMessageStub.callCount, 0, 'showErrorMessage call count');
        assert.strictEqual(workspaceFoldersStub.callCount, 0, 'workspaceFoldersStub call count');
    });

    it('Known local folder not exists, user cancels', async () => {
        // Arrange
        const localFolder = vscode.Uri.file(`/path/to/local/folder/${artifactId}`);
        workspaceManagerMock
            .setup(wm => wm.getLocalFolderForArtifact(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(localFolder));
        showWarningMessageStub.callsFake(async (msg, opts, ...items) => {
            assert.strictEqual(items.length, 1); // Only one option should be present ("Delete")
            assert.ok(items[0].title.includes('Delete'), 'The action item should contain "Delete" in the title');
            return undefined; // Simulate user canceling the action
        });
        fileSystemMock
            .setup(fs => fs.stat(It.IsAny()))
            .throws(new Error('File not found')); // Simulate local folder not existing

        // Act & Assert
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof UserCancelledError, 'Should throw a UserCancelledError');
                assert.ok(err.stepName, 'Should have a stepName');
                assert.strictEqual(err.stepName!, 'remoteOnly', 'Step name');
                return true;
            } 
        );

        // Assert
        artifactManagerMock.verify(
            am => am.deleteArtifact(
                It.Is<IArtifact>(a => a.id === artifactId)
            ),
            Times.Never()
        );
        workspaceManagerMock.verify(
            wm => wm.getLocalFolderForArtifact(
                It.Is<IArtifact>(a => a.id === artifactId), 
                It.Is<{ createIfNotExists: boolean }>(options => options.createIfNotExists === false)
            ), 
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.stat(It.IsAny()),
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.delete(It.IsAny(), It.IsAny()),
            Times.Never()
        );
        assert.strictEqual(showWarningMessageStub.callCount, 1, 'showWarningMessage call count');
        assert.strictEqual(showErrorMessageStub.callCount, 0, 'showErrorMessage call count');
        assert.strictEqual(workspaceFoldersStub.callCount, 0, 'workspaceFoldersStub call count');
    });

    it('Error: API error', async () => {
        // Arrange
        const localFolder = vscode.Uri.file(`/path/to/local/folder/${artifactId}`);
        workspaceManagerMock
            .setup(wm => wm.getLocalFolderForArtifact(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(localFolder));
        showWarningMessageStub.callsFake(async (msg, opts, ...items) => {
            assert.strictEqual(items.length, 2);
            return items[1];
        });
        showInformationMessageStub.callsFake(async (msg, opts, ...items) => {
            assert.strictEqual(opts.modal, false, 'showInformationMessage modal');
            assert(msg.startsWith(`Error deleting ${artifactDisplayName}`),'showInformationMessage message');
        });

        const apiClientResponseMock = new Mock<IApiClientResponse>();
        const errorResponseBody = {
            errorCode: 'InvalidInput',
            message: 'The input was invalid',
            requestId: 'req-12345',
        };
        apiClientResponseMock.setup(instance => instance.status).returns(400);
        apiClientResponseMock.setup(instance => instance.parsedBody).returns(errorResponseBody);
        artifactManagerMock.setup(instance => instance.deleteArtifact(It.IsAny()))
            .returns(Promise.resolve(apiClientResponseMock.object()));

        // Act & Assert
        let error: Error | undefined = undefined;
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof FabricError, 'should throw a FabricError');
                error = err;
                return true;
            }
        );

        // Assert
        artifactManagerMock.verify(
            am => am.deleteArtifact(
                It.Is<IArtifact>(a => a.id === artifactId)
            ),
            Times.Once()
        );
        workspaceManagerMock.verify(
            wm => wm.getLocalFolderForArtifact(
                It.Is<IArtifact>(a => a.id === artifactId), 
                It.Is<{ createIfNotExists: boolean }>(options => options.createIfNotExists === false)
            ), 
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.stat(It.IsAny()),
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.delete(It.IsAny(), It.IsAny()),
            Times.Never()
        );
        
        assert.strictEqual(showInformationMessageStub.callCount, 0, 'showInformationMessage call count');
        assert.strictEqual(showWarningMessageStub.callCount, 1, 'showWarningMessage call count');
        assert.strictEqual(showErrorMessageStub.callCount, 0, 'showErrorMessage call count');
        assert.strictEqual(workspaceFoldersStub.callCount, 0, 'workspaceFoldersStub call count');

        dataProviderMock.verify(
            instance => instance.refresh(),
            Times.Never()
        );

        assert.ok(error!.message.includes('Error deleting'), 'Error message content should include "Error deleting"');
        
        verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '400');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'requestId', 'req-12345');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'errorCode', 'InvalidInput');
    });

    it('Error: Failed to delete local folder', async () => {
        // Arrange
        const localFolder = vscode.Uri.file(`/path/to/local/folder/${artifactId}`);
        const errorText = 'Test - Failed to delete local folder - Test';
        workspaceManagerMock
            .setup(wm => wm.getLocalFolderForArtifact(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(localFolder));
        fileSystemMock
            .setup(fs => fs.delete(It.IsAny(), It.IsAny()))
            .throws(new Error(errorText));
        showWarningMessageStub.callsFake(async (msg, opts, ...items) => {
            assert.strictEqual(items.length, 2);
            return items[1];
        });
        showInformationMessageStub.callsFake(async (msg, opts, ...items) => {
            assert.strictEqual(items.length, 0);
            return undefined;
        });

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(
            am => am.deleteArtifact(
                It.Is<IArtifact>(a => a.id === artifactId)
            ),
            Times.Once()
        );
        workspaceManagerMock.verify(
            wm => wm.getLocalFolderForArtifact(
                It.Is<IArtifact>(a => a.id === artifactId), 
                It.Is<{ createIfNotExists: boolean }>(options => options.createIfNotExists === false)
            ), 
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.stat(It.IsAny()),
            Times.Once()
        );
        fileSystemMock.verify(
            fs => fs.delete(It.IsAny(), It.IsAny()),
            Times.Once()
        );
        assert.strictEqual(showWarningMessageStub.callCount, 1, 'showWarningMessage call count');
        assert.strictEqual(showInformationMessageStub.callCount, 2, 'showInformationMessage call count');
        assert.strictEqual(workspaceFoldersStub.callCount, 0, 'workspaceFoldersStub call count');

        // Second information message should be about the failure to delete the local folder
        assert.ok(showInformationMessageStub.secondCall.args[0].includes(errorText), 'Error message should be shown');        
    });

    async function executeCommand(): Promise<void> {
        await deleteArtifactCommand(
            artifactMock.object(),
            artifactManagerMock.object(),
            workspaceManagerMock.object(),
            fileSystemMock.object(),
            null, // telemetryService is not used in this test
            loggerMock.object(),
            dataProviderMock.object(),
            telemetryActivityMock.object(),
        );
    }

});