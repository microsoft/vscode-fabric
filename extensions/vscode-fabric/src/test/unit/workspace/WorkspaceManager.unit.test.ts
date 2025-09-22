// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { WorkspaceManager } from '../../../workspace/WorkspaceManager';
import { IFabricExtensionsSettingStorage } from '../../../settings/definitions';
import { LocalFolderManager } from '../../../LocalFolderManager';
import { IFabricEnvironmentProvider, ILogger, FabricError } from '@microsoft/vscode-fabric-util';
import { IAccountProvider } from '../../../authentication/interfaces';
import { IApiClientResponse, IApiClientRequestOptions, IFabricApiClient } from '@microsoft/vscode-fabric-api';
import { IGitOperator } from '../../../apis/internal/fabricExtensionInternal';

describe('WorkspaceManager', function () {
    let mockExtensionSettingsStorage: Mock<IFabricExtensionsSettingStorage>;
    let mockLocalFolderManager: Mock<LocalFolderManager>;
    let mockAccountProvider: Mock<IAccountProvider>;
    let mockFabricEnvironmentProvider: Mock<IFabricEnvironmentProvider>;
    let mockApiClient: Mock<IFabricApiClient>;
    let mockGitOperator: Mock<IGitOperator>;
    let mockLogger: Mock<ILogger>;
    let workspaceManager: WorkspaceManager;

    // Event emitter mocks
    let onSignInChangedEmitter: vscode.EventEmitter<void>;
    let onTenantChangedEmitter: vscode.EventEmitter<void>;
    let onDidEnvironmentChangeEmitter: vscode.EventEmitter<void>;

    before(function () {
        // Setup operations that need to happen once before all tests
    });

    beforeEach(function () {
        // Initialize mocks for each test
        mockExtensionSettingsStorage = new Mock<IFabricExtensionsSettingStorage>();
        mockLocalFolderManager = new Mock<LocalFolderManager>();
        mockAccountProvider = new Mock<IAccountProvider>();
        mockFabricEnvironmentProvider = new Mock<IFabricEnvironmentProvider>();
        mockApiClient = new Mock<IFabricApiClient>();
        mockGitOperator = new Mock<IGitOperator>();
        mockLogger = new Mock<ILogger>();

        // Create event emitters
        onSignInChangedEmitter = new vscode.EventEmitter<void>();
        onTenantChangedEmitter = new vscode.EventEmitter<void>();
        onDidEnvironmentChangeEmitter = new vscode.EventEmitter<void>();

        // Setup event emitter mocks
        mockAccountProvider.setup(instance => instance.onSignInChanged).returns(onSignInChangedEmitter.event);
        mockAccountProvider.setup(instance => instance.onTenantChanged).returns(onTenantChangedEmitter.event);
        mockFabricEnvironmentProvider.setup(instance => instance.onDidEnvironmentChange).returns(onDidEnvironmentChangeEmitter.event);

        // Setup common mock behaviors
        mockAccountProvider.setup(instance => instance.isSignedIn(It.IsAny())).returns(Promise.resolve(true));
        mockLogger.setup(instance => instance.log(It.IsAny())).returns(undefined);

        // Mock the extensionSettingsStorage.load method since it's called in refreshConnectionToFabric
        mockExtensionSettingsStorage.setup(instance => instance.load()).returns(Promise.resolve(true));

        // Initialize workspace manager with mocks
        workspaceManager = new WorkspaceManager(
            mockAccountProvider.object(),
            mockFabricEnvironmentProvider.object(),
            mockExtensionSettingsStorage.object(),
            mockLocalFolderManager.object(),
            mockApiClient.object(),
            mockLogger.object(),
            mockGitOperator.object()
        );
    });

    afterEach(function () {
        // Clean up after each test
        onSignInChangedEmitter.dispose();
        onTenantChangedEmitter.dispose();
        onDidEnvironmentChangeEmitter.dispose();
        sinon.restore();
    });

    after(function () {
        // Teardown operations after all tests complete
    });

    it('should listen to onTenantChanged event and call refreshConnectionToFabric', async function () {
        // Arrange
        const refreshSpy = sinon.spy(workspaceManager, 'refreshConnectionToFabric');

        // Act
        // Fire the onTenantChanged event
        onTenantChangedEmitter.fire();

        // Wait for async operations to complete
        await new Promise(resolve => setTimeout(resolve, 10));

        // Assert
        assert.strictEqual(refreshSpy.calledOnce, true, 'refreshConnectionToFabric should be called when tenant changes');
    });

    it('should listen to onSignInChanged event and call refreshConnectionToFabric', async function () {
        // Arrange
        const refreshSpy = sinon.spy(workspaceManager, 'refreshConnectionToFabric');

        // Act
        // Fire the onSignInChanged event
        onSignInChangedEmitter.fire();

        // Wait for async operations to complete
        await new Promise(resolve => setTimeout(resolve, 10));

        // Assert
        assert.strictEqual(refreshSpy.calledOnce, true, 'refreshConnectionToFabric should be called when sign in status changes');
    });

    it('should register event listeners during construction', function () {
        // Arrange & Act - this happens during beforeEach when creating workspaceManager

        // Assert
        // Verify that the event listeners were registered by checking the mock setup calls
        mockAccountProvider.verify(instance => instance.onSignInChanged, Times.Once());
        mockAccountProvider.verify(instance => instance.onTenantChanged, Times.Once());
        mockFabricEnvironmentProvider.verify(instance => instance.onDidEnvironmentChange, Times.Once());
    });

    it('should handle multiple tenant changed events correctly', async function () {
        // Arrange
        const refreshSpy = sinon.spy(workspaceManager, 'refreshConnectionToFabric');

        // Act
        // Fire the onTenantChanged event multiple times
        onTenantChangedEmitter.fire();
        onTenantChangedEmitter.fire();
        onTenantChangedEmitter.fire();

        // Wait for async operations to complete
        await new Promise(resolve => setTimeout(resolve, 50));

        // Assert
        assert.strictEqual(refreshSpy.callCount, 3, 'refreshConnectionToFabric should be called for each tenant change event');
    });

    [
        { includeCapacity: true, includeDescription: true, status: 201 },
        { includeCapacity: false, includeDescription: true, status: 201 },
        { includeCapacity: true, includeDescription: false, status: 201 },
        { includeCapacity: false, includeDescription: false, status: 201 },
        { includeCapacity: false, includeDescription: false, status: 400 },
    ].forEach(({ includeCapacity, includeDescription,status }) => {
        it(`createWorkspace: includeCapacity ${includeCapacity}, includeDescription ${includeDescription}, response status ${status}`, async function () {
            const workspaceName = 'test-workspace';
            let apiResponse: IApiClientResponse = {
                status: status,
            };
            if (status === 400) {
                apiResponse.parsedBody = { errorCode: 'BadRequest', requestId: 'reqid' };
                apiResponse.response = { bodyAsText: 'Bad request' } as any;
            }
            else {
                apiResponse.parsedBody = {
                    id: 'new-id',
                    type: 'Workspace',
                    displayName: workspaceName,
                    description: includeDescription ? 'Test workspace' : undefined,
                };
            }

            mockApiClient.setup(x => x.sendRequest(It.IsAny()))
                .returns(Promise.resolve(apiResponse));

            mockAccountProvider.setup(x => x.isSignedIn())
                .returns(Promise.resolve(true));

            // Act
            const result = await workspaceManager.createWorkspace(
                workspaceName,
                {
                    capacityId: includeCapacity ? 'capacity-id' : undefined,
                    description: includeDescription ? 'Test workspace' : undefined,
                }
            );

            // Assert
            assert.strictEqual(result, apiResponse, 'Should return API response');
            mockApiClient.verify(x => x.sendRequest(It.IsAny()), Times.Once());
            mockApiClient.verify(
                x => x.sendRequest(
                    It.Is<IApiClientRequestOptions>(req =>
                        req.method === 'POST' &&
                        !!req.pathTemplate && req.pathTemplate.includes('v1/workspaces') &&
                        req.body?.displayName === workspaceName &&
                        includeCapacity ? req.body?.capacityId === 'capacity-id' : !req.body?.capacityId &&
                        includeDescription ? req.body?.description === 'Test workspace' : !req.body?.description
                    )
                ),
                Times.Once()
            );
        });
    });

    it('should issue an error if creating a workspace when user is not signed in', async function () {
        // Arrange
        mockAccountProvider.setup(x => x.isSignedIn())
            .returns(Promise.resolve(false));

        // Act & Assert
        await assert.rejects(
            async () => {
                await workspaceManager.createWorkspace('test-workspace');
            },
            (err: Error) => {
                assert.ok(err instanceof FabricError, 'Should throw a FabricError');
                assert.ok(err!.message.includes('Currently not connected to Fabric'), 'Error message should indicate user is not connected to Fabric');
                return true;
            }
        );
    });

    it('should return workspaces alphabetically, prioritizing personal workspace', async function () {
        // Arrange
        const ws1 = { objectId: 'ws-1', displayName: 'Delta', description: '', type: 'Personal', capacityId: 'cap-1' };
        const ws2 = { objectId: 'ws-2', displayName: 'Charlie', description: '', type: 'Workspace', capacityId: 'cap-2' };
        const ws3 = { objectId: 'ws-3', displayName: 'Bravo', description: '', type: 'Personal', capacityId: '' };
        const ws4 = { objectId: 'ws-4', displayName: 'Alpha', description: '', type: 'Workspace', capacityId: undefined };

        const apiResponse = {
            status: 200,
            parsedBody: {
                value: [
                    { id: ws1.objectId, type: ws1.type, displayName: ws1.displayName, description: ws1.description, capacityId: ws1.capacityId },
                    { id: ws2.objectId, type: ws2.type, displayName: ws2.displayName, description: ws2.description, capacityId: ws2.capacityId },
                    { id: ws3.objectId, type: ws3.type, displayName: ws3.displayName, description: ws3.description, capacityId: ws3.capacityId },
                    { id: ws4.objectId, type: ws4.type, displayName: ws4.displayName, description: ws4.description }, // purposefully exclude the capacityId
                ],
            },
        };
        mockAccountProvider.setup(x => x.isSignedIn())
            .returns(Promise.resolve(true));
        mockApiClient
            .setup(x => x.sendRequest(It.IsAny()))
            .returns(Promise.resolve(apiResponse));

        // Act
        const result = await workspaceManager.listWorkspaces();

        // Assert
        const expectedOrder = [ws3, ws1, ws4, ws2];
        assert.deepStrictEqual(result, expectedOrder, 'Workspaces should be sorted alphabetically by type');
    });

    it('getWorkspaceById should return cached workspace without calling API', async function () {
        // Arrange
        const cached = { objectId: 'cached-ws', displayName: 'Cached', description: 'cached', type: 'Personal', capacityId: 'cap-cached' };
        // inject into protected cache via any cast
        (workspaceManager as any)._workspacesCache = [cached];

        // Act
        const result = await workspaceManager.getWorkspaceById('cached-ws');

        // Assert
        assert.deepStrictEqual(result, cached, 'Should return the cached workspace');
        mockApiClient.verify(x => x.sendRequest(It.IsAny()), Times.Never());
    });

    it('getWorkspaceById should fetch from API on cache miss and cache the result', async function () {
        // Arrange
        (workspaceManager as any)._workspacesCache = [];
        const workspaceId = 'ws-from-api';
        const apiResponse: IApiClientResponse = {
            status: 200,
            parsedBody: {
                id: workspaceId,
                type: 'Workspace',
                displayName: 'From API',
                description: 'fetched desc',
                capacityId: 'cap-api',
            },
        } as IApiClientResponse;

        mockApiClient.setup(x => x.sendRequest(It.IsAny())).returns(Promise.resolve(apiResponse));
        mockAccountProvider.setup(x => x.isSignedIn()).returns(Promise.resolve(true));

        // Act
        const result = await workspaceManager.getWorkspaceById(workspaceId);

        // Assert
        const expected = {
            objectId: workspaceId,
            type: 'Workspace',
            displayName: 'From API',
            description: 'fetched desc',
            capacityId: 'cap-api',
        };
        assert.deepStrictEqual(result, expected, 'Should return workspace mapped from API response');
        // cached
        const cached = (workspaceManager as any)._workspacesCache.find((w: any) => w.objectId === workspaceId);
        assert.deepStrictEqual(cached, expected, 'Workspace should have been cached');
        mockApiClient.verify(x => x.sendRequest(It.Is<IApiClientRequestOptions>(req => {
            return req.method === 'GET' && (req.pathTemplate ? req.pathTemplate.includes(workspaceId) : false);
        })), Times.Once());
    });

    it('getWorkspaceById should return undefined and not call API when not connected and not cached', async function () {
        // Arrange
        (workspaceManager as any)._workspacesCache = [];
        mockAccountProvider.setup(x => x.isSignedIn()).returns(Promise.resolve(false));

        // Act
        const result = await workspaceManager.getWorkspaceById('some-id');

        // Assert
        assert.strictEqual(result, undefined, 'Should return undefined when not connected and not cached');
        mockApiClient.verify(x => x.sendRequest(It.IsAny()), Times.Never());
    });

    it('getWorkspaceById should return undefined when API responds with non-200 and should not cache', async function () {
        // Arrange
        (workspaceManager as any)._workspacesCache = [];
        const workspaceId = 'not-found-ws';
        const apiResponse: IApiClientResponse = { status: 404 } as IApiClientResponse;
        mockApiClient.setup(x => x.sendRequest(It.IsAny())).returns(Promise.resolve(apiResponse));
        mockAccountProvider.setup(x => x.isSignedIn()).returns(Promise.resolve(true));

        // Act
        const result = await workspaceManager.getWorkspaceById(workspaceId);

        // Assert
        assert.strictEqual(result, undefined, 'Should return undefined when API returns non-200');
        const cached = (workspaceManager as any)._workspacesCache.find((w: any) => w.objectId === workspaceId);
        assert.strictEqual(cached, undefined, 'Should not cache when API response is non-200');
        mockApiClient.verify(x => x.sendRequest(It.Is<IApiClientRequestOptions>(req => {
            return req.method === 'GET' && (req.pathTemplate ? req.pathTemplate.includes(workspaceId) : false);
        })), Times.Once());
    });
});
