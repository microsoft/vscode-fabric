// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import { IFabricExtension } from '@microsoft/vscode-fabric-api';
import { Mock, It } from 'moq.ts';
import { initializeServiceCollection } from './serviceCollection';
import { MockFabricExtensionManager, testApiVersion } from '../../../src/extensionManager/MockFabricExtensionManager';
import { satelliteExtensionIds, TestExtension } from '../shared/TestExtension';
import { ILogger, TelemetryService } from '@microsoft/vscode-fabric-util';

describe('FabricExtensionManager unit tests', () => {
    const mockContext = new Mock<vscode.ExtensionContext>();

    it('Satellite contributions are initially empty', async () => {
        const manager = createFabricExtensionManager();
        manager.assertNoContributions();
    });

    it('addExtension: Service manager is returned', async () => {
        const manager = createFabricExtensionManager();
        const extension: IFabricExtension = TestExtension.create();
        const expectedServiceManager = initializeServiceCollection(undefined, undefined, undefined, undefined);
        manager.serviceCollection = expectedServiceManager;

        // Verify the service manager is returned
        assert.strictEqual(manager.addExtension(extension), expectedServiceManager, 'addExtension should return the service manager');
    });

    it('addExtension: Update event is fired', async () => {
        const manager = createFabricExtensionManager();
        const extension: IFabricExtension = TestExtension.create();

        let updateEventFired = false;
        manager.onExtensionsUpdated(() => updateEventFired = true);
        manager.addExtension(extension);
        assert.equal(updateEventFired, true, 'onExtensionsUpdated should have been fired');
    });

    it('addExtension: Satellite contributions are added', async () => {
        const manager = createFabricExtensionManager();
        const extension1: IFabricExtension = TestExtension.create(satelliteExtensionIds[0], ['artifact-type-1'], true);
        const extension2: IFabricExtension = TestExtension.create(satelliteExtensionIds[1], ['artifact-type-2'], true);
        const extension3: IFabricExtension = TestExtension.create(satelliteExtensionIds[2], ['artifact-type-3'], false);

        manager.addExtension(extension1);
        manager.addExtension(extension2);
        manager.addExtension(extension3);

        // Verify the contributions were added
        assert.strictEqual(manager.treeNodeProvidersSize, 2, 'treeNodeProvidersSize should have 2 items');
        assert.strictEqual(manager.getTreeNodeProvider(extension1.artifactTypes[0]), extension1.treeNodeProviders![0], `getTreeNodeProvider should return the expected provider for ${extension1.artifactTypes[0]}`);
        assert.strictEqual(manager.getTreeNodeProvider(extension2.artifactTypes[0]), extension2.treeNodeProviders![0], `getTreeNodeProvider should return the expected provider for ${extension2.artifactTypes[0]}`);

        assert.strictEqual(manager.artifactHandlersSize, 2, 'artifactHandlersSize should have 2 item');
        assert.strictEqual(manager.getArtifactHandler(extension1.artifactTypes[0]), extension1.artifactHandlers![0], `getArtifactHandler should return the expected handler for ${extension1.artifactTypes[0]}`);
        assert.strictEqual(manager.getArtifactHandler(extension2.artifactTypes[0]), extension2.artifactHandlers![0], `getArtifactHandler should return the expected handler for ${extension2.artifactTypes[0]}`);
    });

    it('Error: extension is not in allowed list', async () => {
        const manager = createFabricExtensionManager();
        const extension: IFabricExtension = TestExtension.create('invalid.identity');

        // Verify there is an error if the extension is not in the allowed list
        assert.throws(() => manager.addExtension(extension), `addExtension should throw because ${extension.identity} is not allowed`);
    });

    it('Error: extension is not installed', async () => {
        const manager = MockFabricExtensionManager.create(mockContext.object(), undefined, false);
        const extension: IFabricExtension = TestExtension.create();

        // Verify there is an error if the extension is not installed
        assert.throws(() => manager.addExtension(extension), `addExtension should throw because ${extension.identity} is not installed`);
    });

    it('Error: extension has already been added', async () => {
        const manager = createFabricExtensionManager();
        const extension: IFabricExtension = TestExtension.create();
        const extension2: IFabricExtension = TestExtension.create(undefined, ['test2']);

        // Verify there is an error when the extension is added a second time
        manager.addExtension(extension);
        assert.throws(() => manager.addExtension(extension2), `addExtension should throw because ${extension.identity} is already registered`);

        // Also verify that the other contributions have been removed
        manager.assertNoContributions();

        // Verify there is an error when the extension is added a third time
        assert.throws(() => manager.addExtension(extension2), `addExtension should throw because ${extension.identity} is already registered`);

        // Also verify that the other contributions have been removed
        manager.assertNoContributions();
    });

    it('API version validation', async () => {
        const manager = createFabricExtensionManager();

        // Error: major version higher
        let extension: IFabricExtension = TestExtension.create(undefined, undefined, undefined, '2.6');
        assert.throws(() => manager.addExtension(extension), `addExtension should throw because ${extension.identity} requires API version ${extension.apiVersion} but the manager is ${testApiVersion}`);

        // Error: major version lower
        extension = TestExtension.create(undefined, undefined, undefined, '0.9');
        assert.throws(() => manager.addExtension(extension), `addExtension should throw because ${extension.identity} requires API version ${extension.apiVersion} but the manager is ${testApiVersion}`);

        // Error: minor version higher
        extension = TestExtension.create(undefined, undefined, undefined, '1.61');
        assert.throws(() => manager.addExtension(extension), `addExtension should throw because ${extension.identity} requires API version ${extension.apiVersion} but the manager is ${testApiVersion}`);

        // Error: minor version lower
        extension = TestExtension.create(undefined, undefined, undefined, '1.4');
        assert.throws(() => manager.addExtension(extension), `addExtension should throw because ${extension.identity} requires API version ${extension.apiVersion} but the manager is ${testApiVersion}`);

        // Error: no minor version specified
        extension = TestExtension.create(undefined, undefined, undefined, '1');
        assert.throws(() => manager.addExtension(extension), `addExtension should throw because ${extension.identity} requires API version ${extension.apiVersion} but the manager is ${testApiVersion}`);

        // Validate: patch version exists
        extension = TestExtension.create(undefined, undefined, undefined, '1.6.1');
        manager.addExtension(extension);
    });

    it('addExtension: Satellite contributions for valid extensions remain', async () => {
        // Create an extension manager with allowed extensions
        const manager = createFabricExtensionManager();
        const originalExtension: IFabricExtension = TestExtension.create();
        const validExtension: IFabricExtension = TestExtension.create(satelliteExtensionIds[1], ['valid'], true);
        const duplicatedExtension: IFabricExtension = TestExtension.create(undefined, ['duplicated']);

        manager.addExtension(originalExtension);
        manager.addExtension(validExtension);
        assert.throws(() => manager.addExtension(duplicatedExtension), `addExtension should throw because ${originalExtension.identity} is already registered`);

        // Verify the contributions were still present
        assert.strictEqual(manager.treeNodeProvidersSize, 1, 'treeNodeProvidersSize should have 1 item');
        assert.strictEqual(manager.getTreeNodeProvider(validExtension.artifactTypes[0]), validExtension.treeNodeProviders![0], 'getTreeNodeProvider should return the expected provider');

        assert.strictEqual(manager.artifactHandlersSize, 1, 'artifactHandlersSize should have 1 item');
        assert.strictEqual(manager.getArtifactHandler(validExtension.artifactTypes[0]), validExtension.artifactHandlers![0], 'getArtifactHandler should return the expected handler');
    });

    function createFabricExtensionManager(): MockFabricExtensionManager {
        return MockFabricExtensionManager.create(mockContext.object());
    }
});

