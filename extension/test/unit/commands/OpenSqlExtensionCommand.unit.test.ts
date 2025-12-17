// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { OpenSqlExtensionCommand } from '../../../src/commands/OpenSqlExtensionCommand';
import { IFabricCommandManager } from '../../../src/commands/IFabricCommandManager';
import { TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { AbstractDatabaseTreeNode } from '../../../src/internalSatellites/database/AbstractDatabaseTreeNode';
import { IArtifactManagerInternal } from '../../../src/apis/internal/fabricExtensionInternal';
import { IFabricApiClient } from '@microsoft/vscode-fabric-api';

describe('OpenSqlExtensionCommand', function () {
    let commandManagerMock: Mock<IFabricCommandManager>;
    let artifactManagerMock: Mock<IArtifactManagerInternal>;
    let apiClientMock: Mock<IFabricApiClient>;
    let databaseTreeNodeMock: Mock<AbstractDatabaseTreeNode>;
    let openExternalStub: sinon.SinonStub;
    let sandbox: sinon.SinonSandbox;

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        commandManagerMock = new Mock<IFabricCommandManager>();
        artifactManagerMock = new Mock<IArtifactManagerInternal>();
        apiClientMock = new Mock<IFabricApiClient>();
        databaseTreeNodeMock = new Mock<AbstractDatabaseTreeNode>();

        // Setup command manager dependencies
        commandManagerMock.setup(x => x.artifactManager).returns(artifactManagerMock.object());
        commandManagerMock.setup(x => x.apiClient).returns(apiClientMock.object());

        // Setup databaseTreeNode.artifact
        databaseTreeNodeMock.setup(x => x.artifact).returns({
            workspaceId: 'ws-123',
            id: 'db-456',
            type: 'SQLDatabase',
            displayName: 'TestDB',
        } as any);

        // Setup getExternalUri
        databaseTreeNodeMock.setup(x => x.getExternalUri(It.IsAny())).returns(Promise.resolve('https://external.uri'));

        // Stub openExternal
        openExternalStub = sandbox.stub(vscode.env, 'openExternal').resolves(true);

        // Setup artifactManager.doContextMenuItem to call the callback
        artifactManagerMock
            .setup(x => x.doContextMenuItem(It.IsAny(), It.IsAny(), It.IsAny()))
            .callback(({ args: [_cmdArgs, _label, callback] }) => {
                return callback(databaseTreeNodeMock.object());
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('should have correct command name and telemetry event name', function () {
        const command = new OpenSqlExtensionCommand(commandManagerMock.object());
        assert.strictEqual(command.commandName, 'vscode-fabric.openSqlExtension');
        assert.strictEqual(command.telemetryEventName, 'item/open/sql-ext');
    });

    it('should open the external URI when executed', async function () {
        const command = new OpenSqlExtensionCommand(commandManagerMock.object());

        // Create a minimal telemetry activity mock
        const telemetryActivityMock = {
            addOrUpdateProperties: sandbox.stub(),
        } as unknown as TelemetryActivity<any>;

        // Execute the internal method directly
        await (command as any).executeInternal(telemetryActivityMock, databaseTreeNodeMock.object());

        // Assert
        assert(openExternalStub.calledOnce, 'openExternal should be called once');
        assert(openExternalStub.calledWith(sinon.match.instanceOf(vscode.Uri)), 'openExternal should be called with a vscode.Uri');
        databaseTreeNodeMock.verify(x => x.getExternalUri(It.IsAny()), Times.Once());
    });
});
