// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { DeleteDefinitionFileCommand } from '../../../src/commands/DeleteDefinitionFileCommand';
import { IFabricCommandManager } from '../../../src/commands/IFabricCommandManager';
import { DefinitionFileTreeNode } from '../../../src/workspace/treeNodes/DefinitionFileTreeNode';
import { DefinitionFolderTreeNode } from '../../../src/workspace/treeNodes/DefinitionFolderTreeNode';
import { IArtifact } from '@microsoft/vscode-fabric-api';
import { IFabricEnvironmentProvider, ILogger, TelemetryService, TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { verifyAddOrUpdateProperties, verifyAddOrUpdatePropertiesNever } from '../../utilities/moqUtilities';

describe('DeleteDefinitionFileCommand', function () {
    let commandManagerMock: Mock<IFabricCommandManager>;
    let loggerMock: Mock<ILogger>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
    let fabricEnvironmentProviderMock: Mock<IFabricEnvironmentProvider>;
    let command: DeleteDefinitionFileCommand;
    let contextMock: Mock<vscode.ExtensionContext>;

    let showWarningMessageStub: sinon.SinonStub;
    let deleteStub: sinon.SinonStub;
    let executeCommandStub: sinon.SinonStub;

    const workspaceId = 'workspace-123';
    const artifactId = 'artifact-456';

    let artifact: IArtifact;

    beforeEach(function () {
        contextMock = new Mock<vscode.ExtensionContext>();
        loggerMock = new Mock<ILogger>();
        telemetryServiceMock = new Mock<TelemetryService>();
        commandManagerMock = new Mock<IFabricCommandManager>();
        fabricEnvironmentProviderMock = new Mock<IFabricEnvironmentProvider>();
        telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();

        fabricEnvironmentProviderMock.setup(x => x.getCurrent())
            .returns({ sharedUri: 'https://test.fabric', env: 'test-env' } as any);

        loggerMock.setup(x => x.error(It.IsAny())).returns(undefined);
        loggerMock.setup(x => x.debug(It.IsAny())).returns(undefined);

        commandManagerMock.setup(x => x.logger).returns(loggerMock.object());
        commandManagerMock.setup(x => x.telemetryService).returns(telemetryServiceMock.object());
        commandManagerMock.setup(x => x.fabricEnvironmentProvider).returns(fabricEnvironmentProviderMock.object());

        telemetryServiceMock.setup(x => x.sendTelemetryEvent(It.IsAny(), It.IsAny(), It.IsAny()))
            .returns(undefined);

        telemetryActivityMock.setup(instance => instance.addOrUpdateProperties(It.IsAny()))
            .returns(undefined);

        artifact = {
            id: artifactId,
            workspaceId: workspaceId,
            displayName: 'Test Artifact',
            type: 'SemanticModel',
            fabricEnvironment: 'Production',
        };

        // Stub VS Code APIs
        showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
        deleteStub = sinon.stub(vscode.workspace.fs, 'delete').resolves();
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();

        command = new DeleteDefinitionFileCommand(commandManagerMock.object());
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('executeInternal', function () {
        it('should delete a file after confirmation', async function () {
            const editableUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/model.tmdl`);
            const readonlyUri = vscode.Uri.parse(`fabric-definition-virtual:///${workspaceId}/${artifactId}/model.tmdl`);
            const fileNode = new DefinitionFileTreeNode(contextMock.object(), artifact, 'model.tmdl', readonlyUri, editableUri);

            showWarningMessageStub.resolves('Delete');

            await executeCommand(fileNode);

            assert.ok(deleteStub.calledOnce, 'delete should be called');
            const deletedUri = deleteStub.firstCall.args[0] as vscode.Uri;
            assert.ok(deletedUri.path.endsWith(`/${workspaceId}/${artifactId}/model.tmdl`));
            assert.deepStrictEqual(deleteStub.firstCall.args[1], { recursive: false });
        });

        it('should delete a folder recursively after confirmation', async function () {
            const folderNode = new DefinitionFolderTreeNode(contextMock.object(), artifact, 'tables', 'tables');

            showWarningMessageStub.resolves('Delete');

            await executeCommand(folderNode);

            assert.ok(deleteStub.calledOnce, 'delete should be called');
            const deletedUri = deleteStub.firstCall.args[0] as vscode.Uri;
            assert.ok(deletedUri.path.endsWith(`/${workspaceId}/${artifactId}/tables`));
            assert.deepStrictEqual(deleteStub.firstCall.args[1], { recursive: true });
        });

        it('should refresh the tree view after deletion', async function () {
            const editableUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/file.json`);
            const readonlyUri = vscode.Uri.parse(`fabric-definition-virtual:///${workspaceId}/${artifactId}/file.json`);
            const fileNode = new DefinitionFileTreeNode(contextMock.object(), artifact, 'file.json', readonlyUri, editableUri);

            showWarningMessageStub.resolves('Delete');

            await executeCommand(fileNode);

            assert.ok(executeCommandStub.calledWith('vscode-fabric.refreshArtifactView'));
        });

        it('should return early if user cancels confirmation', async function () {
            const editableUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/model.tmdl`);
            const readonlyUri = vscode.Uri.parse(`fabric-definition-virtual:///${workspaceId}/${artifactId}/model.tmdl`);
            const fileNode = new DefinitionFileTreeNode(contextMock.object(), artifact, 'model.tmdl', readonlyUri, editableUri);

            showWarningMessageStub.resolves(undefined);

            await executeCommand(fileNode);

            assert.ok(deleteStub.notCalled, 'delete should not be called');
        });

        it('should show modal confirmation dialog', async function () {
            const editableUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/model.tmdl`);
            const readonlyUri = vscode.Uri.parse(`fabric-definition-virtual:///${workspaceId}/${artifactId}/model.tmdl`);
            const fileNode = new DefinitionFileTreeNode(contextMock.object(), artifact, 'model.tmdl', readonlyUri, editableUri);

            showWarningMessageStub.resolves(undefined);

            await executeCommand(fileNode);

            assert.ok(showWarningMessageStub.calledOnce, 'showWarningMessage should be called');
            const options = showWarningMessageStub.firstCall.args[1];
            assert.strictEqual(options.modal, true, 'Should be modal');
        });

        it('should add artifact telemetry properties', async function () {
            const editableUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/model.tmdl`);
            const readonlyUri = vscode.Uri.parse(`fabric-definition-virtual:///${workspaceId}/${artifactId}/model.tmdl`);
            const fileNode = new DefinitionFileTreeNode(contextMock.object(), artifact, 'model.tmdl', readonlyUri, editableUri);

            showWarningMessageStub.resolves('Delete');

            await executeCommand(fileNode);

            verifyAddOrUpdateProperties(telemetryActivityMock, 'workspaceId', workspaceId);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'artifactId', artifactId);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'fabricArtifactName', artifact.displayName);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'itemType', artifact.type);
        });

        it('should return early and log error when node is undefined', async function () {
            await executeCommand(undefined);

            loggerMock.verify(x => x.error(It.Is<string>(msg => msg.includes('without a valid tree node'))), Times.Once());
            assert.ok(showWarningMessageStub.notCalled, 'showWarningMessage should not be called');
            assert.ok(deleteStub.notCalled, 'delete should not be called');
        });

        it('should return early and log error when node is null', async function () {
            await executeCommand(null);

            loggerMock.verify(x => x.error(It.Is<string>(msg => msg.includes('without a valid tree node'))), Times.Once());
            assert.ok(showWarningMessageStub.notCalled, 'showWarningMessage should not be called');
            assert.ok(deleteStub.notCalled, 'delete should not be called');

            verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'workspaceId');
        });

        async function executeCommand(...args: any[]): Promise<void> {
            await command['executeInternal'](telemetryActivityMock.object(), ...args);
        }
    });

    it('should use correct command name', function () {
        assert.strictEqual(command.commandName, 'vscode-fabric.deleteDefinitionFile');
    });

    it('should use correct telemetry event name', function () {
        assert.strictEqual(command.telemetryEventName, 'item/definition/deleteFile');
    });
});
