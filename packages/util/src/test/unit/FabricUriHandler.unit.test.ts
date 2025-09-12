import * as assert from 'assert';
import * as vscode from 'vscode';
import { Mock, It } from 'moq.ts';

import { FabricUriHandler } from '../../FabricUriHandler';
import { MockConsoleLogger } from '../../logger/Logger';
import { IFabricExtensionServiceCollection } from '@microsoft/vscode-fabric-api';
import { getFabricEnvironment, IFabricEnvironmentProvider } from '../../settings/FabricEnvironmentProvider';
import { FabricEnvironmentName } from '../../settings/FabricEnvironment';
import { IConfigurationProvider } from '../../settings/ConfigurationProvider';

describe('FabricUriHandler Unit Tests - Invalid IDs', function () {
    // Explicit valid GUID to satisfy format checks
    const validGuidWorkspace: string = '11111111-2222-3333-4444-555555555555';
    const validGuidArtifact: string = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    let core: IFabricExtensionServiceCollection;
    let logger: MockConsoleLogger;
    let fabricEnvironmentProvider: IFabricEnvironmentProvider;
    let configProviderMock: Mock<IConfigurationProvider>;

    beforeEach(function () {
        // Core is not used in invalid-id paths; provide a minimal placeholder cast
        core = {} as unknown as IFabricExtensionServiceCollection;
        logger = new MockConsoleLogger('Fabric Util Tests');

        const fabricEnvProviderMock = new Mock<IFabricEnvironmentProvider>();
        fabricEnvProviderMock.setup(p => p.getCurrent()).returns(getFabricEnvironment(FabricEnvironmentName.MOCK));
        fabricEnvironmentProvider = fabricEnvProviderMock.object();

        configProviderMock = new Mock<IConfigurationProvider>();
        // Not used in these tests, but ensure calls would succeed if reached
        configProviderMock.setup(p => p.update(It.IsAny(), It.IsAny())).returns(Promise.resolve());
    });

    it('should log error for invalid workspace ID', async function () {
        const handler = new FabricUriHandler(core, null, logger, fabricEnvironmentProvider, configProviderMock.object());
        const invalidWorkspaceId: string = validGuidWorkspace.replace('1', 'Z');
        const uri = vscode.Uri.parse(`vscode://fabric.vscode-fabric/?workspaceId=${invalidWorkspaceId}&&artifactId=${validGuidArtifact}`);

        try {
            await handler.handleUri(uri);
            assert.fail('Expected handler to throw for invalid workspace ID');
        }
        catch {
            // Expected path; verify log contains specific message snippet
            assert(logger.logMessagesArray.some(m => m.includes('Invalid workspace identifier')),
                'Expected log message to contain "Invalid workspace identifier"');
        }
    });

    it('should log error for invalid artifact ID', async function () {
        const handler = new FabricUriHandler(core, null, logger, fabricEnvironmentProvider, configProviderMock.object());
        const invalidArtifactId: string = validGuidArtifact.replace('a', 'Z');
        const uri = vscode.Uri.parse(`vscode://fabric.vscode-fabric/?workspaceId=${validGuidWorkspace}&&artifactId=${invalidArtifactId}`);

        try {
            await handler.handleUri(uri);
            assert.fail('Expected handler to throw for invalid artifact ID');
        }
        catch {
            // Expected path; verify log contains specific message snippet
            assert(logger.logMessagesArray.some(m => m.includes('Invalid artifact identifier')),
                'Expected log message to contain "Invalid artifact identifier"');
        }
    });

    it('should log error for invalid environment ID', async function () {
        const handler = new FabricUriHandler(core, null, logger, fabricEnvironmentProvider, configProviderMock.object());
        const invalidEnvironmentId: string = 'INVALID_ENV';
        const uri = vscode.Uri.parse(`vscode://fabric.vscode-fabric/?workspaceId=${validGuidWorkspace}&&artifactId=${validGuidArtifact}&&Environment=${invalidEnvironmentId}`);

        try {
            await handler.handleUri(uri);
            assert.fail('Expected handler to throw for invalid environment ID');
        }
        catch {
            // Expected path; verify log contains specific message snippet
            assert(logger.logMessagesArray.some(m => m.includes('Environment parameter not valid')),
                'Expected log message to contain "Environment parameter not valid"');
        }
    });

    it('should update configuration when environment ID is different from current', async function () {
        const handler = new FabricUriHandler(core, null, logger, fabricEnvironmentProvider, configProviderMock.object());
        const differentEnvironmentId: string = 'PROD'; // Current is MOCK from setup
        const uri = vscode.Uri.parse(`vscode://fabric.vscode-fabric/?workspaceId=${validGuidWorkspace}&&artifactId=${validGuidArtifact}&&Environment=${differentEnvironmentId}`);

        // Mock the core services needed for the full flow
        const workspaceManagerMock = new Mock<any>();
        const artifactManagerMock = new Mock<any>();
        const mockArtifact = { id: validGuidArtifact, name: 'TestArtifact' };

        workspaceManagerMock.setup(wm => wm.clearPriorStateIfAny()).returns(undefined);
        workspaceManagerMock.setup(wm => wm.getItemsInWorkspace(validGuidWorkspace)).returns(Promise.resolve([mockArtifact]));
        artifactManagerMock.setup(am => am.openArtifact(mockArtifact)).returns(Promise.resolve());

        const coreWithMocks = {
            workspaceManager: workspaceManagerMock.object(),
            artifactManager: artifactManagerMock.object(),
        } as unknown as IFabricExtensionServiceCollection;

        const handlerWithMocks = new FabricUriHandler(coreWithMocks, null, logger, fabricEnvironmentProvider, configProviderMock.object());

        // Mock vscode.window.showInformationMessage to return 'Yes' for opening artifact
        const originalShowInformationMessage = vscode.window.showInformationMessage;
        vscode.window.showInformationMessage = async () => 'Yes' as any;

        // Mock vscode.commands.executeCommand to avoid actual command execution
        const originalExecuteCommand = vscode.commands.executeCommand;
        vscode.commands.executeCommand = async () => undefined as any;

        try {
            await handlerWithMocks.handleUri(uri);

            // Verify that configuration update was called with the new environment
            configProviderMock.verify(p => p.update('Environment', differentEnvironmentId), It.IsAny());
        }
        finally {
            // Restore original functions
            vscode.window.showInformationMessage = originalShowInformationMessage;
            vscode.commands.executeCommand = originalExecuteCommand;
        }
    });
});
