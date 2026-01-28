// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import { IApiClientResponse, IWorkspaceManager, IWorkspaceFolder } from '@microsoft/vscode-fabric-api';
import { TelemetryActivity, ILogger, TelemetryService, IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { FabricWorkspaceDataProvider } from '../../../src/workspace/treeView';
import { FolderTreeNode } from '../../../src/workspace/treeNodes/FolderTreeNode';
import { WorkspaceTreeNode } from '../../../src/workspace/treeNodes/WorkspaceTreeNode';
import { CreateFolderCommand } from '../../../src/commands/CreateFolderCommand';
import { DeleteFolderCommand } from '../../../src/commands/DeleteFolderCommand';
import { RenameFolderCommand } from '../../../src/commands/RenameFolderCommand';
import { IFabricCommandManager } from '../../../src/commands/IFabricCommandManager';
import { verifyAddOrUpdateProperties, verifyAddOrUpdatePropertiesNever } from '../../utilities/moqUtilities';

describe('FolderTreeNode', () => {
    let contextMock: Mock<vscode.ExtensionContext>;
    let folder: IWorkspaceFolder;

    beforeEach(() => {
        contextMock = new Mock<vscode.ExtensionContext>();
        folder = {
            id: 'folder-123',
            displayName: 'Test Folder',
            workspaceId: 'workspace-456',
            parentFolderId: undefined,
        };
    });

    it('should expose workspaceId', () => {
        const node = new FolderTreeNode(contextMock.object(), folder);
        assert.strictEqual(node.workspaceId, 'workspace-456');
    });

    it('should expose folderId', () => {
        const node = new FolderTreeNode(contextMock.object(), folder);
        assert.strictEqual(node.folderId, 'folder-123');
    });

    it('should set contextValue to WorkspaceFolderTreeNode', () => {
        const node = new FolderTreeNode(contextMock.object(), folder);
        assert.strictEqual(node.contextValue, 'WorkspaceFolderTreeNode');
    });

    it('should set label to folder displayName', () => {
        const node = new FolderTreeNode(contextMock.object(), folder);
        assert.strictEqual(node.label, 'Test Folder');
    });

    it('should set folder icon', () => {
        const node = new FolderTreeNode(contextMock.object(), folder);
        assert.ok(node.iconPath instanceof vscode.ThemeIcon);
        assert.strictEqual((node.iconPath as vscode.ThemeIcon).id, 'folder');
    });

    it('should generate correct id', () => {
        const node = new FolderTreeNode(contextMock.object(), folder);
        assert.strictEqual(node.id, 'ws-folder:workspace-456:folder-123');
    });

    it('should report hasChildren as false when empty', () => {
        const node = new FolderTreeNode(contextMock.object(), folder);
        assert.strictEqual(node.hasChildren(), false);
    });

    it('should report hasChildren as true when folders added', () => {
        const parentNode = new FolderTreeNode(contextMock.object(), folder);
        const childFolder: IWorkspaceFolder = {
            id: 'child-folder-123',
            displayName: 'Child Folder',
            workspaceId: 'workspace-456',
            parentFolderId: 'folder-123',
        };
        const childNode = new FolderTreeNode(contextMock.object(), childFolder);
        parentNode.addFolder(childNode);
        assert.strictEqual(parentNode.hasChildren(), true);
    });

    it('should return sorted child nodes', async () => {
        const parentNode = new FolderTreeNode(contextMock.object(), folder);
        const folderA: IWorkspaceFolder = {
            id: 'folder-a',
            displayName: 'Zebra Folder',
            workspaceId: 'workspace-456',
            parentFolderId: 'folder-123',
        };
        const folderB: IWorkspaceFolder = {
            id: 'folder-b',
            displayName: 'Alpha Folder',
            workspaceId: 'workspace-456',
            parentFolderId: 'folder-123',
        };
        parentNode.addFolder(new FolderTreeNode(contextMock.object(), folderA));
        parentNode.addFolder(new FolderTreeNode(contextMock.object(), folderB));

        const children = await parentNode.getChildNodes();

        assert.strictEqual(children.length, 2);
        assert.strictEqual(children[0].label, 'Alpha Folder');
        assert.strictEqual(children[1].label, 'Zebra Folder');
    });
});

describe('CreateFolderCommand', () => {
    let commandManagerMock: Mock<IFabricCommandManager>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let dataProviderMock: Mock<FabricWorkspaceDataProvider>;
    let loggerMock: Mock<ILogger>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
    let fabricEnvironmentProviderMock: Mock<IFabricEnvironmentProvider>;
    let command: CreateFolderCommand;

    let showInputBoxStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;

    beforeEach(() => {
        loggerMock = new Mock<ILogger>();
        telemetryServiceMock = new Mock<TelemetryService>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        dataProviderMock = new Mock<FabricWorkspaceDataProvider>();
        commandManagerMock = new Mock<IFabricCommandManager>();
        fabricEnvironmentProviderMock = new Mock<IFabricEnvironmentProvider>();
        telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();

        fabricEnvironmentProviderMock.setup(x => x.getCurrent())
            .returns({ sharedUri: 'https://test.fabric', env: 'test-env' } as any);

        loggerMock.setup(x => x.error(It.IsAny())).returns(undefined);
        loggerMock.setup(x => x.debug(It.IsAny())).returns(undefined);
        loggerMock.setup(x => x.log(It.IsAny())).returns(undefined);

        workspaceManagerMock.setup(x => x.isConnected()).returns(Promise.resolve(true));

        dataProviderMock.setup(x => x.refresh()).returns(undefined);

        commandManagerMock.setup(x => x.logger).returns(loggerMock.object());
        commandManagerMock.setup(x => x.telemetryService).returns(telemetryServiceMock.object());
        commandManagerMock.setup(x => x.workspaceManager).returns(workspaceManagerMock.object());
        commandManagerMock.setup(x => x.dataProvider).returns(dataProviderMock.object());
        commandManagerMock.setup(x => x.fabricEnvironmentProvider).returns(fabricEnvironmentProviderMock.object());

        telemetryActivityMock.setup(x => x.addOrUpdateProperties(It.IsAny())).returns(undefined);

        showInputBoxStub = sinon.stub(vscode.window, 'showInputBox');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');

        command = new CreateFolderCommand(commandManagerMock.object());
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should use correct command name', () => {
        assert.strictEqual(command.commandName, 'vscode-fabric.createFolder');
    });

    it('should use correct telemetry event name', () => {
        assert.strictEqual(command.telemetryEventName, 'folder/create');
    });

    it('should return early when not connected', async () => {
        workspaceManagerMock.setup(x => x.isConnected()).returns(Promise.resolve(false));

        await executeCommand();

        assert.ok(showInputBoxStub.notCalled, 'showInputBox should not be called');
    });

    it('should show error when no context node provided', async () => {
        await executeCommand();

        assert.ok(showErrorMessageStub.calledOnce, 'showErrorMessage should be called');
    });

    async function executeCommand(...args: any[]): Promise<void> {
        await command['executeInternal'](telemetryActivityMock.object(), ...args);
    }
});

describe('DeleteFolderCommand', () => {
    let commandManagerMock: Mock<IFabricCommandManager>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let dataProviderMock: Mock<FabricWorkspaceDataProvider>;
    let loggerMock: Mock<ILogger>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
    let fabricEnvironmentProviderMock: Mock<IFabricEnvironmentProvider>;
    let contextMock: Mock<vscode.ExtensionContext>;
    let command: DeleteFolderCommand;

    let showWarningMessageStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;

    beforeEach(() => {
        loggerMock = new Mock<ILogger>();
        telemetryServiceMock = new Mock<TelemetryService>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        dataProviderMock = new Mock<FabricWorkspaceDataProvider>();
        commandManagerMock = new Mock<IFabricCommandManager>();
        fabricEnvironmentProviderMock = new Mock<IFabricEnvironmentProvider>();
        telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();
        contextMock = new Mock<vscode.ExtensionContext>();

        fabricEnvironmentProviderMock.setup(x => x.getCurrent())
            .returns({ sharedUri: 'https://test.fabric', env: 'test-env' } as any);

        loggerMock.setup(x => x.error(It.IsAny())).returns(undefined);
        loggerMock.setup(x => x.debug(It.IsAny())).returns(undefined);
        loggerMock.setup(x => x.log(It.IsAny())).returns(undefined);

        dataProviderMock.setup(x => x.refresh()).returns(undefined);

        commandManagerMock.setup(x => x.logger).returns(loggerMock.object());
        commandManagerMock.setup(x => x.telemetryService).returns(telemetryServiceMock.object());
        commandManagerMock.setup(x => x.workspaceManager).returns(workspaceManagerMock.object());
        commandManagerMock.setup(x => x.dataProvider).returns(dataProviderMock.object());
        commandManagerMock.setup(x => x.fabricEnvironmentProvider).returns(fabricEnvironmentProviderMock.object());

        telemetryActivityMock.setup(x => x.addOrUpdateProperties(It.IsAny())).returns(undefined);

        showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');

        command = new DeleteFolderCommand(commandManagerMock.object());
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should use correct command name', () => {
        assert.strictEqual(command.commandName, 'vscode-fabric.deleteFolder');
    });

    it('should use correct telemetry event name', () => {
        assert.strictEqual(command.telemetryEventName, 'folder/delete');
    });

    it('should show error when no folder node provided', async () => {
        await executeCommand();

        assert.ok(showErrorMessageStub.calledOnce, 'showErrorMessage should be called');
    });

    async function executeCommand(...args: any[]): Promise<void> {
        await command['executeInternal'](telemetryActivityMock.object(), ...args);
    }
});

describe('RenameFolderCommand', () => {
    let commandManagerMock: Mock<IFabricCommandManager>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let dataProviderMock: Mock<FabricWorkspaceDataProvider>;
    let loggerMock: Mock<ILogger>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
    let fabricEnvironmentProviderMock: Mock<IFabricEnvironmentProvider>;
    let command: RenameFolderCommand;

    let showInputBoxStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;

    beforeEach(() => {
        loggerMock = new Mock<ILogger>();
        telemetryServiceMock = new Mock<TelemetryService>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        dataProviderMock = new Mock<FabricWorkspaceDataProvider>();
        commandManagerMock = new Mock<IFabricCommandManager>();
        fabricEnvironmentProviderMock = new Mock<IFabricEnvironmentProvider>();
        telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();

        fabricEnvironmentProviderMock.setup(x => x.getCurrent())
            .returns({ sharedUri: 'https://test.fabric', env: 'test-env' } as any);

        loggerMock.setup(x => x.error(It.IsAny())).returns(undefined);
        loggerMock.setup(x => x.debug(It.IsAny())).returns(undefined);
        loggerMock.setup(x => x.log(It.IsAny())).returns(undefined);

        dataProviderMock.setup(x => x.refresh()).returns(undefined);

        commandManagerMock.setup(x => x.logger).returns(loggerMock.object());
        commandManagerMock.setup(x => x.telemetryService).returns(telemetryServiceMock.object());
        commandManagerMock.setup(x => x.workspaceManager).returns(workspaceManagerMock.object());
        commandManagerMock.setup(x => x.dataProvider).returns(dataProviderMock.object());
        commandManagerMock.setup(x => x.fabricEnvironmentProvider).returns(fabricEnvironmentProviderMock.object());

        telemetryActivityMock.setup(x => x.addOrUpdateProperties(It.IsAny())).returns(undefined);

        showInputBoxStub = sinon.stub(vscode.window, 'showInputBox');
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');

        command = new RenameFolderCommand(commandManagerMock.object());
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should use correct command name', () => {
        assert.strictEqual(command.commandName, 'vscode-fabric.renameFolder');
    });

    it('should use correct telemetry event name', () => {
        assert.strictEqual(command.telemetryEventName, 'folder/rename');
    });

    it('should show error when no folder node provided', async () => {
        await executeCommand();

        assert.ok(showErrorMessageStub.calledOnce, 'showErrorMessage should be called');
    });

    async function executeCommand(...args: any[]): Promise<void> {
        await command['executeInternal'](telemetryActivityMock.object(), ...args);
    }
});
