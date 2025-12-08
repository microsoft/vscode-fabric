// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FabricUriHandler } from '../../src/FabricUriHandler';

describe('FabricUriHandler', () => {
    let executeCommandStub: sinon.SinonStub;
    let logger: { debug: sinon.SinonSpy; reportExceptionTelemetryAndLog: sinon.SinonStub };

    beforeEach(() => {
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        logger = {
            debug: sinon.spy(),
            reportExceptionTelemetryAndLog: sinon.stub().returns(undefined),
        };
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should call exportArtifact with correct parameters', async () => {
        const handler = new FabricUriHandler(null, logger as any);
        const workspaceId = '11111111-1111-1111-1111-111111111111';
        const artifactId = '22222222-2222-2222-2222-222222222222';
        const environmentId = 'PROD';
        const uri = vscode.Uri.parse(`vscode://fabric.vscode-fabric/?workspaceId=${workspaceId}&&artifactId=${artifactId}&&Environment=${environmentId}`);

        await handler.handleUri(uri);

        assert(executeCommandStub.calledOnce, 'executeCommand should be called');
        assert.strictEqual(executeCommandStub.firstCall.args[0], 'vscode-fabric.exportArtifact');
        const params = executeCommandStub.firstCall.args[1];
        assert.strictEqual(params.artifactId, artifactId);
        assert.strictEqual(params.workspaceId, workspaceId);
        assert.strictEqual(params.environment, environmentId);
    });

    it('should call exportArtifact with no environment if not set', async () => {
        const handler = new FabricUriHandler(null, logger as any);
        const workspaceId = '11111111-1111-1111-1111-111111111111';
        const artifactId = '22222222-2222-2222-2222-222222222222';
        const uri = vscode.Uri.parse(`vscode://fabric.vscode-fabric/?workspaceId=${workspaceId}&&artifactId=${artifactId}`);

        await handler.handleUri(uri);

        assert(executeCommandStub.calledOnce, 'executeCommand should be called');
        assert.strictEqual(executeCommandStub.firstCall.args[0], 'vscode-fabric.exportArtifact');
        const params = executeCommandStub.firstCall.args[1];
        assert.strictEqual(params.artifactId, artifactId);
        assert.strictEqual(params.workspaceId, workspaceId);
        assert(!('environment' in params), 'environment should not be set');
    });

    it('should log debug for valid invocation', async () => {
        const handler = new FabricUriHandler(null, logger as any);
        const workspaceId = '11111111-1111-1111-1111-111111111111';
        const artifactId = '22222222-2222-2222-2222-222222222222';
        const environmentId = 'DEV';
        const uri = vscode.Uri.parse(`vscode://fabric.vscode-fabric/?workspaceId=${workspaceId}&&artifactId=${artifactId}&&Environment=${environmentId}`);

        await handler.handleUri(uri);
        assert(logger.debug.calledOnce, 'debug should be called');
        assert(logger.debug.firstCall.args[0].includes(workspaceId), 'debug should include workspaceId');
        assert(logger.debug.firstCall.args[0].includes(artifactId), 'debug should include artifactId');
        assert(logger.debug.firstCall.args[0].includes(environmentId), 'debug should include environmentId');
    });

    it('should log error if exportArtifact command fails', async () => {
        const handler = new FabricUriHandler(null, logger as any);
        const workspaceId = '11111111-1111-1111-1111-111111111111';
        const artifactId = '22222222-2222-2222-2222-222222222222';
        const environmentId = 'PROD';
        const uri = vscode.Uri.parse(`vscode://fabric.vscode-fabric/?workspaceId=${workspaceId}&&artifactId=${artifactId}&&Environment=${environmentId}`);
        const errorMsg = 'Simulated export error';
        executeCommandStub.rejects(new Error(errorMsg));

        const showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage').returns(undefined as any);
        await handler.handleUri(uri);
        // Should not throw, but should log the error via reportExceptionTelemetryAndLog
        assert(logger.reportExceptionTelemetryAndLog.called, 'reportExceptionTelemetryAndLog should be called');
        assert(showErrorMessageStub.called, 'showErrorMessage should be called');
    });
});
