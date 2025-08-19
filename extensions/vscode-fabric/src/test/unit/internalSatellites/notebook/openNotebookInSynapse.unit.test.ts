import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { openNotebookInSynapse } from '../../../../internalSatellites/notebook/openNotebookInSynapse';
import { TelemetryService, TelemetryEvent } from '@microsoft/vscode-fabric-util';
import { NotebookTreeNode } from '../../../../internalSatellites/notebook/NotebookTreeNode';

describe('openNotebookInSynapse', function() {
    let telemetryServiceMock: Mock<TelemetryService>;
    let treeNodeMock: Mock<NotebookTreeNode>;
    let openExternalStub: sinon.SinonStub;
    let eventSendStub: sinon.SinonStub;
    let sandbox: sinon.SinonSandbox;

    before(function() {  
        // No global setup needed
    });

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        telemetryServiceMock = new Mock<TelemetryService>();
        treeNodeMock = new Mock<NotebookTreeNode>();

        // Setup treeNode.artifact
        treeNodeMock.setup(x => x.artifact).returns({
            id: 'notebook-123',
            type: 'Notebook',
            displayName: 'TestNotebook',
            workspaceId: 'ws-123'
        } as any);

        // Setup getExternalUri
        treeNodeMock.setup(x => x.getExternalUri()).returns(Promise.resolve('https://synapse.uri'));

        // Stub openExternal
        openExternalStub = sandbox.stub(vscode.env, 'openExternal').resolves(true);

        // Stub TelemetryEvent
        eventSendStub = sandbox.stub(TelemetryEvent.prototype, 'sendTelemetry').callsFake(() => {});
        sandbox.stub(TelemetryEvent.prototype, 'addOrUpdateProperties').callsFake(() => {});
    });

    afterEach(function() {
        sandbox.restore();
    });

    after(function() {
        // No global teardown needed
    });

    it('should open the notebook external URI and send telemetry', async function() {
        // Act
        await openNotebookInSynapse(
            telemetryServiceMock.object(),
            'TestWorkspace',
            treeNodeMock.object(),
        );

        // Assert
        assert(openExternalStub.calledOnce, 'openExternal should be called once');
        assert(openExternalStub.calledWith(sinon.match.instanceOf(vscode.Uri)), 'openExternal should be called with a vscode.Uri');
        assert(eventSendStub.calledOnce, 'TelemetryEvent.sendTelemetry should be called once');
    });
});
