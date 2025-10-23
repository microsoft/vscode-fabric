// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { openSqlExtensionInExternal } from '../../../../src/internalSatellites/database/openSqlExtension';
import { TelemetryService, TelemetryEvent } from '@microsoft/vscode-fabric-util';
import { IFabricApiClient, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { AbstractDatabaseTreeNode } from '../../../../src/internalSatellites/database/AbstractDatabaseTreeNode';

describe('openSqlExtensionInExternal', function () {
    let telemetryServiceMock: Mock<TelemetryService>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let apiClientMock: Mock<IFabricApiClient>;
    let databaseTreeNodeMock: Mock<AbstractDatabaseTreeNode>;
    let openExternalStub: sinon.SinonStub;
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

        // Setup getExternalUri
        databaseTreeNodeMock.setup(x => x.getExternalUri(It.IsAny())).returns(Promise.resolve('https://external.uri'));

        // Stub openExternal
        openExternalStub = sandbox.stub(vscode.env, 'openExternal').resolves(true);

        // Stub TelemetryEvent
        eventSendStub = sandbox.stub(TelemetryEvent.prototype, 'sendTelemetry').callsFake(() => {});
        sandbox.stub(TelemetryEvent.prototype, 'addOrUpdateProperties').callsFake(() => {});
    });

    afterEach(function () {
        sandbox.restore();
    });

    after(function () {
        // No global teardown needed
    });

    it('should open the external URI and send telemetry', async function () {
        // Act
        await openSqlExtensionInExternal(
            telemetryServiceMock.object(),
            workspaceManagerMock.object(),
            apiClientMock.object(),
            databaseTreeNodeMock.object()
        );

        // Assert
        assert(openExternalStub.calledOnce, 'openExternal should be called once');
        assert(openExternalStub.calledWith(sinon.match.instanceOf(vscode.Uri)), 'openExternal should be called with a vscode.Uri');
        assert(eventSendStub.calledOnce, 'TelemetryEvent.sendTelemetry should be called once');
    });
});
