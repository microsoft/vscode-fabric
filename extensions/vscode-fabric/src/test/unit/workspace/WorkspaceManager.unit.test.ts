import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { WorkspaceManager } from '../../../workspace/WorkspaceManager';
import { IFabricExtensionsSettingStorage } from '../../../settings/definitions';
import { LocalFolderManager } from '../../../LocalFolderManager';
import { IAccountProvider, IFabricEnvironmentProvider, ILogger } from '@fabric/vscode-fabric-util';
import { IFabricApiClient } from '@fabric/vscode-fabric-api';
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
});
