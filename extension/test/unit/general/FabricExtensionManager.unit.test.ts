// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import { IFabricExtension } from '@microsoft/vscode-fabric-api';
import { Mock } from 'moq.ts';
import { initializeServiceCollection } from './serviceCollection';
import { MockFabricExtensionManager, testApiVersion } from '../../../src/extensionManager/MockFabricExtensionManager';
import { satelliteExtensionIds, TestExtension } from '../shared/TestExtension';

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
