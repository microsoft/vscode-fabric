// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { Uri } from 'vscode';
import {
    FabricTreeNode,
    IApiClientResponse,
    IArtifact,
    IArtifactManager,
    IFabricExtensionServiceCollection,
    ILocalFileSystem,
    IOpenArtifactOptions,
    IWorkspace,
    IWorkspaceManager,
    IFabricApiClient,
} from '@microsoft/vscode-fabric-api';
import { IFabricExtensionManagerInternal } from '../../../apis/internal/fabricExtensionInternal';
import { ArtifactManager } from '../../../artifactManager/ArtifactManager';
import { FabricExtensionServiceCollection } from '../../../FabricExtensionServiceCollection';
import { ObservableMap } from '../../../collections/ObservableMap';
import { ObservableSet } from '../../../collections/ObservableSet';
import { FabricEnvironmentName, getFabricEnvironment, FabricEnvironmentSettings, IFabricEnvironmentProvider, ILogger, LogImportance } from '@microsoft/vscode-fabric-util';
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

class MockWorkspaceManagerStub implements IWorkspaceManager {
    createWorkspace(workspaceName: string, options?: { capacityId?: string; description?: string; }): Promise<IApiClientResponse> {
        throw new Error('Method not implemented.');
    }
    listWorkspaces(): Promise<IWorkspace[]> {
        throw new Error('Method not implemented.');
    }
    retrieveArtifacts(): Promise<IArtifact[]> {
        throw new Error('Method not implemented.');
    }
    clearPriorStateIfAny(): void {
        throw new Error('Method not implemented.');
    }
    getWorkspaceById(workspaceId: string): Promise<IWorkspace | undefined> {
        throw new Error('Method not implemented.');
    }
    get fabricSharedUri(): string {
        throw new Error('Method not implemented.');
    }
    getLocalFolderForCurrentFabricWorkspace(options?: { createIfNotExists?: boolean | undefined; } | undefined): Promise<vscode.Uri | undefined> {
        throw new Error('Method not implemented.');
    }
    getLocalFolderForFabricWorkspace(workspace: IWorkspace, options?: { createIfNotExists?: boolean | undefined; } | undefined): Promise<vscode.Uri | undefined> {
        throw new Error('Method not implemented.');
    }
    getLocalFolderForArtifact(artifact: IArtifact, options?: { createIfNotExists?: boolean | undefined; } | undefined): Promise<vscode.Uri | undefined> {
        throw new Error('Method not implemented.');
    }

    get onDidChangePropertyValue(): vscode.Event<string> {
        throw new Error('Method not implemented.');
    }
    getItemsInWorkspace(workspaceId: string): Promise<IArtifact[]> {
        throw new Error('Method not implemented.');
    }
    isProcessingAutoLogin: boolean = false;
    fabricWorkspaceContext: string = 'fabricWorkspaceContext';
    isConnected(): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    hasWorkspaces(): boolean {
        throw new Error('Method not implemented.');
    }
    treeView: vscode.TreeView<FabricTreeNode> | undefined = undefined;
}

export class MockFabricEnvironmentProvider implements IFabricEnvironmentProvider {
    getCurrent(): FabricEnvironmentSettings {
        return getFabricEnvironment(FabricEnvironmentName.MOCK);
    }
    private readonly onDidEnvironmentChangeEmitter = new vscode.EventEmitter<void>();
    readonly onDidEnvironmentChange = this.onDidEnvironmentChangeEmitter.event;
}

class MockFileSystemStub implements ILocalFileSystem {
    createUri(filePath: string): Uri {
        throw new Error('Method not implemented.');
    }
    writeFile(uri: Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
        throw new Error('Method not implemented.');
    }
}

export class MockLoggerStub implements ILogger {
    log(message: string, importance?: LogImportance | undefined, show?: boolean | undefined): void {
        throw new Error('Method not implemented.');
    }
    show(): void {
        throw new Error('Method not implemented.');
    }
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
        workspaceManager = new MockWorkspaceManagerStub();
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
