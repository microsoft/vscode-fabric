/* eslint-disable @typescript-eslint/naming-convention */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateCore, VSCodeUIBypass, sleep, ILogger, IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { ArtifactTreeNode, IArtifact, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { commandNames } from '../../src/constants';
import { DeleteArtifactRemoteOnlyAction } from '../../src/artifactManager/deleteArtifactCommand';
import { FabricWorkspaceDataProvider } from '../../src/workspace/treeView';
import { CreateItemTypeQuickPickItem } from '../../src/artifactManager/createArtifactCommand';
import { fabricItemMetadata } from '../../src/metadata/fabricItemMetadata';
import { CreateItemsProvider } from '../../src/metadata/CreateItemsProvider';
import { TestEnvironmentConfig } from '../utilities/TestEnvironmentConfig';

describe('Create Notebook E2E Test', function () {
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

        // Configure test environment using centralized configuration utility
        const configurationProvider = core.testHooks['configurationProvider'] as IConfigurationProvider;
        assert(configurationProvider, 'Failed to get ConfigurationProvider from test hooks');

        const customEnv = await TestEnvironmentConfig.configureTestEnvironment(configurationProvider);
        assert(customEnv, 'Test environment must be enabled. Set the following environment variables: FABRIC_TEST_CLIENT_ID, FABRIC_TEST_SHARED_URI, FABRIC_TEST_PORTAL_URI, FABRIC_TEST_ENVIRONMENT_NAME');

        // Get UI bypass from test hooks (this runs in the extension context)
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

    it('should create notebook successfully', async function () {
        this.timeout(testTimeOut);
        await vscode.commands.executeCommand('workbench.view.extension.vscode-fabric_view_workspace');
        await sleep(500);

        // Setup UI bypass
        const itemsProvider = new CreateItemsProvider(fabricItemMetadata).getItemsForCreate(core.testHooks['context'].extensionUri);
        const notebookItemType = itemsProvider.find(item => item.type === 'Notebook')!;

        // We expect two quick picks in this test, first for Workspace selection, and second for Item Type selection
        const workspace = {
            objectId: 'fbf775b3-5d02-4e36-bff6-483241559ba7',
            description: '',
            type: 'Workspace',
            displayName: 'VSCode E2E Test Workspace',
            capacityId: '5a804ffb-6bd9-4590-aeab-42aa1eaf9473',
        };
        const workspaceResponse = { label: workspace.displayName, workspace: workspace };
        uiBypass.setQuickPickResponseQueue([workspaceResponse, new CreateItemTypeQuickPickItem(notebookItemType)]);

        // Just one one input box for Item name
        const notebookName = `Test Notebook ${Date.now()}`;
        uiBypass.setInputBoxResponse(notebookName);

        // Act
        const createdArtifact = await vscode.commands.executeCommand<IArtifact | undefined>(commandNames.createArtifact);
        await sleep(500);

        // Assert
        assert(createdArtifact, 'Expected createdArtifact to be defined');
        assert(createdArtifact.id, 'Expected createdArtifact.id to be defined');
        assert(createdArtifact.type === 'Notebook', 'Expected createdArtifact.type to be \'Notebook\'');
        assert(createdArtifact.displayName === notebookName, `Expected createdArtifact.displayName to be '${notebookName}'`);

        // Consider changing `commandNames.deleteArtifact` so it uses simple string message items.
        // This would allow for a more straightforward setup like: `uiBypass.setWarningMessageResponse('Remote Only');`
        // and not have to export and create a new DeleteArtifactRemoteOnlyAction instance in the test.
        uiBypass.setWarningMessageResponse(
            new DeleteArtifactRemoteOnlyAction(
                vscode.l10n.t('Remote Only'),
                core.testHooks['artifactManager'] as IArtifactManager,
                core.testHooks['workspaceDataProvider'] as FabricWorkspaceDataProvider,
                undefined!,
                null,
                core.testHooks['logger'] as ILogger
            ));

        // Ideally deleteArtifact command would return something we can assert against to know the delete was successful
        await vscode.commands.executeCommand(commandNames.deleteArtifact, { artifact: createdArtifact } as ArtifactTreeNode);
        await sleep(500);
    });
});
