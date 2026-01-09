// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { EditItemDefinitionCommand } from '../../../src/commands/EditItemDefinitionCommand';
import { IFabricCommandManager } from '../../../src/commands/IFabricCommandManager';
import { DefinitionFileTreeNode } from '../../../src/workspace/treeNodes/DefinitionFileTreeNode';
import { IArtifact } from '@microsoft/vscode-fabric-api';
import { IFabricEnvironmentProvider, ILogger, TelemetryService, TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { verifyAddOrUpdateProperties, verifyAddOrUpdatePropertiesNever } from '../../utilities/moqUtilities';

describe('EditItemDefinitionCommand', function () {
    let commandManagerMock: Mock<IFabricCommandManager>;
    let loggerMock: Mock<ILogger>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
    let command: EditItemDefinitionCommand;
    let contextMock: Mock<vscode.ExtensionContext>;
    let fabricEnvironmentProviderMock: Mock<IFabricEnvironmentProvider>;

    let openTextDocumentStub: sinon.SinonStub;
    let showTextDocumentStub: sinon.SinonStub;

    const workspaceId = 'workspace-123';
    const artifactId = 'artifact-456';
    const fileName = 'item.definition.pbir';

    let artifact: IArtifact;
    let node: DefinitionFileTreeNode;
    let mockDocument: vscode.TextDocument;

    beforeEach(function () {
        contextMock = new Mock<vscode.ExtensionContext>();
        loggerMock = new Mock<ILogger>();
        telemetryServiceMock = new Mock<TelemetryService>();
        commandManagerMock = new Mock<IFabricCommandManager>();
        fabricEnvironmentProviderMock = new Mock<IFabricEnvironmentProvider>();
        telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();

        fabricEnvironmentProviderMock.setup(x => x.getCurrent())
            .returns({ sharedUri: 'https://test.fabric', env: 'test-env' } as any);

        // Setup logger mock
        loggerMock.setup(x => x.error(It.IsAny())).returns(undefined);
        loggerMock.setup(x => x.debug(It.IsAny())).returns(undefined);

        // Setup command manager mock
        commandManagerMock.setup(x => x.logger).returns(loggerMock.object());
        commandManagerMock.setup(x => x.telemetryService).returns(telemetryServiceMock.object());
        commandManagerMock.setup(x => x.fabricEnvironmentProvider).returns(fabricEnvironmentProviderMock.object());

        // Setup telemetry service mock
        telemetryServiceMock.setup(x => x.sendTelemetryEvent(It.IsAny(), It.IsAny(), It.IsAny()))
            .returns(undefined);

        telemetryActivityMock.setup(instance => instance.addOrUpdateProperties(It.IsAny()))
            .returns(undefined);

        // Create artifact
        artifact = {
            id: artifactId,
            workspaceId: workspaceId,
            displayName: 'Test Report',
            type: 'Report',
            fabricEnvironment: 'Production',
        };

        // Create mock document
        mockDocument = {
            uri: vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/${fileName}`),
            fileName: fileName,
        } as vscode.TextDocument;

        // Create definition file tree node
        const editableUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/${fileName}`);
        const readonlyUri = vscode.Uri.parse(`fabric-definition-virtual:///${workspaceId}/${artifactId}/${fileName}`);
        node = new DefinitionFileTreeNode(contextMock.object(), artifact, fileName, editableUri, readonlyUri);

        // Stub VS Code workspace and window methods
        openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument').resolves(mockDocument);
        showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves({} as vscode.TextEditor);

        // Create command instance
        command = new EditItemDefinitionCommand(commandManagerMock.object());
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('executeInternal', function () {
        it('should open the editable document with correct URI', async function () {
            await executeCommand(node);

            assert.ok(openTextDocumentStub.calledOnce, 'openTextDocument should be called once');
            assert.ok(openTextDocumentStub.calledWith(node.editableUri), 'Should use editable URI');
            assert.ok(showTextDocumentStub.calledOnce, 'showTextDocument should be called once');
            assert.ok(showTextDocumentStub.calledWith(mockDocument, { preview: false }), 'Should show document without preview');
        });

        it('should add artifact telemetry properties', async function () {
            await executeCommand(node);

            // Check that artifact properties were added
            verifyAddOrUpdateProperties(telemetryActivityMock, 'workspaceId', workspaceId);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'artifactId', artifactId);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'fabricArtifactName', artifact.displayName);
            verifyAddOrUpdateProperties(telemetryActivityMock, 'itemType', artifact.type);
        });

        it('should add file extension to telemetry', async function () {
            await executeCommand(node);

            // Check that file extension was added
            verifyAddOrUpdateProperties(telemetryActivityMock, 'fileExtension', 'pbir');
        });

        it('should extract file extension correctly for files with multiple dots', async function () {
            const editableUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/file.definition.json`);
            const readonlyUri = vscode.Uri.parse(`fabric-definition-virtual:///${workspaceId}/${artifactId}/file.definition.json`);
            const nodeWithMultipleDots = new DefinitionFileTreeNode(contextMock.object(), artifact, 'file.definition.json', editableUri, readonlyUri);

            await executeCommand(nodeWithMultipleDots);

            verifyAddOrUpdateProperties(telemetryActivityMock, 'fileExtension', 'json');
        });

        it('should handle files without extension', async function () {
            const editableUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/README`);
            const readonlyUri = vscode.Uri.parse(`fabric-definition-virtual:///${workspaceId}/${artifactId}/README`);
            const nodeWithoutExtension = new DefinitionFileTreeNode(contextMock.object(), artifact, 'README', editableUri, readonlyUri);

            await executeCommand(nodeWithoutExtension);

            verifyAddOrUpdateProperties(telemetryActivityMock, 'fileExtension', '');
        });

        it('should log debug message after opening file', async function () {
            await executeCommand(node);

            loggerMock.verify(x => x.debug(It.Is<string>(msg => msg.includes(fileName))), Times.Once());
        });

        it('should return early and log error when node is undefined', async function () {
            await executeCommand(undefined);

            loggerMock.verify(x => x.error(It.Is<string>(msg => msg.includes('without a DefinitionFileTreeNode'))), Times.Once());
            assert.ok(openTextDocumentStub.notCalled, 'openTextDocument should not be called');
            assert.ok(showTextDocumentStub.notCalled, 'showTextDocument should not be called');

            // Verify no artifact properties or file extension were added
            verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'workspaceId');
            verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'artifactId');
            verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'fileExtension');
        });

        it('should return early and log error when node is null', async function () {
            await executeCommand(null);

            loggerMock.verify(x => x.error(It.Is<string>(msg => msg.includes('without a DefinitionFileTreeNode'))), Times.Once());
            assert.ok(openTextDocumentStub.notCalled, 'openTextDocument should not be called');
            assert.ok(showTextDocumentStub.notCalled, 'showTextDocument should not be called');

            // Verify no artifact properties or file extension were added
            verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'workspaceId');
            verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'artifactId');
            verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'fileExtension');
        });

        async function executeCommand(...args: any[]): Promise<void> {
            await command['executeInternal'](telemetryActivityMock.object(), ...args);
        }
    });

    it('should use correct command name', function () {
        assert.strictEqual(command.commandName, 'vscode-fabric.editDefinitionFile');
    });

    it('should use correct telemetry event name', function () {
        assert.strictEqual(command.telemetryEventName, 'item/definition/edit');
    });
});
