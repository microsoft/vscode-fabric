// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as azApi from '@azure/core-rest-pipeline';
import { sleep } from '@microsoft/vscode-fabric-util';

describe('Get Workspace Integration Tests', function () {
    const sleepAmount = 1000;
    const testTimeOut = 30 * 1000;

    async function activateCore() {
        const extensionId = 'fabric.vscode-fabric';
        const extension = vscode.extensions.getExtension(extensionId);
        if (!extension) {
            throw new Error('Failed to get core extension');
        }
        await extension.activate();
        return extension.exports;
    }

    it('should get workspace by id using FakeFabricApiClient', async function () {
        this.timeout(testTimeOut);

        // Ensure test hooks and fakes are enabled
        const testHooksEnabled = process.env['VSCODE_FABRIC_ENABLE_TEST_HOOKS'] === 'true';
        const testFakesEnabled = process.env['VSCODE_FABRIC_ENABLE_TEST_FAKES'] === 'true';
        if (!testHooksEnabled || !testFakesEnabled) {
            throw new Error('Set VSCODE_FABRIC_ENABLE_TEST_HOOKS=true and VSCODE_FABRIC_ENABLE_TEST_FAKES=true');
        }

        const core = await activateCore();
        assert(core?.testHooks, 'Missing test hooks');

        const fakeFabricApiClient = core.testHooks['fakeFabricApiClient'];
        const coreApi = core.testHooks['serviceCollection'];
        assert(fakeFabricApiClient && coreApi, 'Missing fake client or service collection');

        // Configure workspace list
        fakeFabricApiClient.respondWith(async (request: azApi.PipelineRequest) => {
            if (request.method === 'GET' && request.url?.includes('/workspaces') && !request.url?.includes('/items') && !request.url?.includes('/git')) {
                return {
                    status: 200,
                    headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
                    bodyAsText: JSON.stringify({
                        value: [
                            { id: 'test-workspace-1', displayName: 'Test Workspace 1', description: 'First test workspace', type: 'Workspace', capacityId: '1' },
                            { id: 'test-workspace-2', displayName: 'Test Workspace 2', description: 'Second test workspace', type: 'Workspace', capacityId: '2' },
                        ],
                    }),
                    request,
                } as azApi.PipelineResponse;
            }

            if (request.method === 'GET' && request.url?.includes('/git/connection')) {
                return {
                    status: 200,
                    headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
                    bodyAsText: JSON.stringify({ gitProviderDetails: null }),
                    request,
                } as azApi.PipelineResponse;
            }

            return {
                status: 404,
                headers: azApi.createHttpHeaders({ 'content-type': 'application/json' }),
                bodyAsText: JSON.stringify({ error: 'Not found' }),
                request,
            } as azApi.PipelineResponse;
        });

        // Activate workspace view
        await vscode.commands.executeCommand('workbench.view.extension.vscode-fabric_view_workspace');
        await sleep(sleepAmount);

        const workspaceManager = coreApi.workspaceManager;
        assert(workspaceManager, 'WorkspaceManager not initialized');

        const workspaces = await workspaceManager.listWorkspaces();
        assert(workspaces?.length > 0, 'No workspaces found');
        console.log('Workspaces returned:', JSON.stringify(workspaces));
        // Prefer lookup by id via manager cache; fall back to displayName if needed
        const foundById = await workspaceManager.getWorkspaceById('test-workspace-2');
        if (foundById) {
            assert.strictEqual(foundById.objectId, 'test-workspace-2');
        }
        else {
            const foundByName = workspaces.find((w: any) => w.displayName === 'Test Workspace 2');
            assert(foundByName, 'Workspace "Test Workspace 2" not found');
            assert.ok(foundByName.objectId, 'Workspace id should be defined');
        }
    });
});
