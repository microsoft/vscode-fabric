/* eslint-disable security/detect-object-injection */
import { FabricApiClient, FabricEnvironmentName, FabricEnvironmentProvider, IAccountProvider, IFabricEnvironmentProvider, ILogger, ITokenAcquisitionService, TelemetryService } from '@fabric/vscode-fabric-util';
import { IArtifact, IWorkspace, ArtifactType, RuntimeType, InputType, IFabricApiClient } from '@fabric/vscode-fabric-api';
import { WorkspaceManager, WorkspaceManagerBase } from './WorkspaceManager';
import { LocalFolderManager } from '../LocalFolderManager';
import { IFabricExtensionsSettingStorage } from '../settings/definitions';
import { workspace, Memento } from 'vscode';
import { MockHierarchicalArtifact } from './mockTreeView';
import { IGitOperator } from '../apis/internal/fabricExtensionInternal';

export const mockGuidWorkspaceId: string = 'A1b2C3d4-E5f6-a7B8-9c0D-0e1F2A3b4C5d';
export const mockGuidArtifactId: string =  '4D3c2B1a-6F5e-8b7A-d0C9-D5c4B3a2f1E0';
export const simpleTreeViewBaseArtifactType = 'MockArtifact';
export const unfeaturedTreeViewBaseArtifactType = 'UnfeaturedMockArtifact';

// class MockWorkspaceLocalFolderSettingsStorage extends LocalFolderSettingsStorage {
//     constructor(private _defaultWorkspacesPath?: string) {
//         super();
//     }

//     get defaultWorkspacesPath(): string | undefined {
//         return this._defaultWorkspacesPath;
//     }

//     save(): void {
//     }
// }

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
    ) {
        super(storage, new LocalFolderManager(storage, fabricEnvironmentProvider), account, fabricEnvironmentProvider, apiClient, gitOperator, logger);

        const workspaceIds: string[] = Array.from({length: 4}, (e, i) => `wspaceId${i}`);
        workspaceIds.push(mockGuidWorkspaceId);
        for (let i = 0; i < workspaceIds.length; i++) {
            const workspace: IWorkspace = {
                objectId: workspaceIds[i],
                displayName: 'MockWorkspace' + i,
                description: 'mockdescription' + i,
                type: 'MockType',
                capacityId: '2'
            };
            this.currentWorkspaces.push(workspace);
            this.mapArtifacts.set(workspace.objectId, []);
        }

        const workspacesWithArtifacts: string[] = ['wspaceId3', mockGuidWorkspaceId];
        workspacesWithArtifacts.forEach((workspaceId) => {
            const artifactIds: string[] = Array.from({length: MockWorkspaceManager.numWorkspaceItems - 1}, (e, i) => i + '');
            artifactIds.push(mockGuidArtifactId);
            const arrArtifacts: IArtifact[] = [];
            artifactIds.forEach((artifactId) => {
                const artifact: IArtifact = {
                    id: artifactId,
                    type: `Mock${ArtifactType[1]}`,
                    description: 'description',
                    displayName: `${workspaceId} MockItem${artifactId}`,
                    workspaceId: `wspaceId${artifactId}`,
                    attributes: { runtime: RuntimeType.DotNet },
                    fabricEnvironment: fabricEnvironmentProvider.getCurrent().env
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

    getAllWorkspaces(): Promise<IWorkspace[]> {
        return Promise.resolve(this.currentWorkspaces);
    }
    async openWorkspaceById(id: string): Promise<void> {
        const workspaces = await this.getAllWorkspaces();
        const workspace = workspaces.find((element) => element.objectId === id);
        if (!workspace) {
            const msg = 'Workspace id not found: ' + id;
            throw new Error(msg);
        }
        await this.setCurrentWorkspace(workspace);
    }

    //override
    public async getItemsInWorkspace<T>(): Promise<IArtifact[]> {
        return this.getArtifacts();
    }

    getArtifacts(): IArtifact[] {
        const workspace = this.currentWorkspace;
        if (workspace) {
            const artifacts = this.mapArtifacts.get(workspace.objectId);
            if (artifacts) {
                return artifacts;
            }
            throw new Error(`workspace artifacts not found for '${workspace.displayName}', objectId '${workspace.objectId}'`);
        }
        return [];
    }

    addArtifact(art: IArtifact): void {
        const workspace = this.currentWorkspace;
        if (workspace) {
            const artifacts = this.mapArtifacts.get(workspace.objectId);
            artifacts?.push(art);
            this.mapArtifacts.set(workspace.objectId, artifacts!);
        }
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
            capacityId: '2'
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
                    attributes: { runtime: RuntimeType.DotNet },
                    fabricEnvironment: this.fabricEnvironmentProvider.getCurrent().env
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
            capacityId: '2'
        };

        // Add artifacts to the workspace
        const artifacts: IArtifact[] = [];
        artifacts.push(new MockHierarchicalArtifact('Artifact_4', 'MockHierarchicalItem', 'Artifact (4)', 'description for Artifact (4)', 4, FabricEnvironmentName.MOCK));

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