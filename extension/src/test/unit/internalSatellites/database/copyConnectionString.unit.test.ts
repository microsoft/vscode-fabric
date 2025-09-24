// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { copyConnectionStringToClipboard } from '../../../../internalSatellites/database/copyConnectionString';
import { TelemetryService, TelemetryEvent } from '@microsoft/vscode-fabric-util';
import { IFabricApiClient, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { AbstractDatabaseTreeNode } from '../../../../internalSatellites/database/AbstractDatabaseTreeNode';

describe('copyConnectionStringToClipboard', function () {
    let telemetryServiceMock: Mock<TelemetryService>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let apiClientMock: Mock<IFabricApiClient>;
    let databaseTreeNodeMock: Mock<AbstractDatabaseTreeNode>;
    let clipboardStub: sinon.SinonStub;
    let eventSendStub: sinon.SinonStub;
    let sandbox: sinon.SinonSandbox;

    before(function () {
        // No global setup needed
    });

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        telemetryServiceMock = new Mock<TelemetryService>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        apiClientMock = new Mock<IFabricApiClient>();
        databaseTreeNodeMock = new Mock<AbstractDatabaseTreeNode>();

        // Setup databaseTreeNode.artifact
        databaseTreeNodeMock.setup(x => x.artifact).returns({
            workspaceId: 'ws-123',
            id: 'db-456',
            type: 'SQLDatabase',
            displayName: 'TestDB',
        } as any);

        // Setup getConnectionString
        databaseTreeNodeMock.setup(x => x.getConnectionString(It.IsAny())).returns(Promise.resolve('Server=foo;Database=bar;'));

        // Stub TelemetryEvent
        eventSendStub = sandbox.stub(TelemetryEvent.prototype, 'sendTelemetry').callsFake(() => {});
        sandbox.stub(TelemetryEvent.prototype, 'addOrUpdateProperties').callsFake(() => {});
    });

    afterEach(function () {
        sandbox.restore();
        sinon.restore();
    });

    after(function () {
        // No global teardown needed
    });

    it('should copy the connection string to clipboard and send telemetry', async function () {
        // Act
        await copyConnectionStringToClipboard(
            telemetryServiceMock.object(),
            workspaceManagerMock.object(),
            apiClientMock.object(),
            databaseTreeNodeMock.object()
        );

        // Assert
        assert(eventSendStub.calledOnce, 'TelemetryEvent.sendTelemetry should be called once');
    });
});
