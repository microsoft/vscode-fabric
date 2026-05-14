// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as assert from 'assert';
import { FabricExtensionManager } from './FabricExtensionManager';
import { initializeServiceCollection } from '../../test/unit/general/serviceCollection';
import { ILogger, TelemetryService } from '@microsoft/vscode-fabric-util';

export const testApiVersion = '1.6'; // different from apiVersion in api/src/index.ts: run API version validation test

export class MockFabricExtensionManager extends FabricExtensionManager {
    public static create(
        context: vscode.ExtensionContext,
        allowedExtensions: string[] = [],
        available: boolean = true,
        telemetryService: TelemetryService | null = null,
        logger: ILogger | null = null
    ): MockFabricExtensionManager {
        const manager = new MockFabricExtensionManager(context, allowedExtensions, available, telemetryService, logger);
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

    private activeExtensions: Set<string> = new Set();
    private mockExtensionRegistry: Map<string, { isActive: boolean; activateCalled: boolean; shouldFailActivation: boolean }> = new Map();

    private constructor(
        context: vscode.ExtensionContext,
        allowedExtensions: string[],
        private available: boolean,
        telemetryService: TelemetryService | null,
        logger: ILogger | null
    ) {
        super(context, telemetryService, logger ?? null!);
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
        return this.available;
    }

    isActive(extensionId: string): boolean {
        return this.activeExtensions.has(extensionId);
    }

    setActiveExtension(extensionId: string, active: boolean): void {
        if (active) {
            this.activeExtensions.add(extensionId);
        }
        else {
            this.activeExtensions.delete(extensionId);
        }
    }

    public get localProjectTreeNodeProvidersSize(): number {
        return this.localProjectTreeNodeProviders.size;
    }

    /**
     * Register a mock extension for testing activateExtension
     * @param extensionId The extension ID to register
     * @param isActive Whether the extension is already active
     * @param shouldFailActivation Whether activation should fail
     */
    public registerMockExtension(extensionId: string, isActive: boolean = false, shouldFailActivation: boolean = false): void {
        this.mockExtensionRegistry.set(extensionId, { isActive, activateCalled: false, shouldFailActivation });
        if (isActive) {
            this.activeExtensions.add(extensionId);
        }
    }

    /**
     * Check if activate was called for a mock extension
     */
    public wasActivateCalled(extensionId: string): boolean {
        return this.mockExtensionRegistry.get(extensionId)?.activateCalled ?? false;
    }

    public async activateExtension(extensionIdOrArtifact: string | { type: string }): Promise<vscode.Extension<any> | undefined> {
        let extensionId: string | undefined;

        if (typeof extensionIdOrArtifact !== 'string') {
            // For testing, we use a simple mapping - in real code this uses getArtifactExtensionId
            return undefined;
        }
        else {
            extensionId = extensionIdOrArtifact;
        }

        if (!extensionId) {
            return undefined;
        }

        const mockExtension = this.mockExtensionRegistry.get(extensionId);
        if (!mockExtension) {
            // Extension not registered (simulates extension not installed)
            return undefined;
        }

        // If already active, return immediately
        if (mockExtension.isActive) {
            return { isActive: true } as unknown as vscode.Extension<any>;
        }

        // Mark that activate was called
        mockExtension.activateCalled = true;

        // Simulate activation failure if configured
        if (mockExtension.shouldFailActivation) {
            return undefined;
        }

        // Activate the extension
        mockExtension.isActive = true;
        this.activeExtensions.add(extensionId);

        return { isActive: true } as unknown as vscode.Extension<any>;
    }
    // #endregion
}
