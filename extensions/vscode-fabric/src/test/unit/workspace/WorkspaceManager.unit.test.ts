import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { WorkspaceManager } from '../../../workspace/WorkspaceManager';
import { IFabricExtensionsSettingStorage } from '../../../settings/definitions';
import { LocalFolderManager } from '../../../LocalFolderManager';
import { IAccountProvider, IFabricEnvironmentProvider, ILogger, FabricError } from '@fabric/vscode-fabric-util';
import { IApiClientResponse, IApiClientRequestOptions, IFabricApiClient } from '@fabric/vscode-fabric-api';
import { IGitOperator } from '../../../apis/internal/fabricExtensionInternal';

describe('WorkspaceManager', function() {
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
    
    before(function() {
        // Setup operations that need to happen once before all tests
    });
    
    beforeEach(function() {
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
    
    afterEach(function() {
        // Clean up after each test
        onSignInChangedEmitter.dispose();
        onTenantChangedEmitter.dispose();
        onDidEnvironmentChangeEmitter.dispose();
        sinon.restore();
    });
    
    after(function() {
        // Teardown operations after all tests complete
    });
    
    it('should listen to onTenantChanged event and call refreshConnectionToFabric', async function() {
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
    
    it('should listen to onSignInChanged event and call refreshConnectionToFabric', async function() {
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
    
    it('should register event listeners during construction', function() {
        // Arrange & Act - this happens during beforeEach when creating workspaceManager
        
        // Assert
        // Verify that the event listeners were registered by checking the mock setup calls
        mockAccountProvider.verify(instance => instance.onSignInChanged, Times.Once());
        mockAccountProvider.verify(instance => instance.onTenantChanged, Times.Once());
        mockFabricEnvironmentProvider.verify(instance => instance.onDidEnvironmentChange, Times.Once());
    });
    
    it('should handle multiple tenant changed events correctly', async function() {
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
        { includeCapacity: false, includeDescription: false, status: 400 }
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
                    description: includeDescription ? 'Test workspace' : undefined
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
});