describe('FabricExtensionManager - getLocalProjectTreeNodeProvider tests', () => {
    const mockContext = new Mock<vscode.ExtensionContext>();

    it('getLocalProjectTreeNodeProvider: returns undefined when no provider exists', () => {
        const manager = MockFabricExtensionManager.create(mockContext.object());

        const provider = manager.getLocalProjectTreeNodeProvider('non-existent-type');

        assert.strictEqual(provider, undefined, 'getLocalProjectTreeNodeProvider should return undefined for non-existent type');
    });

    it('getLocalProjectTreeNodeProvider: returns registered provider', () => {
        const manager = MockFabricExtensionManager.create(mockContext.object());
        const extension: IFabricExtension = TestExtension.create(satelliteExtensionIds[0], ['local-project-type'], true);

        manager.addExtension(extension);

        const provider = manager.getLocalProjectTreeNodeProvider('local-project-type');

        assert.strictEqual(provider, extension.localProjectTreeNodeProviders![0], 'getLocalProjectTreeNodeProvider should return the registered provider');
    });

    it('addExtension: local project tree node providers are added', () => {
        const manager = MockFabricExtensionManager.create(mockContext.object());
        const extension1: IFabricExtension = TestExtension.create(satelliteExtensionIds[0], ['artifact-type-1'], true);
        const extension2: IFabricExtension = TestExtension.create(satelliteExtensionIds[1], ['artifact-type-2'], true);

        manager.addExtension(extension1);
        manager.addExtension(extension2);

        assert.strictEqual(manager.localProjectTreeNodeProvidersSize, 2, 'localProjectTreeNodeProvidersSize should have 2 items');
        assert.strictEqual(manager.getLocalProjectTreeNodeProvider('artifact-type-1'), extension1.localProjectTreeNodeProviders![0], 'getLocalProjectTreeNodeProvider should return the expected provider for artifact-type-1');
        assert.strictEqual(manager.getLocalProjectTreeNodeProvider('artifact-type-2'), extension2.localProjectTreeNodeProviders![0], 'getLocalProjectTreeNodeProvider should return the expected provider for artifact-type-2');
    });
});

