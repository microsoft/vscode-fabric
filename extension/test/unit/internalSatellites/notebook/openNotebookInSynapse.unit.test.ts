// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { openNotebookInSynapse, getExternalUri } from '../../../../src/internalSatellites/notebook/openNotebookInSynapse';
import { IArtifact } from '@microsoft/vscode-fabric-api';
import { TelemetryService, TelemetryEvent } from '@microsoft/vscode-fabric-util';

describe('openNotebookInSynapse', function () {
    let telemetryServiceMock: Mock<TelemetryService>;
    let openExternalStub: sinon.SinonStub;
    let eventSendStub: sinon.SinonStub;
    let sandbox: sinon.SinonSandbox;
    let artifact: IArtifact;

    before(function () {
        // No global setup needed
    });

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        telemetryServiceMock = new Mock<TelemetryService>();

        // Setup artifact
        artifact = {
            id: 'notebook-123',
            type: 'Notebook',
            displayName: 'TestNotebook',
            workspaceId: 'ws-123',
        } as IArtifact;

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

    it('should open the notebook external URI and send telemetry', async function () {
        // Act
        await openNotebookInSynapse(
            telemetryServiceMock.object(),
            artifact
        );

        // Assert
        assert(openExternalStub.calledOnce, 'openExternal should be called once');
        assert(openExternalStub.calledWith(sinon.match.instanceOf(vscode.Uri)), 'openExternal should be called with a vscode.Uri');
        assert(eventSendStub.calledOnce, 'TelemetryEvent.sendTelemetry should be called once');
    });

    it('getExternalUri should return the correct URI for the notebook', async function () {
        const expectedUri = `${vscode.env.uriScheme}://SynapseVSCode.synapse?workspaceId=ws-123&artifactId=notebook-123`;

        // Act
        const result = getExternalUri(artifact);

        // Assert
        assert.equal(result, expectedUri, 'Should return the correct external URI');
    });

});
