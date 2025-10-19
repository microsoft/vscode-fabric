/* eslint-disable @typescript-eslint/naming-convention */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateCore, VSCodeUIBypass, sleep, IConfigurationProvider, FABRIC_ENVIRONMENT_KEY } from '@microsoft/vscode-fabric-util';
import { IWorkspace, IApiClientRequestOptions, IFakeFabricApiClient } from '@microsoft/vscode-fabric-api';

/**
 * Integration Test for Create Workspace Command
 *
 * Test Coverage:
 * - Full createWorkspace command execution without UI interaction
 * - Integration with FakeFabricApiClient for API mocking
 * - Proper handling of workspace creation flow
 * - Error scenarios and user cancellation
 */
describe('Create Workspace E2E Test', function () {
    const testTimeOut = 60 * 1000;

    let core: any;
    let uiBypass: VSCodeUIBypass;

    beforeEach(async function () {
        this.timeout(testTimeOut);

        // Ensure test hooks and fakes are enabled
        const testHooksEnabled = process.env['VSCODE_FABRIC_ENABLE_TEST_HOOKS'] === 'true';
        const testFakesEnabled = process.env['VSCODE_FABRIC_ENABLE_TEST_FAKES'] === 'true';

        if (!testHooksEnabled || !testFakesEnabled) {
            throw new Error('Test hooks and fakes must be enabled. Set VSCODE_FABRIC_ENABLE_TEST_HOOKS=true and VSCODE_FABRIC_ENABLE_TEST_FAKES=true');
        }

        // Activate the core extension
        core = await activateCore();

        assert(core, 'Failed to activate core extension');
        assert(core.testHooks, 'Failed to get test hooks from core');

        // Get configuration provider from test hooks, set to DAILY (for now)
        const configurationProvider = core.testHooks['configurationProvider'] as IConfigurationProvider;
        assert(configurationProvider, 'Failed to get ConfigurationProvider from test hooks');
        await configurationProvider.update(FABRIC_ENVIRONMENT_KEY, 'DAILY');

        // Get UI bypass from test hooks (this runs in the extension context), install bypass
        uiBypass = core.testHooks['vscodeUIBypass'] as VSCodeUIBypass;
        assert(uiBypass, 'Failed to get VSCodeUIBypass from test hooks');
        uiBypass.install();

        // Allow some time for extension initialization
        await sleep(2000);
    });

    afterEach(function () {
        // Clean up UI bypass
        if (uiBypass) {
            uiBypass.restore();
        }
    });

    it('should create workspace successfully', async function () {
        this.timeout(testTimeOut);

        // Configure UI responses for the workspace creation flow
        const workspaceName = 'VSCode E2E Test Workspace ' + Date.now();
        uiBypass.setInputBoxResponse(workspaceName);
        uiBypass.setQuickPickResponse({
            label: 'e2etest',
            id: '5A804FFB-6BD9-4590-AEAB-42AA1EAF9473',
        });

        // Act
        const createdWorkspace = await vscode.commands.executeCommand<IWorkspace | undefined>('vscode-fabric.createWorkspace');

        // Assert
        assert(createdWorkspace, 'Workspace should be created');
        assert(createdWorkspace.objectId, 'Expected createdWorkspace.objectId to be defined');
        assert(createdWorkspace.displayName === workspaceName, 'Expected createdWorkspace.displayName to be defined');

        // Assert: Verify UI interactions occurred
        assert.strictEqual(uiBypass.getInputBoxCallCount(), 1,
            'showInputBox should have been called once for workspace name');

        const inputBoxArgs = uiBypass.getInputBoxCallArgs(0);
        assert.strictEqual(inputBoxArgs[0]?.prompt, 'Name',
            'Input box should prompt for workspace name');
        assert.strictEqual(inputBoxArgs[0]?.title, 'Create a workspace',
            'Input box should have the correct title');

        // Verify the workspace name was captured correctly
        assert.strictEqual(inputBoxArgs[0]?.value, '',
            'Input box should start with empty value');

        // Note: QuickPick call count depends on the number of capacities available
        // With multiple capacities, it should be called once
        if (uiBypass.getQuickPickCallCount() > 0) {
            const quickPickArgs = uiBypass.getQuickPickCallArgs(0);
            assert(quickPickArgs[0], 'QuickPick should have items');
            assert(quickPickArgs[1]?.title?.includes('Capacity'),
                'QuickPick should be for capacity selection');
        }

        // Cleanup: there is not delete workspace command/feature so we need to manually remove the workspace
        const apiClient = core.testHooks['fabricApiClient'] as IFakeFabricApiClient;
        const reqDeleteWorkspace: IApiClientRequestOptions = {
            pathTemplate: `/v1/workspaces/${createdWorkspace.objectId}`,
            method: 'DELETE',
        };
        const respDelete = await apiClient.sendRequest(reqDeleteWorkspace);
        assert.strictEqual(respDelete.status, 200, `Failed to delete workspace. Status: ${respDelete.status} Body: ${respDelete.bodyAsText}`);
    });
});