describe('FabricExtensionManager - getFunctionToFetchCommonTelemetryProperties tests', () => {
    const mockContext = new Mock<vscode.ExtensionContext>();

    it('getFunctionToFetchCommonTelemetryProperties: returns empty object when telemetry service is null', () => {
        const mockLogger = new Mock<ILogger>();
        mockLogger.setup(l => l.log(It.IsAny())).returns();

        const manager = MockFabricExtensionManager.create(mockContext.object(), [], true, null, mockLogger.object());

        const telemetryPropsFunc = manager.getFunctionToFetchCommonTelemetryProperties();
        const props = telemetryPropsFunc();

        assert.deepStrictEqual(props, {}, 'Should return empty object when telemetry service is null');
    });

    it('getFunctionToFetchCommonTelemetryProperties: returns function that retrieves defaultProps', () => {
        const mockTelemetryService = new Mock<TelemetryService>();
        const expectedProps = { sessionId: 'test-session', userId: 'test-user' };
        mockTelemetryService.setup(t => t.defaultProps).returns(expectedProps);

        const manager = MockFabricExtensionManager.create(mockContext.object(), [], true, mockTelemetryService.object(), null);

        const telemetryPropsFunc = manager.getFunctionToFetchCommonTelemetryProperties();
        const props = telemetryPropsFunc();

        assert.deepStrictEqual(props, expectedProps, 'Should return the telemetry service defaultProps');
    });

    it('getFunctionToFetchCommonTelemetryProperties: returned function captures telemetry service state', () => {
        const mockTelemetryService = new Mock<TelemetryService>();
        const initialProps = { version: '1.0' };
        const updatedProps = { version: '2.0', newProp: 'value' };

        let currentProps = initialProps;
        mockTelemetryService.setup(t => t.defaultProps).callback(() => currentProps);

        const manager = MockFabricExtensionManager.create(mockContext.object(), [], true, mockTelemetryService.object(), null);

        const telemetryPropsFunc = manager.getFunctionToFetchCommonTelemetryProperties();

        // First call should return initial props
        assert.deepStrictEqual(telemetryPropsFunc(), initialProps, 'Should return initial props');

        // Update the props
        currentProps = updatedProps;

        // Second call should return updated props (lambda captures telemetry service, not the props)
        assert.deepStrictEqual(telemetryPropsFunc(), updatedProps, 'Should return updated props after service state change');
    });
});

