// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { WorkspaceFilterManager, IWorkspaceFilterManager } from '../../../workspace/WorkspaceFilterManager';
import { IWorkspace, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionsSettingStorage } from '../../../settings/definitions';
import { IFabricEnvironmentProvider, TelemetryService, ILogger, FabricError } from '@microsoft/vscode-fabric-util';
import { IAccountProvider } from '../../../authentication/interfaces';
import { WorkspaceManagerBase } from '../../../workspace/WorkspaceManager';

describe('WorkspaceFilterManager', function () {
    let mockSettingsStorage: Mock<IFabricExtensionsSettingStorage>;
    let mockWorkspaceManager: Mock<IWorkspaceManager>;
    let mockEnvironmentProvider: Mock<IFabricEnvironmentProvider>;
    let mockAccountProvider: Mock<IAccountProvider>;
    let mockTelemetryService: Mock<TelemetryService>;
    let mockLogger: Mock<ILogger>;
    let workspaceFilterManager: WorkspaceFilterManager;

    // Mock settings object
    let mockSettings: any;

    // Mock workspaces for testing
    const mockWorkspace1: IWorkspace = {
        objectId: 'workspace-1',
        displayName: 'Test Workspace 1',
        type: 'Personal',
        description: 'First test workspace',
    } as IWorkspace;

    const mockWorkspace2: IWorkspace = {
        objectId: 'workspace-2',
        displayName: 'Test Workspace 2',
        type: 'Shared',
        description: 'Second test workspace',
    } as IWorkspace;

    const mockWorkspaces: IWorkspace[] = [mockWorkspace1, mockWorkspace2];

    before(function () {
        // Setup operations that need to happen once before all tests
    });

    beforeEach(function () {
        // Initialize mocks for each test
        mockSettingsStorage = new Mock<IFabricExtensionsSettingStorage>();
        mockWorkspaceManager = new Mock<IWorkspaceManager>();
        mockEnvironmentProvider = new Mock<IFabricEnvironmentProvider>();
        mockAccountProvider = new Mock<IAccountProvider>();
        mockTelemetryService = new Mock<TelemetryService>();
        mockLogger = new Mock<ILogger>();

        // Initialize mock settings
        mockSettings = {
            currentTenant: { tenantId: 'test-tenant-id' },
            workspaceFilters: {},
        };

        // Setup common mock behaviors
        mockSettingsStorage.setup(instance => instance.settings).returns(mockSettings);
        mockSettingsStorage.setup(instance => instance.save()).returns(Promise.resolve());

        mockEnvironmentProvider.setup(instance => instance.getCurrent()).returns({
            env: 'test-environment',
        } as any);

        mockLogger.setup(instance => instance.log(It.IsAny(), It.IsAny(), It.IsAny())).returns(undefined);
        mockLogger.setup(instance => instance.show()).returns(undefined);
        mockLogger.setup(instance => instance.reportExceptionTelemetryAndLog(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny())).returns(undefined);

        // Initialize class under test with mocks
        workspaceFilterManager = new WorkspaceFilterManager(
            mockSettingsStorage.object(),
            mockWorkspaceManager.object(),
            mockEnvironmentProvider.object(),
            mockAccountProvider.object(),
            mockTelemetryService.object(),
            mockLogger.object()
        );
    });

    afterEach(function () {
        // Clean up after each test
        sinon.restore();
    });

    after(function () {
        // Teardown operations after all tests complete
    });

    describe('getVisibleWorkspaceIds', function () {
        it('should return empty array when no filters are set', function () {
            // Arrange
            mockSettings.workspaceFilters = {};
            
            // Act
            const result = workspaceFilterManager.getVisibleWorkspaceIds();
            
            // Assert
            assert.deepEqual(result, [], 'Should return empty array when no filters exist');
        });

        it('should return workspace IDs for current environment/tenant', function () {
            // Arrange
            const expectedWorkspaceIds = ['workspace-1', 'workspace-2'];
            const environmentKey = 'test-environment:test-tenant-id';
            mockSettings.workspaceFilters = {};
            mockSettings.workspaceFilters[environmentKey] = expectedWorkspaceIds;
            
            // Act
            const result = workspaceFilterManager.getVisibleWorkspaceIds();
            
            // Assert
            assert.deepEqual(result, expectedWorkspaceIds, 'Should return filtered workspace IDs for current environment');
        });

        it('should return empty array when filters exist but not for current environment', function () {
            // Arrange
            const otherEnvironmentKey = 'other-environment:other-tenant';
            mockSettings.workspaceFilters = {};
            mockSettings.workspaceFilters[otherEnvironmentKey] = ['workspace-1'];
            
            // Act
            const result = workspaceFilterManager.getVisibleWorkspaceIds();
            
            // Assert
            assert.deepEqual(result, [], 'Should return empty array when no filters for current environment');
        });

        it('should handle null tenant ID gracefully', function () {
            // Arrange
            mockSettings.currentTenant = null;
            const defaultEnvironmentKey = 'test-environment:default';
            mockSettings.workspaceFilters = {};
            mockSettings.workspaceFilters[defaultEnvironmentKey] = ['workspace-1'];
            
            // Act
            const result = workspaceFilterManager.getVisibleWorkspaceIds();
            
            // Assert
            assert.deepEqual(result, ['workspace-1'], 'Should handle null tenant ID with default');
        });
    });

    describe('setVisibleWorkspaceIds', function () {
        it('should set workspace IDs for current environment/tenant', async function () {
            // Arrange
            const workspaceIds = ['workspace-1', 'workspace-2'];
            mockSettings.workspaceFilters = {};
            
            // Act
            await workspaceFilterManager.setVisibleWorkspaceIds(workspaceIds);
            
            // Assert
            const environmentKey = 'test-environment:test-tenant-id';
            assert.deepEqual(
                mockSettings.workspaceFilters[environmentKey],
                workspaceIds,
                'Should set workspace IDs for current environment'
            );
            mockSettingsStorage.verify(instance => instance.save(), Times.Once());
        });

        it('should initialize workspaceFilters if not present', async function () {
            // Arrange
            mockSettings.workspaceFilters = null;
            const workspaceIds = ['workspace-1'];
            
            // Act
            await workspaceFilterManager.setVisibleWorkspaceIds(workspaceIds);
            
            // Assert
            assert.ok(mockSettings.workspaceFilters, 'Should initialize workspaceFilters object');
            const environmentKey = 'test-environment:test-tenant-id';
            assert.deepEqual(
                mockSettings.workspaceFilters[environmentKey],
                workspaceIds,
                'Should set workspace IDs after initialization'
            );
        });
    });

    describe('isWorkspaceVisible', function () {
        it('should return true when no filters are active', function () {
            // Arrange
            mockSettings.workspaceFilters = {};
            
            // Act
            const result = workspaceFilterManager.isWorkspaceVisible('workspace-1');
            
            // Assert
            assert.equal(result, true, 'Should return true when no filters are active');
        });

        it('should return true when workspace is in filter list', function () {
            // Arrange
            const environmentKey = 'test-environment:test-tenant-id';
            mockSettings.workspaceFilters = {};
            mockSettings.workspaceFilters[environmentKey] = ['workspace-1', 'workspace-2'];
            
            // Act
            const result = workspaceFilterManager.isWorkspaceVisible('workspace-1');
            
            // Assert
            assert.equal(result, true, 'Should return true when workspace is in filter list');
        });

        it('should return false when workspace is not in filter list', function () {
            // Arrange
            const environmentKey = 'test-environment:test-tenant-id';
            mockSettings.workspaceFilters = {};
            mockSettings.workspaceFilters[environmentKey] = ['workspace-1'];
            
            // Act
            const result = workspaceFilterManager.isWorkspaceVisible('workspace-2');
            
            // Assert
            assert.equal(result, false, 'Should return false when workspace is not in filter list');
        });

        it('should return false when hide all marker is present', function () {
            // Arrange
            const environmentKey = 'test-environment:test-tenant-id';
            mockSettings.workspaceFilters = {};
            mockSettings.workspaceFilters[environmentKey] = ['__HIDE_ALL__'];
            
            // Act
            const result = workspaceFilterManager.isWorkspaceVisible('workspace-1');
            
            // Assert
            assert.equal(result, false, 'Should return false when hide all marker is present');
        });
    });

    describe('hasActiveFilters', function () {
        it('should return false when no filters are set', function () {
            // Arrange
            mockSettings.workspaceFilters = {};
            
            // Act
            const result = workspaceFilterManager.hasActiveFilters();
            
            // Assert
            assert.equal(result, false, 'Should return false when no filters are set');
        });

        it('should return true when filters are active', function () {
            // Arrange
            const environmentKey = 'test-environment:test-tenant-id';
            mockSettings.workspaceFilters = {};
            mockSettings.workspaceFilters[environmentKey] = ['workspace-1'];
            
            // Act
            const result = workspaceFilterManager.hasActiveFilters();
            
            // Assert
            assert.equal(result, true, 'Should return true when filters are active');
        });

        it('should return true when hide all marker is present', function () {
            // Arrange
            const environmentKey = 'test-environment:test-tenant-id';
            mockSettings.workspaceFilters = {};
            mockSettings.workspaceFilters[environmentKey] = ['__HIDE_ALL__'];
            
            // Act
            const result = workspaceFilterManager.hasActiveFilters();
            
            // Assert
            assert.equal(result, true, 'Should return true when hide all marker is present');
        });
    });

    describe('clearFilters', function () {
        it('should remove filters for current environment', async function () {
            // Arrange
            const currentEnvKey = 'test-environment:test-tenant-id';
            const otherEnvKey = 'other-environment:other-tenant';
            mockSettings.workspaceFilters = {};
            mockSettings.workspaceFilters[currentEnvKey] = ['workspace-1'];
            mockSettings.workspaceFilters[otherEnvKey] = ['workspace-2'];
            
            // Mock vscode.window.showInformationMessage
            const showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage').resolves();
            
            // Act
            await workspaceFilterManager.clearFilters();
            
            // Assert
            assert.equal(
                mockSettings.workspaceFilters[currentEnvKey],
                undefined,
                'Should remove filters for current environment'
            );
            assert.deepEqual(
                mockSettings.workspaceFilters[otherEnvKey],
                ['workspace-2'],
                'Should preserve filters for other environments'
            );
            mockSettingsStorage.verify(instance => instance.save(), Times.Once());
            assert.ok(showInformationMessageStub.calledOnce, 'Should show information message');
        });

        it('should handle case when workspaceFilters is null', async function () {
            // Arrange
            mockSettings.workspaceFilters = null;
            
            // Mock vscode.window.showInformationMessage
            const showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage').resolves();
            
            // Act
            await workspaceFilterManager.clearFilters();
            
            // Assert
            assert.ok(showInformationMessageStub.calledOnce, 'Should show information message even when filters are null');
        });
    });

    describe('addWorkspaceToFilters', function () {
        it('should add workspace to existing filter list', async function () {
            // Arrange
            const environmentKey = 'test-environment:test-tenant-id';
            mockSettings.workspaceFilters = {};
            mockSettings.workspaceFilters[environmentKey] = ['workspace-1'];
            
            // Act
            await workspaceFilterManager.addWorkspaceToFilters('workspace-2');
            
            // Assert
            assert.deepEqual(
                mockSettings.workspaceFilters[environmentKey],
                ['workspace-1', 'workspace-2'],
                'Should add workspace to existing filter list'
            );
            mockSettingsStorage.verify(instance => instance.save(), Times.Once());
        });

        it('should not add duplicate workspace to filter list', async function () {
            // Arrange
            const environmentKey = 'test-environment:test-tenant-id';
            mockSettings.workspaceFilters = {};
            mockSettings.workspaceFilters[environmentKey] = ['workspace-1', 'workspace-2'];
            
            // Act
            await workspaceFilterManager.addWorkspaceToFilters('workspace-1');
            
            // Assert
            assert.deepEqual(
                mockSettings.workspaceFilters[environmentKey],
                ['workspace-1', 'workspace-2'],
                'Should not add duplicate workspace to filter list'
            );
            mockSettingsStorage.verify(instance => instance.save(), Times.Once());
        });

        it('should remove hide all marker when adding workspace', async function () {
            // Arrange
            const environmentKey = 'test-environment:test-tenant-id';
            mockSettings.workspaceFilters = {};
            mockSettings.workspaceFilters[environmentKey] = ['__HIDE_ALL__'];
            
            // Act
            await workspaceFilterManager.addWorkspaceToFilters('workspace-1');
            
            // Assert
            assert.deepEqual(
                mockSettings.workspaceFilters[environmentKey],
                ['workspace-1'],
                'Should remove hide all marker and add workspace'
            );
            mockSettingsStorage.verify(instance => instance.save(), Times.Once());
        });

        it('should not add workspace to empty filter list', async function () {
            // Arrange
            const environmentKey = 'test-environment:test-tenant-id';
            mockSettings.workspaceFilters = {};
            mockSettings.workspaceFilters[environmentKey] = [];

            // Act
            await workspaceFilterManager.addWorkspaceToFilters('workspace-1');
            
            // Assert
            assert.deepEqual(
                mockSettings.workspaceFilters[environmentKey],
                [],
                'Filter list should remain empty when adding to empty list'
            );
            mockSettingsStorage.verify(instance => instance.save(), Times.Never());
        });

        it('should not add workspace to empty filter list and refresh the tree (no-op)', async function () {
            // Arrange
            const environmentKey = 'test-environment:test-tenant-id';
            mockSettings.workspaceFilters = {};
            mockSettings.workspaceFilters[environmentKey] = [];

            const refreshStub = sinon.stub(workspaceFilterManager as any, 'refreshTreeView');

            // Act
            await workspaceFilterManager.addWorkspaceToFilters('workspace-1');
            
            // Assert
            assert.deepEqual(
                mockSettings.workspaceFilters[environmentKey],
                [],
                'Filter list should remain empty when adding to empty list'
            );
            assert.ok(refreshStub.calledOnce, 'Should refresh tree view when no-op');
            mockSettingsStorage.verify(instance => instance.save(), Times.Never());
        });

        it('should be a no-op when workspaceFilters is null', async function () {
            // Arrange
            mockSettings.workspaceFilters = null;

            // Act
            await workspaceFilterManager.addWorkspaceToFilters('workspace-1');

            // Assert
            assert.equal(mockSettings.workspaceFilters, null, 'workspaceFilters should remain null');
            mockSettingsStorage.verify(instance => instance.save(), Times.Never());
        });

        it('should be a no-op when no filters exist for current environment', async function () {
            // Arrange
            const environmentKey = 'test-environment:test-tenant-id';
            mockSettings.workspaceFilters = {}; // no entry for current environment

            // Act
            await workspaceFilterManager.addWorkspaceToFilters('workspace-1');

            // Assert
            assert.equal(mockSettings.workspaceFilters[environmentKey], undefined, 'Should not create filters for current environment');
            mockSettingsStorage.verify(instance => instance.save(), Times.Never());
        });

        it('should remove hide all marker and preserve other ids when present', async function () {
            // Arrange
            const environmentKey = 'test-environment:test-tenant-id';
            mockSettings.workspaceFilters = {};
            mockSettings.workspaceFilters[environmentKey] = ['__HIDE_ALL__', 'workspace-1'];

            // Act
            await workspaceFilterManager.addWorkspaceToFilters('workspace-2');

            // Assert
            assert.deepEqual(
                mockSettings.workspaceFilters[environmentKey],
                ['workspace-1', 'workspace-2'],
                'Should remove hide all marker and preserve existing ids when adding workspace'
            );
            mockSettingsStorage.verify(instance => instance.save(), Times.Once());
        });
    });

    describe('showWorkspaceFilterDialog', function () {
        it('should complete without throwing when not connected to Fabric', async function () {
            // Arrange
            mockWorkspaceManager.setup(instance => instance.isConnected()).returns(Promise.resolve(false));

            // Act & Assert - should complete without throwing
            await workspaceFilterManager.showWorkspaceFilterDialog();
            
            // Verify that isConnected was called
            mockWorkspaceManager.verify(instance => instance.isConnected(), Times.Once());
        });

        it('should complete without throwing when no workspaces are found', async function () {
            // Arrange
            mockWorkspaceManager.setup(instance => instance.isConnected()).returns(Promise.resolve(true));
            mockWorkspaceManager.setup(instance => instance.listWorkspaces()).returns(Promise.resolve([]));

            // Act & Assert - should complete without throwing
            await workspaceFilterManager.showWorkspaceFilterDialog();
            
            // Verify that methods were called
            mockWorkspaceManager.verify(instance => instance.isConnected(), Times.Once());
            mockWorkspaceManager.verify(instance => instance.listWorkspaces(), Times.Once());
        });

        it('should complete successfully when workspaces are available', async function () {
            // Arrange
            mockWorkspaceManager.setup(instance => instance.isConnected()).returns(Promise.resolve(true));
            mockWorkspaceManager.setup(instance => instance.listWorkspaces()).returns(Promise.resolve(mockWorkspaces));
            
            // Mock the QuickPick behavior by stubbing vscode.window.createQuickPick
            const mockQuickPick = {
                title: '',
                placeholder: '',
                canSelectMany: false,
                ignoreFocusOut: false,
                buttons: [],
                items: [],
                selectedItems: [],
                show: sinon.stub(),
                dispose: sinon.stub(),
                onDidAccept: sinon.stub(),
                onDidHide: sinon.stub(),
                onDidTriggerButton: sinon.stub(),
            };
            
            const createQuickPickStub = sinon.stub(vscode.window, 'createQuickPick').returns(mockQuickPick as any);
            
            // Simulate user cancelling the dialog
            mockQuickPick.onDidHide.callsArg(0);
            
            // Act
            await workspaceFilterManager.showWorkspaceFilterDialog();
            
            // Assert
            assert.ok(createQuickPickStub.calledOnce, 'Should create quick pick dialog');
            assert.ok(mockQuickPick.show.calledOnce, 'Should show quick pick dialog');
            assert.ok(mockQuickPick.dispose.calledOnce, 'Should dispose quick pick dialog');
            mockWorkspaceManager.verify(instance => instance.listWorkspaces(), Times.Once());
        });
    });
});
