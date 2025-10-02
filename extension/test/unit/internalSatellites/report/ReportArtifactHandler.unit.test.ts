import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';

import { ReportArtifactHandler } from '../../../../src/internalSatellites/report/ReportArtifactHandler';
import * as uiModule from '../../../../src/ui/showItemQuickPick';
import { FabricError, UserCancelledError, ILogger, TelemetryService } from '@microsoft/vscode-fabric-util';
import { IArtifact, IWorkspace, IWorkspaceManager, IArtifactManager, IItemDefinition } from '@microsoft/vscode-fabric-api';
import { IWorkspaceFilterManager } from '../../../../src/workspace/WorkspaceFilterManager';

// Helper to base64 encode json
function encodeJson(obj: any): string { return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64'); }

// Extract & decode the definition.pbir JSON from a definition (if present)
function decodeDefinition(definition: IItemDefinition): any | undefined {
    const part = definition.parts?.find(p => p.path?.toLowerCase?.().endsWith('definition.pbir'));
    if (!part) { return undefined; }
    try {
        const txt = Buffer.from(part.payload, 'base64').toString('utf8');
        return JSON.parse(txt);
    }
    catch { return undefined; }
}

describe('ReportArtifactHandler', function() {
    let handler: ReportArtifactHandler;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let artifactManagerMock: Mock<IArtifactManager>;
    let workspaceFilterManagerMock: Mock<IWorkspaceFilterManager>;
    let loggerMock: Mock<ILogger>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let showItemQuickPickStub: sinon.SinonStub;
    let sandbox: sinon.SinonSandbox;

    const artifact: IArtifact = { id: 'rep-1', type: 'Report', workspaceId: 'ws-1' } as any;
    const workspace: IWorkspace = { id: 'ws-1' } as any;

    before(function() {
        // No global setup
    });

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        handler = new ReportArtifactHandler();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        artifactManagerMock = new Mock<IArtifactManager>();
        workspaceFilterManagerMock = new Mock<IWorkspaceFilterManager>();
        loggerMock = new Mock<ILogger>();
        telemetryServiceMock = new Mock<TelemetryService>();

        // Ensure logger.log exists for tests; no-op implementation capturing messages if needed later
        loggerMock.setup(l => l.log(It.IsAny<string>(), It.IsAny(), It.IsAny())).callback(() => { /* no-op */ });
        loggerMock.setup(l => l.show()).callback(() => { /* no-op */ });

        workspaceManagerMock.setup(x => x.getWorkspaceById('ws-1')).returns(Promise.resolve(workspace));

        showItemQuickPickStub = sandbox.stub(uiModule, 'showItemQuickPick');

        handler.initialize(
            workspaceManagerMock.object(),
            artifactManagerMock.object(),
            telemetryServiceMock.object(),
            loggerMock.object(),
            workspaceFilterManagerMock.object()
        );
    });

    afterEach(function() {
        sandbox.restore();
    });

    after(function() {
        // No global teardown
    });

    it('should skip prompt when datasetReference.byConnection already present', async function() {
        // Arrange
        const existing = { datasetReference: { byConnection: { connectionString: 'semanticmodelid=abc' } } };
        const definition: IItemDefinition = { parts: [ { path: 'definition.pbir', payload: encodeJson(existing) } ] } as any;

        // Act
        const result = await handler.updateDefinitionWorkflow.onBeforeUpdateDefinition(artifact, definition, vscode.Uri.file('/virtual'), {} as any);

        // Assert
        assert.ok(result, 'Options should be returned');
        assert.equal(showItemQuickPickStub.called, false, 'Should not invoke quick pick when already connected');
        const after = decodeDefinition(definition);
        assert.deepStrictEqual(after, existing, 'Definition content should remain unchanged');
    });

    it('should throw FabricError workspace-not-found when workspace missing', async function() {
        // Arrange
        const existing = { datasetReference: { byPath: { path: '../SemanticModel/model' } } };
        const definition: IItemDefinition = { parts: [ { path: 'definition.pbir', payload: encodeJson(existing) } ] } as any;
        workspaceManagerMock.setup(x => x.getWorkspaceById('ws-1')).returns(Promise.resolve(undefined as any));

        // Act & Assert
        await assert.rejects(
            () => handler.updateDefinitionWorkflow.onBeforeUpdateDefinition(artifact, definition, vscode.Uri.file('/virtual'), {} as any),
            (err: any) => err instanceof FabricError && err.nonLocalizedMessage === 'workspace-not-found',
            'Expected FabricError workspace-not-found'
        );
        assert.equal(showItemQuickPickStub.called, false, 'Should not show quick pick when workspace missing');
    });

    it('should throw UserCancelledError when user cancels quick pick', async function() {
        // Arrange
        const existing = { datasetReference: { byPath: { path: '../SemanticModel/model' } } };
        const definition: IItemDefinition = { parts: [ { path: 'definition.pbir', payload: encodeJson(existing) } ] } as any;
        showItemQuickPickStub.resolves(undefined);

        // Act & Assert
        await assert.rejects(
            () => handler.updateDefinitionWorkflow.onBeforeUpdateDefinition(artifact, definition, vscode.Uri.file('/virtual'), {} as any),
            (err: any) => err instanceof UserCancelledError,
            'Expected UserCancelledError'
        );
    });

    it('should update existing definition.pbir to use byConnection', async function() {
        // Arrange
        const existing = { datasetReference: { byPath: { path: '../SemanticModel/model' } } };
        const definition: IItemDefinition = { parts: [ { path: 'definition.pbir', payload: encodeJson(existing) } ] } as any;
        const semanticModel: IArtifact = { id: 'sm-123', type: 'SemanticModel', workspaceId: 'ws-1' } as any;
        showItemQuickPickStub.resolves(semanticModel);

        // Act
        await handler.updateDefinitionWorkflow.onBeforeUpdateDefinition(artifact, definition, vscode.Uri.file('/virtual'), {} as any);

        // Assert
        const updated = decodeDefinition(definition);
        assert.ok(updated?.datasetReference?.byConnection, 'byConnection should be set');
        assert.equal(updated.datasetReference.byConnection.connectionString, 'semanticmodelid=sm-123', 'connectionString should reference semantic model id');
    });

    it('should create new definition.pbir when part missing', async function() {
        // Arrange
        const definition: IItemDefinition = { parts: [] } as any;
        const semanticModel: IArtifact = { id: 'sm-789', type: 'SemanticModel', workspaceId: 'ws-1' } as any;
        showItemQuickPickStub.resolves(semanticModel);

        // Act
        await handler.updateDefinitionWorkflow.onBeforeUpdateDefinition(artifact, definition, vscode.Uri.file('/virtual'), {} as any);

        // Assert
        const created = decodeDefinition(definition);
        assert.ok(created?.datasetReference?.byConnection, 'byConnection should be created');
        assert.equal(created.datasetReference.byConnection.connectionString, 'semanticmodelid=sm-789', 'connectionString should reference semantic model id');
    });

    it('should wrap parse failure in FabricError report-definition-update-failed', async function() {
        // Arrange
        // Invalid JSON (decode -> string -> JSON.parse fails)
        const invalidPayload = Buffer.from('{invalid-json', 'utf8').toString('base64');
        const definition: IItemDefinition = { parts: [ { path: 'definition.pbir', payload: invalidPayload } ] } as any;
        const semanticModel: IArtifact = { id: 'sm-456', type: 'SemanticModel', workspaceId: 'ws-1' } as any;
        showItemQuickPickStub.resolves(semanticModel);

        // Act & Assert
        await assert.rejects(
            () => handler.updateDefinitionWorkflow.onBeforeUpdateDefinition(artifact, definition, vscode.Uri.file('/virtual'), {} as any),
            (err: any) => err instanceof FabricError && err.nonLocalizedMessage === 'report-definition-update-failed',
            'Expected FabricError report-definition-update-failed'
        );
    });

    // ---------------------- createWithDefinitionWorkflow tests ----------------------
    it('createWithDefinitionWorkflow: skips prompt when already byConnection', async function() {
        const existing = { datasetReference: { byConnection: { connectionString: 'semanticmodelid=xyz' } } };
        const definition: IItemDefinition = { parts: [ { path: 'definition.pbir', payload: encodeJson(existing) } ] } as any;

        const result = await handler.createWithDefinitionWorkflow.onBeforeCreateWithDefinition(artifact, definition, vscode.Uri.file('/virtual'), {} as any);
        assert.ok(result, 'Options should be returned');
        assert.equal(showItemQuickPickStub.called, false, 'Should not prompt');
        const after = decodeDefinition(definition);
        assert.deepStrictEqual(after, existing, 'Definition remains unchanged');
    });

    it('createWithDefinitionWorkflow: throws FabricError when workspace missing', async function() {
        const definition: IItemDefinition = { parts: [] } as any;
        workspaceManagerMock.setup(x => x.getWorkspaceById('ws-1')).returns(undefined as any);
        await assert.rejects(
            () => handler.createWithDefinitionWorkflow.onBeforeCreateWithDefinition(artifact, definition, vscode.Uri.file('/virtual'), {} as any),
            (err: any) => err instanceof FabricError && err.nonLocalizedMessage === 'workspace-not-found'
        );
    });

    it('createWithDefinitionWorkflow: throws UserCancelledError on cancel', async function() {
        const definition: IItemDefinition = { parts: [] } as any;
        showItemQuickPickStub.resolves(undefined);
        await assert.rejects(
            () => handler.createWithDefinitionWorkflow.onBeforeCreateWithDefinition(artifact, definition, vscode.Uri.file('/virtual'), {} as any),
            (err: any) => err instanceof UserCancelledError
        );
    });

    it('createWithDefinitionWorkflow: binds existing part to byConnection', async function() {
        const existing = { datasetReference: { byPath: { path: '../SemanticModel/model' } } };
        const definition: IItemDefinition = { parts: [ { path: 'definition.pbir', payload: encodeJson(existing) } ] } as any;
        const semanticModel: IArtifact = { id: 'sm-create-1', type: 'SemanticModel', workspaceId: 'ws-1' } as any;
        showItemQuickPickStub.resolves(semanticModel);
        await handler.createWithDefinitionWorkflow.onBeforeCreateWithDefinition(artifact, definition, vscode.Uri.file('/virtual'), {} as any);
        const updated = decodeDefinition(definition);
        assert.ok(updated?.datasetReference?.byConnection, 'byConnection should be set');
        assert.equal(updated.datasetReference.byConnection.connectionString, 'semanticmodelid=sm-create-1');
    });

    it('createWithDefinitionWorkflow: creates part when missing', async function() {
        const definition: IItemDefinition = { parts: [] } as any;
        const semanticModel: IArtifact = { id: 'sm-create-2', type: 'SemanticModel', workspaceId: 'ws-1' } as any;
        showItemQuickPickStub.resolves(semanticModel);
        await handler.createWithDefinitionWorkflow.onBeforeCreateWithDefinition(artifact, definition, vscode.Uri.file('/virtual'), {} as any);
        const created = decodeDefinition(definition);
        assert.ok(created?.datasetReference?.byConnection, 'byConnection should be created');
        assert.equal(created.datasetReference.byConnection.connectionString, 'semanticmodelid=sm-create-2');
    });

    it('createWithDefinitionWorkflow: wraps parse failure in FabricError', async function() {
        const invalidPayload = Buffer.from('{invalid-json', 'utf8').toString('base64');
        const definition: IItemDefinition = { parts: [ { path: 'definition.pbir', payload: invalidPayload } ] } as any;
        const semanticModel: IArtifact = { id: 'sm-create-3', type: 'SemanticModel', workspaceId: 'ws-1' } as any;
        showItemQuickPickStub.resolves(semanticModel);
        await assert.rejects(
            () => handler.createWithDefinitionWorkflow.onBeforeCreateWithDefinition(artifact, definition, vscode.Uri.file('/virtual'), {} as any),
            (err: any) => err instanceof FabricError && err.nonLocalizedMessage === 'report-definition-update-failed'
        );
    });
});
