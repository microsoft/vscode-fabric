// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import {
    FabricTreeNode,
    IApiClientResponse,
    IArtifact,
    IArtifactManager,
    IFabricExtensionServiceCollection,
    IOpenArtifactOptions,
    IWorkspace,
    IWorkspaceManager,
    IWorkspaceFolder,
    IFabricApiClient,
} from '@microsoft/vscode-fabric-api';
import { ArtifactManager } from '../../../src/artifactManager/ArtifactManager';
import { FabricExtensionServiceCollection } from '../../../src/FabricExtensionServiceCollection';
import { FabricEnvironmentSettings, IFabricEnvironmentProvider, ILogger, LogImportance } from '@microsoft/vscode-fabric-util';
import { Mock } from 'moq.ts';

// #region stub IFabricServiceCollection implementations
export class MockArtifactManagerStub extends ArtifactManager {
    getArtifactData(artifact: IArtifact): Promise<IApiClientResponse> {
        throw new Error('Method not implemented.');
    }
    retrieveArtifacts(): Promise<IArtifact[]> {
        throw new Error('Method not implemented.');
    }
    createArtifact(artifact: IArtifact): Promise<IApiClientResponse> {
        throw new Error('Method not implemented.');
    }
    getArtifact(artifact: IArtifact): Promise<IApiClientResponse> {
        throw new Error('Method not implemented.');
    }
    selectArtifact(artifact: IArtifact): Promise<IApiClientResponse> {
        throw new Error('Method not implemented.');
    }
    updateArtifact(artifact: IArtifact, body: Map<string, string>): Promise<IApiClientResponse> {
        throw new Error('Method not implemented.');
    }
    deleteArtifact(artifact: IArtifact): Promise<IApiClientResponse> {
        throw new Error('Method not implemented.');
    }
    openArtifact(artifact: IArtifact, openOptions?: IOpenArtifactOptions | undefined): Promise<void> {
        throw new Error('Method not implemented.');
    }
}

export class MockFabricEnvironmentProvider implements IFabricEnvironmentProvider {
    getCurrent(): FabricEnvironmentSettings {
        return {
            env: 'MOCK',
            clientId: '00000000-0000-0000-0000-000000000000',
            scopes: [],
            sharedUri: '',
            portalUri: '',
        };
    }
    switchToEnvironment(environmentName: string): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    private readonly onDidEnvironmentChangeEmitter = new vscode.EventEmitter<void>();
    readonly onDidEnvironmentChange = this.onDidEnvironmentChangeEmitter.event;
}

export class MockLoggerStub implements ILogger {
    trace(message: string, show?: boolean): void {
        throw new Error('Method not implemented.');
    }
    debug(message: string, show?: boolean): void {
        throw new Error('Method not implemented.');
    }
    info(message: string, show?: boolean): void {
        throw new Error('Method not implemented.');
    }
    warn(message: string, show?: boolean): void {
        throw new Error('Method not implemented.');
    }
    error(message: string, show?: boolean): void {
        throw new Error('Method not implemented.');
    }
    show(): void {
        throw new Error('Method not implemented.');
    }
    /** @deprecated */
    log(message: string, importance?: LogImportance, show?: boolean): void {
        throw new Error('Method not implemented.');
    }
    /** @deprecated */
    reportExceptionTelemetryAndLog(methodName: string, eventName: string, exception: unknown, telemetryService: any | null, properties?: { [key: string]: string; } | undefined): void {
        throw new Error('Method not implemented.');
    }
}

// #endregion

export function initializeServiceCollection(
    artifactManager: IArtifactManager | undefined,
    workspaceManager: IWorkspaceManager | undefined,
    logger: ILogger | undefined,
    apiClient: IFabricApiClient | undefined
): IFabricExtensionServiceCollection {
    if (!artifactManager) {
        artifactManager = new MockArtifactManagerStub(null!, null!, null!, new MockFabricEnvironmentProvider(), null!, null!, null!, null!);
    }
    if (!workspaceManager) {
        workspaceManager = new Mock<IWorkspaceManager>().object();
    }
    if (!logger) {
        logger = new MockLoggerStub();
    }
    if (!apiClient) {
        apiClient = new Mock<IFabricApiClient>().object();
    }

    const serviceCollection = new FabricExtensionServiceCollection(artifactManager, workspaceManager!, apiClient);
    return serviceCollection;
}
