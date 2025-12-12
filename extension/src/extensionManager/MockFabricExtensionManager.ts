// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as assert from 'assert';
import { FabricExtensionManager } from './FabricExtensionManager';
import { initializeServiceCollection } from '../../test/unit/general/serviceCollection';

export const testApiVersion = '1.6'; // different from apiVersion in api/src/index.ts: run API version validation test

export class MockFabricExtensionManager extends FabricExtensionManager {
    public static create(context: vscode.ExtensionContext, allowedExtensions: string[] = [], available: boolean = true): MockFabricExtensionManager {
        const manager = new MockFabricExtensionManager(context, allowedExtensions, available);
        manager.serviceCollection = initializeServiceCollection(undefined, undefined, undefined, undefined);
        return manager;
    }

    satelliteExtensionIds = [
        'fabric.vscode-fabric-functions',
        'fabric.vscode-testplatform',
    ];

    testExtensionIds = [
        'fabric-test.vscode-fabric-test-extension1',
        'fabric-test.vscode-fabric-test-extension2',
        'fabric-test.vscode-fabric-test-extension3',
    ];

    private constructor(context: vscode.ExtensionContext, allowedExtensions: string[], private available: boolean) {
        super(context, null, null!);
        this.allowedExtensions = this.satelliteExtensionIds.concat(this.testExtensionIds).concat(allowedExtensions);
        this.apiVersion = testApiVersion;
    }

    public get artifactHandlersSize(): number {
        return this.artifactHandlers.size;
    }

    public get treeNodeProvidersSize(): number {
        return this.treeNodeProviders.size;
    }

    public assertNoContributions() {
        assert.strictEqual(this.artifactHandlers.size, 0, 'artifactHandlers should be empty');
        assert.strictEqual(this.treeNodeProviders.size, 0, 'treeNodeProviders should be empty');
    }

    // #region FabricExtensionManager overrides
    isAvailable(extensionId: string): boolean {
        return !!this.available;
    }
    // #endregion
}
