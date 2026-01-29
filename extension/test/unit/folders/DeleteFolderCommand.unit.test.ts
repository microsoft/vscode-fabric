// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { DeleteFolderCommand } from '../../../src/folders/DeleteFolderCommand';
import { IFabricCommandManager } from '../../../src/commands/IFabricCommandManager';
import { IWorkspaceFolder, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { ILogger, TelemetryService, TelemetryActivity, UserCancelledError, FabricError } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { verifyAddOrUpdateProperties } from '../../utilities/moqUtilities';
import { FolderTreeNode } from '../../../src/workspace/treeNodes/FolderTreeNode';
import { FabricWorkspaceDataProvider } from '../../../src/workspace/treeView';

describe('DeleteFolderCommand', function () {
    let commandManagerMock: Mock<IFabricCommandManager>;
    let loggerMock: Mock<ILogger>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let dataProviderMock: Mock<FabricWorkspaceDataProvider>;
    let command: DeleteFolderCommand;
    let contextMock: Mock<vscode.ExtensionContext>;

    let showErrorMessageStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;

    const workspaceId = 'workspace-123';
    const folderId = 'folder-456';
    const folderName = 'Test Folder';

    beforeEach(function () {
        contextMock = new Mock<vscode.ExtensionContext>();
        loggerMock = new Mock<ILogger>();
        telemetryServiceMock = new Mock<TelemetryService>();
        commandManagerMock = new Mock<IFabricCommandManager>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        dataProviderMock = new Mock<FabricWorkspaceDataProvider>();
        telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();

        // Setup logger mock
        loggerMock.setup(x => x.error(It.IsAny())).returns(undefined);
        loggerMock.setup(x => x.debug(It.IsAny())).returns(undefined);
        loggerMock.setup(x => x.log(It.IsAny())).returns(undefined);

        // Setup command manager mock
        commandManagerMock.setup(x => x.logger).returns(loggerMock.object());
        commandManagerMock.setup(x => x.telemetryService).returns(telemetryServiceMock.object());
        commandManagerMock.setup(x => x.workspaceManager).returns(workspaceManagerMock.object());
        commandManagerMock.setup(x => x.dataProvider).returns(dataProviderMock.object());

        // Setup data provider mock
        dataProviderMock.setup(x => x.refresh()).returns(undefined);

        // Setup telemetry
        telemetryServiceMock.setup(x => x.sendTelemetryEvent(It.IsAny(), It.IsAny(), It.IsAny()))
            .returns(undefined);
        telemetryActivityMock.setup(instance => instance.addOrUpdateProperties(It.IsAny()))
            .returns(undefined);

        // Stub VS Code window methods
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
        showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');

        // Create command instance
        command = new DeleteFolderCommand(commandManagerMock.object());
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('executeInternal', function () {
        it('should show error when folder node is undefined', async function () {
            await executeCommand(undefined);

            assert.ok(showErrorMessageStub.calledOnce, 'showErrorMessage should be called once');
            workspaceManagerMock.verify(x => x.deleteFolder(It.IsAny(), It.IsAny()), Times.Never());
        });

        it('should throw UserCancelledError when folder has children', async function () {
            const folderNode = createFolderNodeWithChildren();

            await assert.rejects(
                async () => await executeCommand(folderNode),
                (err: any) => err instanceof UserCancelledError && err.stepName === 'folderNotEmpty'
            );

            workspaceManagerMock.verify(x => x.deleteFolder(It.IsAny(), It.IsAny()), Times.Never());
        });

        it('should throw UserCancelledError when user cancels confirmation', async function () {
            const folderNode = createEmptyFolderNode();
            showWarningMessageStub.resolves(undefined); // User cancelled

            await assert.rejects(
                async () => await executeCommand(folderNode),
                (err: any) => err instanceof UserCancelledError && err.stepName === 'deleteConfirmation'
            );

            workspaceManagerMock.verify(x => x.deleteFolder(It.IsAny(), It.IsAny()), Times.Never());
        });

        it('should delete folder when user confirms', async function () {
            const folderNode = createEmptyFolderNode();
            showWarningMessageStub.resolves('Delete'); // User confirmed
            workspaceManagerMock.setup(x => x.deleteFolder(workspaceId, folderId))
                .returnsAsync({ status: 200 } as any);

            await executeCommand(folderNode);

            workspaceManagerMock.verify(x => x.deleteFolder(workspaceId, folderId), Times.Once());
            verifyAddOrUpdateProperties(telemetryActivityMock, 'workspaceId', workspaceId);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'folderId', folderId);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '200');
            dataProviderMock.verify(x => x.refresh(), Times.Once());
        });

        it('should throw FabricError when API call fails', async function () {
            const folderNode = createEmptyFolderNode();
            showWarningMessageStub.resolves('Delete');
            workspaceManagerMock.setup(x => x.deleteFolder(workspaceId, folderId))
                .returnsAsync({ status: 400, parsedBody: { errorCode: 'SomeError' } } as any);

            await assert.rejects(
                async () => await executeCommand(folderNode),
                (err: any) => err instanceof FabricError && err.nonLocalizedMessage === 'SomeError'
            );
        });

        it('should throw FabricError with special message when folder is not empty from API', async function () {
            const folderNode = createEmptyFolderNode();
            showWarningMessageStub.resolves('Delete');
            workspaceManagerMock.setup(x => x.deleteFolder(workspaceId, folderId))
                .returnsAsync({ status: 400, parsedBody: { errorCode: 'FolderNotEmpty' } } as any);

            await assert.rejects(
                async () => await executeCommand(folderNode),
                (err: any) => err instanceof FabricError && err.nonLocalizedMessage === 'FolderNotEmpty'
            );
        });

        it('should add telemetry properties on failure', async function () {
            const folderNode = createEmptyFolderNode();
            showWarningMessageStub.resolves('Delete');
            workspaceManagerMock.setup(x => x.deleteFolder(workspaceId, folderId))
                .returnsAsync({
                    status: 400,
                    parsedBody: { errorCode: 'SomeError', requestId: 'req-123' }
                } as any);

            try {
                await executeCommand(folderNode);
            } catch {
                // Expected to throw
            }

            verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '400');
            verifyAddOrUpdateProperties(telemetryActivityMock, 'errorCode', 'SomeError');
            verifyAddOrUpdateProperties(telemetryActivityMock, 'requestId', 'req-123');
        });
    });

    it('should use correct command name', function () {
        assert.strictEqual(command.commandName, 'vscode-fabric.deleteFolder');
    });

    it('should use correct telemetry event name', function () {
        assert.strictEqual(command.telemetryEventName, 'folder/delete');
    });

    async function executeCommand(...args: any[]): Promise<void> {
        await command['executeInternal'](telemetryActivityMock.object(), ...args);
    }

    function createEmptyFolderNode(): FolderTreeNode {
        const folder: IWorkspaceFolder = {
            id: folderId,
            displayName: folderName,
            workspaceId: workspaceId,
        };
        return new FolderTreeNode(contextMock.object(), folder);
    }

    function createFolderNodeWithChildren(): FolderTreeNode {
        const folder: IWorkspaceFolder = {
            id: folderId,
            displayName: folderName,
            workspaceId: workspaceId,
        };
        const node = new FolderTreeNode(contextMock.object(), folder);
        // Add a child to make hasChildren() return true
        const childFolder: IWorkspaceFolder = {
            id: 'child-folder',
            displayName: 'Child Folder',
            workspaceId: workspaceId,
        };
        const childNode = new FolderTreeNode(contextMock.object(), childFolder);
        node.addFolder(childNode);
        return node;
    }
});
