// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Mock, It, Times } from 'moq.ts';

import { FabricUriHandler } from '../../src/FabricUriHandler';
import { MockConsoleLogger } from '../../src/logger/MockConsoleLogger';
import { IFabricExtensionServiceCollection, IWorkspaceManager, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { IFabricEnvironmentProvider } from '../../src/settings/FabricEnvironmentProvider';
import { IConfigurationProvider } from '../../src/settings/ConfigurationProvider';

describe('FabricUriHandler Unit Tests - Invalid IDs', function () {
    // Explicit valid GUID to satisfy format checks
    const validGuidWorkspace: string = '11111111-2222-3333-4444-555555555555';
    const validGuidArtifact: string = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    let coreMock: Mock<IFabricExtensionServiceCollection>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let artifactManagerMock: Mock<IArtifactManager>;
    let logger: MockConsoleLogger;
    let fabricEnvProviderMock: Mock<IFabricEnvironmentProvider>;
    let configProviderMock: Mock<IConfigurationProvider>;
    let executeCommandStub: sinon.SinonStub;

    beforeEach(function () {
        // Core is not used in invalid-id paths; provide a minimal placeholder cast
        coreMock = new Mock<IFabricExtensionServiceCollection>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        artifactManagerMock = new Mock<IArtifactManager>();
        logger = new MockConsoleLogger('Fabric Util Tests');
        fabricEnvProviderMock = new Mock<IFabricEnvironmentProvider>();

        fabricEnvProviderMock
            .setup(p => p.getCurrent())
            .returns({
                env: 'MOCK',
                clientId: '00000000-0000-0000-0000-000000000000',
                scopes: [],
                sharedUri: '',
                portalUri: '',
            });
        fabricEnvProviderMock
            .setup(p => p.switchToEnvironment(It.IsAny()))
            .returns(Promise.resolve(true));

        coreMock
            .setup(c => c.workspaceManager)
            .returns(workspaceManagerMock.object());
        coreMock
            .setup(c => c.artifactManager)
            .returns(artifactManagerMock.object());

        // Setup workspaceManager methods
        workspaceManagerMock
            .setup(wm => wm.clearPriorStateIfAny())
            .returns(undefined);

        const mockArtifact = {
            id: validGuidArtifact,
            name: 'TestArtifact',
            type: 'TestType',
            displayName: 'Test Artifact',
            workspaceId: validGuidWorkspace,
            fabricEnvironment: 'MOCK',
        };
        workspaceManagerMock
            .setup(wm => wm.getItemsInWorkspace(validGuidWorkspace))
            .returns(Promise.resolve([mockArtifact]));

        // Setup artifactManager methods
        artifactManagerMock
            .setup(am => am.openArtifact(It.IsAny()))
            .returns(Promise.resolve());

        configProviderMock = new Mock<IConfigurationProvider>();
        // Not used in these tests, but ensure calls would succeed if reached
        configProviderMock.setup(p => p.update(It.IsAny(), It.IsAny())).returns(Promise.resolve());

        // Stub VS Code executeCommand
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    });

    afterEach(function () {
        sinon.restore();
    });

    it('should log error for invalid workspace ID', async function () {
        const handler = createHandler();
        const invalidWorkspaceId: string = validGuidWorkspace.replace('1', 'Z');
        const uri = vscode.Uri.parse(`vscode://fabric.vscode-fabric/?workspaceId=${invalidWorkspaceId}&&artifactId=${validGuidArtifact}`);

        await assert.rejects(
            async () => await handler.handleUri(uri),
            /Invalid workspace identifier/,
            'Expected handler to throw for invalid workspace ID'
        );

        // Verify log contains specific message snippet
        assert(logger.logMessagesArray.some(m => m.includes('Invalid workspace identifier')),
            'Expected log message to contain "Invalid workspace identifier"');
    });

    it('should log error for invalid artifact ID', async function () {
        const handler = createHandler();
        const invalidArtifactId: string = validGuidArtifact.replace('a', 'Z');
        const uri = vscode.Uri.parse(`vscode://fabric.vscode-fabric/?workspaceId=${validGuidWorkspace}&&artifactId=${invalidArtifactId}`);

        await assert.rejects(
            async () => await handler.handleUri(uri),
            /Invalid artifact identifier/,
            'Expected handler to throw for invalid artifact ID'
        );

        // Verify log contains specific message snippet
        assert(logger.logMessagesArray.some(m => m.includes('Invalid artifact identifier')),
            'Expected log message to contain "Invalid artifact identifier"');
    });

    it('should log error for invalid environment ID', async function () {
        fabricEnvProviderMock
            .setup(p => p.switchToEnvironment(It.IsAny()))
            .returns(Promise.resolve(false));

        const handler = createHandler();
        const invalidEnvironmentId: string = 'INVALID_ENV';
        const uri = vscode.Uri.parse(`vscode://fabric.vscode-fabric/?workspaceId=${validGuidWorkspace}&&artifactId=${validGuidArtifact}&&Environment=${invalidEnvironmentId}`);

        await assert.rejects(
            async () => await handler.handleUri(uri),
            /Environment parameter not valid/,
            'Expected handler to throw for invalid environment ID'
        );

        // Verify log contains specific message snippet
        assert(logger.logMessagesArray.some(m => m.includes('Environment parameter not valid')),
            'Expected log message to contain "Environment parameter not valid"');
        fabricEnvProviderMock.verify(p => p.switchToEnvironment(It.IsAny()), Times.Once());
    });

    it('should call switchToEnvironment when environment ID is different from current', async function () {
        const handler = createHandler();
        const differentEnvironmentId: string = 'PROD'; // Current is MOCK from setup
        const uri = vscode.Uri.parse(`vscode://fabric.vscode-fabric/?workspaceId=${validGuidWorkspace}&&artifactId=${validGuidArtifact}&&Environment=${differentEnvironmentId}`);

        await handler.handleUri(uri);

        // Verify switchToEnvironment was called with the correct environment
        fabricEnvProviderMock.verify(p => p.switchToEnvironment('PROD'), Times.Once());

        // Verify VS Code executeCommand was called to show the Fabric view
        assert.strictEqual(executeCommandStub.calledOnce, true, 'executeCommand should be called once');
        assert.strictEqual(executeCommandStub.firstCall.args[0], 'workbench.view.extension.vscode-fabric_view_workspace', 'executeCommand should be called with correct view command');

        // Verify workspace and artifact operations were also called
        workspaceManagerMock.verify(wm => wm.clearPriorStateIfAny(), Times.Once());
        workspaceManagerMock.verify(wm => wm.getItemsInWorkspace(validGuidWorkspace), Times.Once());
        artifactManagerMock.verify(am => am.openArtifact(It.IsAny()), Times.Once());
    });

    it('should call switchToEnvironment even when environment ID is same as current', async function () {
        const handler = createHandler();
        const sameEnvironmentId: string = 'MOCK'; // Current is MOCK from setup
        const uri = vscode.Uri.parse(`vscode://fabric.vscode-fabric/?workspaceId=${validGuidWorkspace}&&artifactId=${validGuidArtifact}&&Environment=${sameEnvironmentId}`);

        await handler.handleUri(uri);

        // Verify switchToEnvironment was called even for same environment
        fabricEnvProviderMock.verify(p => p.switchToEnvironment('MOCK'), Times.Once());

        // Verify VS Code executeCommand was called to show the Fabric view
        assert.strictEqual(executeCommandStub.calledOnce, true, 'executeCommand should be called once');
        assert.strictEqual(executeCommandStub.firstCall.args[0], 'workbench.view.extension.vscode-fabric_view_workspace', 'executeCommand should be called with correct view command');

        // Verify workspace and artifact operations were also called
        workspaceManagerMock.verify(wm => wm.clearPriorStateIfAny(), Times.Once());
        workspaceManagerMock.verify(wm => wm.getItemsInWorkspace(validGuidWorkspace), Times.Once());
        artifactManagerMock.verify(am => am.openArtifact(It.IsAny()), Times.Once());
    });

    function createHandler(): FabricUriHandler {
        return new FabricUriHandler(
            coreMock.object(),
            null,
            logger,
            fabricEnvProviderMock.object(),
            configProviderMock.object()
        );
    }
});