describe('FabricExtensionManager - isAvailable and isActive tests', () => {
    const mockContext = new Mock<vscode.ExtensionContext>();

    it('isAvailable: returns true when extension is available', () => {
        const manager = MockFabricExtensionManager.create(mockContext.object(), [], true);

        assert.strictEqual(manager.isAvailable('any-extension'), true, 'isAvailable should return true when available is set to true');
    });

    it('isAvailable: returns false when extension is not available', () => {
        const manager = MockFabricExtensionManager.create(mockContext.object(), [], false);

        assert.strictEqual(manager.isAvailable('any-extension'), false, 'isAvailable should return false when available is set to false');
    });

    it('isActive: returns false by default', () => {
        const manager = MockFabricExtensionManager.create(mockContext.object());

        assert.strictEqual(manager.isActive('any-extension'), false, 'isActive should return false by default');
    });

    it('isActive: returns true after setting extension as active', () => {
        const manager = MockFabricExtensionManager.create(mockContext.object());
        const extensionId = 'test-extension';

        manager.setActiveExtension(extensionId, true);

        assert.strictEqual(manager.isActive(extensionId), true, 'isActive should return true after setting extension as active');
    });

    it('isActive: returns false after deactivating extension', () => {
        const manager = MockFabricExtensionManager.create(mockContext.object());
        const extensionId = 'test-extension';

        manager.setActiveExtension(extensionId, true);
        manager.setActiveExtension(extensionId, false);

        assert.strictEqual(manager.isActive(extensionId), false, 'isActive should return false after deactivating extension');
    });

    it('isActive: tracks multiple extensions independently', () => {
        const manager = MockFabricExtensionManager.create(mockContext.object());
        const extensionId1 = 'test-extension-1';
        const extensionId2 = 'test-extension-2';

        manager.setActiveExtension(extensionId1, true);

        assert.strictEqual(manager.isActive(extensionId1), true, 'isActive should return true for active extension');
        assert.strictEqual(manager.isActive(extensionId2), false, 'isActive should return false for inactive extension');
    });
});

describe('FabricExtensionManager - activateExtension tests', () => {
    const mockContext = new Mock<vscode.ExtensionContext>();

    it('activateExtension: returns undefined when extension is not registered', async () => {
        const manager = MockFabricExtensionManager.create(mockContext.object());

        const result = await manager.activateExtension('non-existent-extension');

        assert.strictEqual(result, undefined, 'activateExtension should return undefined for non-existent extension');
    });

    it('activateExtension: returns extension when already active', async () => {
        const manager = MockFabricExtensionManager.create(mockContext.object());
        const extensionId = 'test-extension';

        manager.registerMockExtension(extensionId, true); // Already active

        const result = await manager.activateExtension(extensionId);

        assert.ok(result, 'activateExtension should return the extension');
        assert.strictEqual(result!.isActive, true, 'Extension should be active');
        assert.strictEqual(manager.wasActivateCalled(extensionId), false, 'activate should not be called when already active');
    });

    it('activateExtension: activates inactive extension', async () => {
        const manager = MockFabricExtensionManager.create(mockContext.object());
        const extensionId = 'test-extension';

        manager.registerMockExtension(extensionId, false); // Not active

        const result = await manager.activateExtension(extensionId);

        assert.ok(result, 'activateExtension should return the extension');
        assert.strictEqual(result!.isActive, true, 'Extension should be active after activation');
        assert.strictEqual(manager.wasActivateCalled(extensionId), true, 'activate should be called');
        assert.strictEqual(manager.isActive(extensionId), true, 'isActive should return true after activation');
    });

    it('activateExtension: returns undefined when activation fails', async () => {
        const manager = MockFabricExtensionManager.create(mockContext.object());
        const extensionId = 'test-extension';

        manager.registerMockExtension(extensionId, false, true); // Not active, should fail

        const result = await manager.activateExtension(extensionId);

        assert.strictEqual(result, undefined, 'activateExtension should return undefined when activation fails');
        assert.strictEqual(manager.wasActivateCalled(extensionId), true, 'activate should be called even if it fails');
    });

    it('activateExtension: handles multiple extensions independently', async () => {
        const manager = MockFabricExtensionManager.create(mockContext.object());
        const extensionId1 = 'test-extension-1';
        const extensionId2 = 'test-extension-2';

        manager.registerMockExtension(extensionId1, false);
        manager.registerMockExtension(extensionId2, true);

        const result1 = await manager.activateExtension(extensionId1);
        const result2 = await manager.activateExtension(extensionId2);

        assert.ok(result1, 'activateExtension should return extension 1');
        assert.ok(result2, 'activateExtension should return extension 2');
        assert.strictEqual(manager.wasActivateCalled(extensionId1), true, 'activate should be called for extension 1');
        assert.strictEqual(manager.wasActivateCalled(extensionId2), false, 'activate should not be called for already active extension 2');
    });

    it('activateExtension: returns undefined for non-string artifact without extension mapping', async () => {
        const manager = MockFabricExtensionManager.create(mockContext.object());

        // Passing an artifact object - mock returns undefined since it doesn't have artifact-to-extension mapping
        const result = await manager.activateExtension({ type: 'SomeArtifactType' } as any);

        assert.strictEqual(result, undefined, 'activateExtension should return undefined for artifacts without extension mapping');
    });
});
