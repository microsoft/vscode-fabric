import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import * as azApi from '@azure/core-rest-pipeline';

import { commandNames } from '../../constants';
import { ArtifactTreeNode, IArtifact, RuntimeType } from '@microsoft/vscode-fabric-api';
import { FabricEnvironmentName, sleep } from '@microsoft/vscode-fabric-util';
import { FakeFabricApiClient } from '../../fabric/FakeFabricApiClient';

/**
 * Integration Test for Workspace and Artifact Management
 * 
 * This test follows the RFC 005 integration testing strategy using FakeFabricApiClient
 * to intercept HTTP calls while preserving all business logic execution.
 * 
 * Test Coverage:
 * - Workspace listing and selection
 * - Artifact creation, opening, updating, and deletion
 * - Tree view state management and UI integration
 * - VS Code editor integration
 */
describe('Workspace and Artifact Management Integration Tests', function() {
    const sleepAmount = 1000;
    const testTimeOut = 60 * 1000;

    // Helper function to find tree view items
    async function findTreeViewItem(provider: any, parent: any, label: string): Promise<any> {
        if (!provider) {
            return undefined;
        }
        
        const children = await provider.getChildren(parent);
        if (!children) {
            return undefined;
        }
        
        for (const child of children) {
            if (child.label === label) {
                return child;
            }
            
            // Recursively search in children
            const found = await findTreeViewItem(provider, child, label);
            if (found) {
                return found;
            }
        }
        
        return undefined;
    }

    // Helper function to activate the core extension
    async function activateCore() {
        const extensionId = 'fabric.vscode-fabric';
        const extension = vscode.extensions.getExtension(extensionId);

        if (extension) {
            await extension.activate();
            const exports = extension.exports;
            return exports;
        }
        else {
            throw new Error('Failed to activate core extension');
        }
    }

    it('should manage workspace and artifact lifecycle with FakeFabricApiClient', async function() {
        this.timeout(testTimeOut);
        
        console.log('Starting integration test with FakeFabricApiClient');
        
        // Ensure test hooks and fakes are enabled
        const testHooksEnabled = process.env['VSCODE_FABRIC_ENABLE_TEST_HOOKS'] === 'true';
        const testFakesEnabled = process.env['VSCODE_FABRIC_ENABLE_TEST_FAKES'] === 'true';
        
        if (!testHooksEnabled || !testFakesEnabled) {
            throw new Error('Test hooks and fakes must be enabled. Set VSCODE_FABRIC_ENABLE_TEST_HOOKS=true and VSCODE_FABRIC_ENABLE_TEST_FAKES=true');
        }

        // Activate the core extension
        const core = await activateCore();
        
        assert(core, 'Failed to activate core extension');
        assert(core.testHooks, 'Failed to get test hooks from core');
        
        // Get FakeFabricApiClient from test hooks
        const fakeFabricApiClient = core.testHooks['fakeFabricApiClient'] as FakeFabricApiClient;
        assert(fakeFabricApiClient, 'Failed to get FakeFabricApiClient from test hooks');
        
        const coreApi = core.testHooks['serviceCollection'];
        assert(coreApi, 'Failed to get service collection');

        // Verify workspace folder exists
        // assert(vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length === 1);

        // Configure HTTP responses for workspace operations
        setupWorkspaceResponses(fakeFabricApiClient);

        // Activate extension view
        await vscode.commands.executeCommand('workbench.view.extension.vscode-fabric_view_workspace');
        await sleep(sleepAmount);

        // Initialize extension with progress indicator
        await vscode.window.withProgress({
            location: { viewId: 'vscode-fabric.view.workspace' },
            cancellable: false
        }, async () => {
            await sleep(3000);
        });

        console.log('Extension initialized, testing workspace operations');
        
        // Test workspace listing and selection
        const workspaceManager = coreApi.workspaceManager;
        assert(workspaceManager, 'WorkspaceManager not initialized');

        const workspaces = await workspaceManager.listWorkspaces();
        assert(workspaces && workspaces.length > 0, 'No workspaces found');
        
        // Select the last workspace - use the workspace with proper ID
        const selectedWorkspace = workspaces.find((w: any) => w.objectId === 'test-workspace-2') || workspaces[workspaces.length - 1];
        console.log('Workspace selected:', selectedWorkspace.displayName, 'ID:', selectedWorkspace.objectId);

        // Configure HTTP responses for artifact operations
        const dateNow = new Date();
        const artifactName = `TestArtifact${dateNow.getHours()}${dateNow.getMinutes()}${dateNow.getSeconds()}`;
        setupArtifactResponses(fakeFabricApiClient, artifactName, selectedWorkspace.objectId);

        // Test artifact creation
        const newArtifact: IArtifact = {
            id: '',
            type: 'SynapseNotebook',
            displayName: artifactName,
            description: 'Test artifact description',
            workspaceId: selectedWorkspace.objectId,
            attributes: { runtime: RuntimeType.DotNet },
            fabricEnvironment: FabricEnvironmentName.MOCK
        };

        await coreApi.artifactManager.createArtifact(newArtifact);
        await sleep(sleepAmount);

        // Force tree view refresh
        console.log('Triggering tree view refresh...');
        if (workspaceManager.tvProvider && workspaceManager.tvProvider.refresh) {
            workspaceManager.tvProvider.refresh();
            await sleep(sleepAmount); // Give time for refresh
        }

        // Verify artifact appears in tree view
        const tvProvider = workspaceManager.tvProvider;
        assert(tvProvider, 'Tree view provider not available');
        
        console.log('Searching for artifact in tree view...');
        const newNode = await findTreeViewItem(tvProvider, undefined, newArtifact.displayName);
        assert(newNode, `Unable to find created artifact '${newArtifact.displayName}' in tree view`);

        // Test artifact opening in editor
        await vscode.commands.executeCommand(commandNames.openArtifact, newNode, 'Selected');
        await sleep(2 * sleepAmount);

        const editor = vscode.window.activeTextEditor;
        assert(editor, 'Editor not found after opening artifact');

        const { document } = editor;
        console.log('Editor opened with file:', document.fileName);
        
        // Verify correct file is opened
        assert.strictEqual(document.fileName, path.sep + `${artifactName}.json`);
        assert.strictEqual((newNode as ArtifactTreeNode).label, artifactName);

        // Test artifact update
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Updating Artifact ${artifactName}`,
        }, async (progress, token) => {
            const resp = await coreApi.artifactManager.updateArtifact(newArtifact, new Map<string, string>());
            assert(resp, 'Update response should not be null');
            
            // Verify update response format
            console.log('Update response:', JSON.stringify(resp?.parsedBody));
            assert(resp?.parsedBody?.Message?.startsWith('Artifact updated successfully'), 'Update response message incorrect');
        });

        await sleep(sleepAmount);

        // Force tree view refresh after update
        console.log('Triggering tree view refresh after update...');
        if (workspaceManager.tvProvider && workspaceManager.tvProvider.refresh) {
            workspaceManager.tvProvider.refresh();
            await sleep(sleepAmount); // Give time for refresh
        }

        // Verify tree view reflects update
        const updatedNode = await findTreeViewItem(tvProvider, undefined, artifactName) as ArtifactTreeNode;
        assert(updatedNode, 'Updated artifact not found in tree view');
        console.log('Updated artifact description:', updatedNode.artifact.description);
        assert(updatedNode.artifact.description!.includes('Updated Artifact'), 'Artifact description not updated');

        console.log('Artifact updated successfully, testing deletion');

        // Test artifact deletion
        await coreApi.artifactManager.deleteArtifact(newArtifact);
        await sleep(sleepAmount);
        
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await sleep(sleepAmount);

        // Force tree view refresh after deletion
        console.log('Triggering tree view refresh after deletion...');
        if (workspaceManager.tvProvider && workspaceManager.tvProvider.refresh) {
            workspaceManager.tvProvider.refresh();
            await sleep(sleepAmount); // Give time for refresh
        }

        // Verify artifact no longer appears in tree view
        const deletedNode = await findTreeViewItem(tvProvider, undefined, artifactName);
        assert.strictEqual(deletedNode, undefined, 'Deleted artifact should not be found in tree view');

        console.log('Integration test completed successfully');
    });
});

/**
 * Configure FakeFabricApiClient responses for workspace operations
 */
function setupWorkspaceResponses(fakeFabricApiClient: FakeFabricApiClient): void {
    fakeFabricApiClient.respondWith(async (request: azApi.PipelineRequest) => {
        console.log(`HTTP Request: ${request.method} ${request.url}`);
        
        // Handle workspace listing
        if (request.method === 'GET' && request.url?.includes('/workspaces') && !request.url?.includes('/items') && !request.url?.includes('/git')) {
            return {
                status: 200,
                headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
                bodyAsText: JSON.stringify({
                    value: [
                        {
                            objectId: 'test-workspace-1',
                            displayName: 'Test Workspace 1',
                            description: 'First test workspace',
                            type: 'Workspace',
                            capacityId: '1'
                        },
                        {
                            objectId: 'test-workspace-2', 
                            displayName: 'Test Workspace 2',
                            description: 'Second test workspace',
                            type: 'Workspace',
                            capacityId: '2'
                        }
                    ]
                }),
                request
            };
        }

        // Handle git connection endpoint
        if (request.method === 'GET' && request.url?.includes('/git/connection')) {
            return {
                status: 200,
                headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
                bodyAsText: JSON.stringify({
                    gitProviderDetails: null
                }),
                request
            };
        }

        // Handle artifact listing (items endpoint)
        if (request.method === 'GET' && request.url?.includes('/items')) {
            return {
                status: 200,
                headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
                bodyAsText: JSON.stringify({
                    value: [] // Empty initially
                }),
                request
            };
        }

        // Default response for unhandled requests
        return {
            status: 404,
            headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
            bodyAsText: JSON.stringify({ error: 'Not found' }),
            request
        };
    });
}

/**
 * Configure FakeFabricApiClient responses for artifact operations
 */
function setupArtifactResponses(fakeFabricApiClient: FakeFabricApiClient, artifactName: string, workspaceId: string): void {
    // Simple state tracking for created artifacts
    const createdArtifacts: any[] = [];
    
    fakeFabricApiClient.respondWith(async (request: azApi.PipelineRequest) => {
        console.log(`HTTP Request: ${request.method} ${request.url}`);
        
        // Handle workspace listing (inherited from workspace setup)
        if (request.method === 'GET' && request.url?.includes('/workspaces') && !request.url?.includes('/items') && !request.url?.includes('/git')) {
            return {
                status: 200,
                headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
                bodyAsText: JSON.stringify({
                    value: [
                        {
                            objectId: 'test-workspace-1',
                            displayName: 'Test Workspace 1',
                            description: 'First test workspace',
                            type: 'Workspace',
                            capacityId: '1'
                        },
                        {
                            objectId: 'test-workspace-2',
                            displayName: 'Test Workspace 2', 
                            description: 'Second test workspace',
                            type: 'Workspace',
                            capacityId: '2'
                        }
                    ]
                }),
                request
            };
        }

        // Handle git connection endpoint
        if (request.method === 'GET' && request.url?.includes('/git/connection')) {
            return {
                status: 200,
                headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
                bodyAsText: JSON.stringify({
                    gitProviderDetails: null
                }),
                request
            };
        }

        // Handle artifact listing (items endpoint) - return created artifacts
        if (request.method === 'GET' && request.url?.includes('/items') && !request.url?.match(/\/items\/[\w-]+$/)) {
            return {
                status: 200,
                headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
                bodyAsText: JSON.stringify({
                    value: createdArtifacts
                }),
                request
            };
        }

        // Handle individual artifact GET (items/{id} endpoint)
        if (request.method === 'GET' && request.url?.match(/\/items\/[\w-]+$/)) {
            const artifactId = request.url.split('/').pop();
            const artifact = createdArtifacts.find(a => a.id === artifactId);
            
            if (artifact) {
                return {
                    status: 200,
                    headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
                    bodyAsText: JSON.stringify(artifact),
                    request
                };
            }
            else {
                return {
                    status: 404,
                    headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
                    bodyAsText: JSON.stringify({ error: 'Artifact not found' }),
                    request
                };
            }
        }

        // Handle artifact creation (items endpoint)
        if (request.method === 'POST' && request.url?.includes('/items')) {
            const artifactId = `artifact-${Date.now()}`;
            const newArtifact = {
                id: artifactId,
                type: 'Notebook',
                displayName: artifactName,
                description: 'Test artifact description',
                workspaceId: workspaceId,
                definition: {}
            };
            
            // Add to our state tracking
            createdArtifacts.push(newArtifact);
            
            return {
                status: 201,
                headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
                bodyAsText: JSON.stringify(newArtifact),
                request
            };
        }

        // Handle artifact update (items endpoint)
        if (request.method === 'PATCH' && request.url?.includes('/items')) {
            // Update the artifact in our state
            const artifact = createdArtifacts.find(a => a.displayName === artifactName);
            if (artifact) {
                artifact.description = 'Updated Artifact - Test artifact description';
            }
            
            return {
                status: 200,
                headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
                bodyAsText: JSON.stringify({
                    Message: 'Artifact updated successfully',
                    artifactId: artifactName,
                    description: 'Updated Artifact - Test artifact description'
                }),
                request
            };
        }

        // Handle artifact deletion (items endpoint)
        if (request.method === 'DELETE' && request.url?.includes('/items')) {
            // Remove from our state tracking
            const index = createdArtifacts.findIndex(a => a.displayName === artifactName);
            if (index >= 0) {
                createdArtifacts.splice(index, 1);
            }
            
            return {
                status: 200,
                headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
                bodyAsText: JSON.stringify({
                    Message: 'Artifact deleted successfully'
                }),
                request
            };
        }

        // Handle artifact content/binary upload
        if (request.method === 'PUT' || request.url?.includes('/uploadBinary')) {
            return {
                status: 200,
                headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
                bodyAsText: JSON.stringify({
                    Message: 'UploadBinary called successfully'
                }),
                request
            };
        }

        // Default response for unhandled requests
        console.warn(`Unhandled request: ${request.method} ${request.url}`);
        return {
            status: 404,
            headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
            bodyAsText: JSON.stringify({ error: 'Not found' }),
            request
        };
    });
}
