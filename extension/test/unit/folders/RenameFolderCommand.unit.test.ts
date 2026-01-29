// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { RenameFolderCommand } from '../../../src/folders/RenameFolderCommand';
import { IFabricCommandManager } from '../../../src/commands/IFabricCommandManager';
import { IWorkspaceFolder, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { ILogger, TelemetryService, TelemetryActivity, UserCancelledError, FabricError } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { verifyAddOrUpdateProperties } from '../../utilities/moqUtilities';
import { FolderTreeNode } from '../../../src/workspace/treeNodes/FolderTreeNode';
import { FabricWorkspaceDataProvider } from '../../../src/workspace/treeView';

describe('RenameFolderCommand', function () {
    let commandManagerMock: Mock<IFabricCommandManager>;
    let loggerMock: Mock<ILogger>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let dataProviderMock: Mock<FabricWorkspaceDataProvider>;
    let command: RenameFolderCommand;
    let contextMock: Mock<vscode.ExtensionContext>;

    let showInputBoxStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;

    const workspaceId = 'workspace-123';
    const folderId = 'folder-456';
    const currentFolderName = 'Current Folder';
    const newFolderName = 'New Folder Name';

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
        showInputBoxStub = sinon.stub(vscode.window, 'showInputBox');
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');

        // Create command instance
        command = new RenameFolderCommand(commandManagerMock.object());
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('executeInternal', function () {
        it('should show error when folder node is undefined', async function () {
            await executeCommand(undefined);

            assert.ok(showErrorMessageStub.calledOnce, 'showErrorMessage should be called once');
            workspaceManagerMock.verify(x => x.renameFolder(It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
        });

        it('should throw UserCancelledError when input is cancelled', async function () {
            const folderNode = createFolderNode();
            showInputBoxStub.resolves(undefined);

            await assert.rejects(
                async () => await executeCommand(folderNode),
                (err: any) => err instanceof UserCancelledError
            );

            workspaceManagerMock.verify(x => x.renameFolder(It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
        });

        it('should throw UserCancelledError when name is unchanged', async function () {
            const folderNode = createFolderNode();
            showInputBoxStub.resolves(currentFolderName);

            await assert.rejects(
                async () => await executeCommand(folderNode),
                (err: any) => err instanceof UserCancelledError
            );

            workspaceManagerMock.verify(x => x.renameFolder(It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
        });

        it('should throw UserCancelledError when trimmed name is unchanged', async function () {
            const folderNode = createFolderNode();
            showInputBoxStub.resolves(`  ${currentFolderName}  `);

            await assert.rejects(
                async () => await executeCommand(folderNode),
                (err: any) => err instanceof UserCancelledError
            );

            workspaceManagerMock.verify(x => x.renameFolder(It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
        });

        it('should rename folder when new name is provided', async function () {
            const folderNode = createFolderNode();
            showInputBoxStub.resolves(newFolderName);
            workspaceManagerMock.setup(x => x.renameFolder(workspaceId, folderId, newFolderName))
                .returnsAsync({ status: 200 } as any);

            await executeCommand(folderNode);

            workspaceManagerMock.verify(x => x.renameFolder(workspaceId, folderId, newFolderName), Times.Once());
            verifyAddOrUpdateProperties(telemetryActivityMock, 'workspaceId', workspaceId);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'folderId', folderId);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '200');
            dataProviderMock.verify(x => x.refresh(), Times.Once());
        });

        it('should trim the new folder name before renaming', async function () {
            const folderNode = createFolderNode();
            showInputBoxStub.resolves('  Trimmed Name  ');
            workspaceManagerMock.setup(x => x.renameFolder(workspaceId, folderId, 'Trimmed Name'))
                .returnsAsync({ status: 200 } as any);

            await executeCommand(folderNode);

            workspaceManagerMock.verify(x => x.renameFolder(workspaceId, folderId, 'Trimmed Name'), Times.Once());
        });

        it('should throw FabricError when API call fails', async function () {
            const folderNode = createFolderNode();
            showInputBoxStub.resolves(newFolderName);
            workspaceManagerMock.setup(x => x.renameFolder(workspaceId, folderId, newFolderName))
                .returnsAsync({ status: 400, parsedBody: { errorCode: 'InvalidName' } } as any);

            await assert.rejects(
                async () => await executeCommand(folderNode),
                (err: any) => err instanceof FabricError && err.nonLocalizedMessage === 'InvalidName'
            );
        });

        it('should add telemetry properties on failure', async function () {
            const folderNode = createFolderNode();
            showInputBoxStub.resolves(newFolderName);
            workspaceManagerMock.setup(x => x.renameFolder(workspaceId, folderId, newFolderName))
                .returnsAsync({
                    status: 400,
                    parsedBody: { errorCode: 'InvalidName', requestId: 'req-123' }
                } as any);

            try {
                await executeCommand(folderNode);
            } catch {
                // Expected to throw
            }

            verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '400');
            verifyAddOrUpdateProperties(telemetryActivityMock, 'errorCode', 'InvalidName');
            verifyAddOrUpdateProperties(telemetryActivityMock, 'requestId', 'req-123');
        });

        it('should pre-fill input box with current folder name', async function () {
            const folderNode = createFolderNode();
            showInputBoxStub.resolves(undefined);

            try {
                await executeCommand(folderNode);
            } catch {
                // Expected to throw UserCancelledError
            }

            assert.ok(
                showInputBoxStub.calledOnce &&
                showInputBoxStub.firstCall.args[0].value === currentFolderName,
                'Input box should be pre-filled with current folder name'
            );
        });
    });

    it('should use correct command name', function () {
        assert.strictEqual(command.commandName, 'vscode-fabric.renameFolder');
    });

    it('should use correct telemetry event name', function () {
        assert.strictEqual(command.telemetryEventName, 'folder/rename');
    });

    async function executeCommand(...args: any[]): Promise<void> {
        await command['executeInternal'](telemetryActivityMock.object(), ...args);
    }

    function createFolderNode(): FolderTreeNode {
        const folder: IWorkspaceFolder = {
            id: folderId,
            displayName: currentFolderName,
            workspaceId: workspaceId,
        };
        return new FolderTreeNode(contextMock.object(), folder);
    }
});
