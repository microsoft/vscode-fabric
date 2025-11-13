// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable security/detect-object-injection */
import { IFabricEnvironmentProvider, ILogger, IConfigurationProvider, FakeConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { IAccountProvider } from '../authentication/interfaces';
import { IArtifact, IWorkspace, IFabricApiClient } from '@microsoft/vscode-fabric-api';
import { WorkspaceManagerBase } from './WorkspaceManager';
import { LocalFolderManager } from '../LocalFolderManager';
import { IFabricExtensionsSettingStorage } from '../settings/definitions';
import { Memento } from 'vscode';
import { MockHierarchicalArtifact } from './mockTreeView';
import { IGitOperator } from '../apis/internal/fabricExtensionInternal';
import { ILocalFolderService } from '../LocalFolderService';

export const mockGuidWorkspaceId: string = 'A1b2C3d4-E5f6-a7B8-9c0D-0e1F2A3b4C5d';
export const mockGuidArtifactId: string =  '4D3c2B1a-6F5e-8b7A-d0C9-D5c4B3a2f1E0';
export const simpleTreeViewBaseArtifactType = 'MockArtifact';
export const unfeaturedTreeViewBaseArtifactType = 'UnfeaturedMockArtifact';

/**
 * A mock workspace manager that can be used for testing
 */
export class MockWorkspaceManager extends WorkspaceManagerBase {
    public currentWorkspaces: IWorkspace[] = [];
    public mapArtifacts: Map<string, IArtifact[]> = new Map<string, IArtifact[]>(); // workspace id=>Artifacts
    public static numWorkspaceItems: number = 10;

    constructor(storage: IFabricExtensionsSettingStorage,
        account: IAccountProvider,
        fabricEnvironmentProvider: IFabricEnvironmentProvider,
        apiClient: IFabricApiClient,
        gitOperator: IGitOperator,
        logger: ILogger,
        localFolderService: ILocalFolderService,
        configurationProvider: IConfigurationProvider = new FakeConfigurationProvider()
    ) {
        super(storage, new LocalFolderManager(storage, fabricEnvironmentProvider), account, fabricEnvironmentProvider, apiClient, gitOperator, logger, configurationProvider, localFolderService);

        const workspaceIds: string[] = Array.from({ length: 4 }, (e, i) => `wspaceId${i}`);
        workspaceIds.push(mockGuidWorkspaceId);
        for (let i = 0; i < workspaceIds.length; i++) {
            const workspace: IWorkspace = {
                objectId: workspaceIds[i],
                displayName: 'MockWorkspace' + i,
                description: 'mockdescription' + i,
                type: 'MockType',
                capacityId: '2',
            };
            this.currentWorkspaces.push(workspace);
            this.mapArtifacts.set(workspace.objectId, []);
        }

        const workspacesWithArtifacts: string[] = ['wspaceId3', mockGuidWorkspaceId];
        workspacesWithArtifacts.forEach((workspaceId) => {
            const artifactIds: string[] = Array.from({ length: MockWorkspaceManager.numWorkspaceItems - 1 }, (e, i) => i + '');
            artifactIds.push(mockGuidArtifactId);
            const arrArtifacts: IArtifact[] = [];
            artifactIds.forEach((artifactId) => {
                const artifact: IArtifact = {
                    id: artifactId,
                    type: 'MockArtifactType',
                    description: 'description',
                    displayName: `${workspaceId} MockItem${artifactId}`,
                    workspaceId: `wspaceId${artifactId}`,
                    fabricEnvironment: fabricEnvironmentProvider.getCurrent().env,
                };
                arrArtifacts.push(artifact);
            });
            this.mapArtifacts.set(workspaceId, arrArtifacts.slice());
        });

        this.addSimpleTreeViewWorkspace();
        this.addUnfeaturedTreeViewWorkspace();
        this.addHierarchicalTreeViewWorkspace();
    }

    updateFabricExtensionSettings(): void {
    }

    listWorkspaces(): Promise<IWorkspace[]> {
        // Populate the workspace cache like the real WorkspaceManager does
        this._workspacesCache = [...this.currentWorkspaces];
        return Promise.resolve(this.currentWorkspaces);
    }

    //override
    public async getItemsInWorkspace<T>(workspaceId: string): Promise<IArtifact[]> {
        return this.getArtifacts(workspaceId);
    }

    getArtifacts(workspaceId?: string): IArtifact[] {
        const workspaceObjectId = workspaceId;
        if (workspaceObjectId) {
            const artifacts = this.mapArtifacts.get(workspaceObjectId);
            if (artifacts) {
                return artifacts;
            }
            throw new Error(`workspace artifacts not found for workspaceId '${workspaceObjectId}'`);
        }
        return [];
    }

    async addArtifact(art: IArtifact): Promise<void> {
        if (!this.mapArtifacts.has(art.workspaceId)) {
            this.mapArtifacts.set(art.workspaceId, []);
        }

        const artifacts = this.mapArtifacts.get(art.workspaceId)!;
        artifacts.push(art);
    }

    logToOutPutChannel(message: string): void {
        console.log(message);
    }

    private addSimpleTreeViewWorkspace(): void {
        this.addBasicTreeViewWorkspace('SimpleTreeView', simpleTreeViewBaseArtifactType);
    }

    private addUnfeaturedTreeViewWorkspace(): void {
        this.addBasicTreeViewWorkspace('UnfeaturedTreeView', unfeaturedTreeViewBaseArtifactType);
    }

    private addBasicTreeViewWorkspace(workspaceName: string, baseArtifactType: string): void {
        // Create the workspace
        const workspace: IWorkspace = {
            objectId: workspaceName,
            displayName: workspaceName,
            description: workspaceName + 'description',
            type: 'MockType',
            capacityId: '2',
        };

        // Add artifacts to the workspace
        const artifacts: IArtifact[] = [];
        for (let i = 1; i <= 3; i++) {
            const artifactType = `${baseArtifactType}${i}`;
            for (let j = 4 - i; j > 0; j--) {
                const artifact: IArtifact = {
                    id: `${i}_${j}`,
                    type: `${artifactType}`,
                    description: `description for ${artifactType} ${j}`,
                    displayName: `${workspaceName} ${artifactType} ${j}`,
                    workspaceId: `wspaceId${i}`,
                    fabricEnvironment: this.fabricEnvironmentProvider.getCurrent().env,
                };
                artifacts.push(artifact);
            }
        }

        // Make sure member variables have the items
        this.currentWorkspaces.push(workspace);
        this.mapArtifacts.set(workspaceName, artifacts.slice());
    }

    private addHierarchicalTreeViewWorkspace(): void {
        const workspaceName = 'HierarchicalTreeView';

        // Create the workspace
        const workspace: IWorkspace = {
            objectId: workspaceName,
            displayName: workspaceName,
            description: `${workspaceName} description`,
            type: 'MockType',
            capacityId: '2',
        };

        // Add artifacts to the workspace
        const artifacts: IArtifact[] = [];
        artifacts.push(new MockHierarchicalArtifact('Artifact_4', 'MockHierarchicalItem', 'Artifact (4)', 'description for Artifact (4)', 4, 'MOCK'));

        // Make sure member variables have the items
        this.currentWorkspaces.push(workspace);
        this.mapArtifacts.set(workspaceName, artifacts.slice());
    }
}

export class MockMemento implements Memento {
    private data: Map<string, any> = new Map();

    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string, defaultValue?: T): T {
        let value = this.data.get(key);
        if (typeof value === 'undefined') {
            value = defaultValue;
        }
        return value;
    }

    update(key: string, value: any): Thenable<void> {
        this.data.set(key, value);
        return Promise.resolve();
    }

    keys(): readonly string[] {
        return Array.from(this.data.keys());
    }

    setKeysForSync(keys: readonly string[]): void {
        // do nothing
    }
}
