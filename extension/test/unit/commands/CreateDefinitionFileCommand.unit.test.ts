// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { CreateDefinitionFileCommand } from '../../../src/commands/CreateDefinitionFileCommand';
import { IFabricCommandManager } from '../../../src/commands/IFabricCommandManager';
import { DefinitionRootTreeNode } from '../../../src/workspace/treeNodes/DefinitionRootTreeNode';
import { DefinitionFolderTreeNode } from '../../../src/workspace/treeNodes/DefinitionFolderTreeNode';
import { IArtifact } from '@microsoft/vscode-fabric-api';
import { IFabricEnvironmentProvider, ILogger, TelemetryService, TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { verifyAddOrUpdateProperties, verifyAddOrUpdatePropertiesNever } from '../../utilities/moqUtilities';

describe('CreateDefinitionFileCommand', function () {
    let commandManagerMock: Mock<IFabricCommandManager>;
    let loggerMock: Mock<ILogger>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
    let fabricEnvironmentProviderMock: Mock<IFabricEnvironmentProvider>;
    let command: CreateDefinitionFileCommand;
    let contextMock: Mock<vscode.ExtensionContext>;

    let showInputBoxStub: sinon.SinonStub;
    let writeFileStub: sinon.SinonStub;
    let openTextDocumentStub: sinon.SinonStub;
    let showTextDocumentStub: sinon.SinonStub;
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

        const mockDocument = {
            uri: vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/newfile.tmdl`),
        } as vscode.TextDocument;

        // Stub VS Code APIs
        showInputBoxStub = sinon.stub(vscode.window, 'showInputBox');
        writeFileStub = sinon.stub(vscode.workspace.fs, 'writeFile').resolves();
        openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument').resolves(mockDocument);
        showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves({} as vscode.TextEditor);
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();

        command = new CreateDefinitionFileCommand(commandManagerMock.object());
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('executeInternal', function () {
        it('should create a file at the definition root', async function () {
            const rootNode = new DefinitionRootTreeNode(contextMock.object(), artifact);
            showInputBoxStub.resolves('model.tmdl');

            await executeCommand(rootNode);

            assert.ok(writeFileStub.calledOnce, 'writeFile should be called');
            const writtenUri = writeFileStub.firstCall.args[0] as vscode.Uri;
            assert.ok(writtenUri.path.endsWith(`/${workspaceId}/${artifactId}/model.tmdl`));
        });

        it('should create a file inside a folder', async function () {
            const folderNode = new DefinitionFolderTreeNode(contextMock.object(), artifact, 'tables', 'tables');
            showInputBoxStub.resolves('Sales.tmdl');

            await executeCommand(folderNode);

            assert.ok(writeFileStub.calledOnce, 'writeFile should be called');
            const writtenUri = writeFileStub.firstCall.args[0] as vscode.Uri;
            assert.ok(writtenUri.path.endsWith(`/${workspaceId}/${artifactId}/tables/Sales.tmdl`));
        });

        it('should open the new file for editing', async function () {
            const rootNode = new DefinitionRootTreeNode(contextMock.object(), artifact);
            showInputBoxStub.resolves('newfile.json');

            await executeCommand(rootNode);

            assert.ok(openTextDocumentStub.calledOnce, 'openTextDocument should be called');
            assert.ok(showTextDocumentStub.calledOnce, 'showTextDocument should be called');
        });

        it('should refresh the tree view after creation', async function () {
            const rootNode = new DefinitionRootTreeNode(contextMock.object(), artifact);
            showInputBoxStub.resolves('newfile.json');

            await executeCommand(rootNode);

            assert.ok(executeCommandStub.calledWith('vscode-fabric.refreshArtifactView'));
        });

        it('should return early if user cancels the input box', async function () {
            const rootNode = new DefinitionRootTreeNode(contextMock.object(), artifact);
            showInputBoxStub.resolves(undefined);

            await executeCommand(rootNode);

            assert.ok(writeFileStub.notCalled, 'writeFile should not be called');
            assert.ok(openTextDocumentStub.notCalled, 'openTextDocument should not be called');
        });

        it('should add artifact telemetry properties', async function () {
            const rootNode = new DefinitionRootTreeNode(contextMock.object(), artifact);
            showInputBoxStub.resolves('file.tmdl');

            await executeCommand(rootNode);

            verifyAddOrUpdateProperties(telemetryActivityMock, 'workspaceId', workspaceId);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'artifactId', artifactId);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'fabricArtifactName', artifact.displayName);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'itemType', artifact.type);
        });

        it('should add file extension to telemetry', async function () {
            const rootNode = new DefinitionRootTreeNode(contextMock.object(), artifact);
            showInputBoxStub.resolves('model.tmdl');

            await executeCommand(rootNode);

            verifyAddOrUpdateProperties(telemetryActivityMock, 'fileExtension', 'tmdl');
        });

        it('should return early and log error when node is undefined', async function () {
            await executeCommand(undefined);

            loggerMock.verify(x => x.error(It.Is<string>(msg => msg.includes('without a valid tree node'))), Times.Once());
            assert.ok(showInputBoxStub.notCalled, 'showInputBox should not be called');
            assert.ok(writeFileStub.notCalled, 'writeFile should not be called');
        });

        it('should validate input - reject empty names', async function () {
            const rootNode = new DefinitionRootTreeNode(contextMock.object(), artifact);
            showInputBoxStub.resolves('valid.txt');

            await executeCommand(rootNode);

            // Verify the validateInput function was provided
            const inputBoxOptions = showInputBoxStub.firstCall.args[0];
            assert.ok(inputBoxOptions.validateInput, 'validateInput should be provided');

            // Test validation
            const validation = inputBoxOptions.validateInput;
            assert.ok(validation('') !== undefined, 'Empty string should fail validation');
            assert.ok(validation('  ') !== undefined, 'Whitespace should fail validation');
            assert.ok(validation('valid.txt') === undefined, 'Valid name should pass');
        });

        it('should validate input - reject path separators', async function () {
            const rootNode = new DefinitionRootTreeNode(contextMock.object(), artifact);
            showInputBoxStub.resolves('valid.txt');

            await executeCommand(rootNode);

            const validation = showInputBoxStub.firstCall.args[0].validateInput;
            assert.ok(validation('path/file.txt') !== undefined, 'Forward slash should fail');
            assert.ok(validation('path\\file.txt') !== undefined, 'Backslash should fail');
        });

        async function executeCommand(...args: any[]): Promise<void> {
            await command['executeInternal'](telemetryActivityMock.object(), ...args);
        }
    });

    it('should use correct command name', function () {
        assert.strictEqual(command.commandName, 'vscode-fabric.createDefinitionFile');
    });

    it('should use correct telemetry event name', function () {
        assert.strictEqual(command.telemetryEventName, 'item/definition/createFile');
    });
});
