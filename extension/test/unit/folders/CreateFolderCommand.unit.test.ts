// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { CreateFolderCommand } from '../../../src/commands/folders/CreateFolderCommand';
import { IFabricCommandManager } from '../../../src/commands/IFabricCommandManager';
import { IWorkspaceFolder, IWorkspaceManager, IFolderManager } from '@microsoft/vscode-fabric-api';
import { ILogger, TelemetryService, TelemetryActivity, UserCancelledError } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { verifyAddOrUpdateProperties } from '../../utilities/moqUtilities';
import { FolderTreeNode } from '../../../src/workspace/treeNodes/FolderTreeNode';
import { FabricWorkspaceDataProvider } from '../../../src/workspace/treeView';

describe('CreateFolderCommand', function () {
    let commandManagerMock: Mock<IFabricCommandManager>;
    let loggerMock: Mock<ILogger>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let folderManagerMock: Mock<IFolderManager>;
    let dataProviderMock: Mock<FabricWorkspaceDataProvider>;
    let command: CreateFolderCommand;
    let contextMock: Mock<vscode.ExtensionContext>;

    let showInputBoxStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;

    const workspaceId = 'workspace-123';
    const folderId = 'folder-456';
    const parentFolderId = 'parent-folder-789';
    const folderName = 'New Test Folder';

    beforeEach(function () {
        contextMock = new Mock<vscode.ExtensionContext>();
        loggerMock = new Mock<ILogger>();
        telemetryServiceMock = new Mock<TelemetryService>();
        commandManagerMock = new Mock<IFabricCommandManager>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        folderManagerMock = new Mock<IFolderManager>();
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
        commandManagerMock.setup(x => x.folderManager).returns(folderManagerMock.object());
        commandManagerMock.setup(x => x.dataProvider).returns(dataProviderMock.object());

        // Setup workspace manager mock - default to connected
        workspaceManagerMock.setup(x => x.isConnected()).returnsAsync(true);

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
        command = new CreateFolderCommand(commandManagerMock.object());
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('executeInternal', function () {
        it('should show sign-in prompt when not connected', async function () {
            workspaceManagerMock.setup(x => x.isConnected()).returnsAsync(false);

            await executeCommand(undefined);

            folderManagerMock.verify(x => x.createFolder(It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
        });

        it('should show error when context node is undefined', async function () {
            await executeCommand(undefined);

            assert.ok(showErrorMessageStub.calledOnce, 'showErrorMessage should be called once');
        });

        it('should create folder from workspace node context', async function () {
            const workspaceNode = createMockWorkspaceTreeNode(workspaceId);
            showInputBoxStub.resolves(folderName);
            folderManagerMock.setup(x => x.createFolder(workspaceId, folderName, undefined))
                .returnsAsync({ status: 200, parsedBody: { id: folderId } } as any);

            await executeCommand(workspaceNode);

            folderManagerMock.verify(x => x.createFolder(workspaceId, folderName, undefined), Times.Once());
            verifyAddOrUpdateProperties(telemetryActivityMock, 'workspaceId', workspaceId);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'parentFolderId', 'root');
            verifyAddOrUpdateProperties(telemetryActivityMock, 'folderId', folderId);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '200');
            dataProviderMock.verify(x => x.refresh(), Times.Once());
        });

        it('should create folder from folder node context with parent folder id', async function () {
            const folder: IWorkspaceFolder = {
                id: parentFolderId,
                displayName: 'Parent Folder',
                workspaceId: workspaceId,
            };
            const folderNode = new FolderTreeNode(contextMock.object(), folder);
            showInputBoxStub.resolves(folderName);
            folderManagerMock.setup(x => x.createFolder(workspaceId, folderName, parentFolderId))
                .returnsAsync({ status: 200, parsedBody: { id: folderId } } as any);

            await executeCommand(folderNode);

            folderManagerMock.verify(x => x.createFolder(workspaceId, folderName, parentFolderId), Times.Once());
            verifyAddOrUpdateProperties(telemetryActivityMock, 'workspaceId', workspaceId);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'parentFolderId', parentFolderId);
        });

        it('should throw UserCancelledError when input is cancelled', async function () {
            const workspaceNode = createMockWorkspaceTreeNode(workspaceId);
            showInputBoxStub.resolves(undefined);

            await assert.rejects(
                async () => await executeCommand(workspaceNode),
                (err: any) => err instanceof UserCancelledError
            );
        });

        it('should throw UserCancelledError when input is empty', async function () {
            const workspaceNode = createMockWorkspaceTreeNode(workspaceId);
            showInputBoxStub.resolves('   ');

            await assert.rejects(
                async () => await executeCommand(workspaceNode),
                (err: any) => err instanceof UserCancelledError
            );
        });

        it('should throw FabricError when API call fails', async function () {
            const workspaceNode = createMockWorkspaceTreeNode(workspaceId);
            showInputBoxStub.resolves(folderName);
            folderManagerMock.setup(x => x.createFolder(workspaceId, folderName, undefined))
                .returnsAsync({ status: 400, parsedBody: { errorCode: 'InvalidName' } } as any);

            await assert.rejects(
                async () => await executeCommand(workspaceNode),
                (err: any) => err.nonLocalizedMessage === 'InvalidName'
            );
        });

        it('should trim folder name before creating', async function () {
            const workspaceNode = createMockWorkspaceTreeNode(workspaceId);
            showInputBoxStub.resolves('  Trimmed Name  ');
            folderManagerMock.setup(x => x.createFolder(workspaceId, 'Trimmed Name', undefined))
                .returnsAsync({ status: 200, parsedBody: { id: folderId } } as any);

            await executeCommand(workspaceNode);

            folderManagerMock.verify(x => x.createFolder(workspaceId, 'Trimmed Name', undefined), Times.Once());
        });
    });

    it('should use correct command name', function () {
        assert.strictEqual(command.commandName, 'vscode-fabric.createFolder');
    });

    it('should use correct telemetry event name', function () {
        assert.strictEqual(command.telemetryEventName, 'folder/create');
    });

    async function executeCommand(...args: any[]): Promise<void> {
        await command['executeInternal'](telemetryActivityMock.object(), ...args);
    }

    function createMockWorkspaceTreeNode(workspaceObjectId: string): any {
        return {
            workspace: { objectId: workspaceObjectId },
            constructor: { name: 'WorkspaceTreeNode' },
        } as any;
    }
});
