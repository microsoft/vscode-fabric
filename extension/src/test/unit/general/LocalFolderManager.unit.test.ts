// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Uri } from 'vscode';
import { LocalFolderManager } from '../../../LocalFolderManager';
import { IFabricExtensionSettings, IFabricWorkspaceSettings } from '../../../../src/settings/definitions';
import { IArtifact, IWorkspace } from '@microsoft/vscode-fabric-api';
import * as os from 'os';
import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';

import { FabricEnvironmentName } from '@microsoft/vscode-fabric-util';
import { IFabricExtensionsSettingStorage } from '../../../../src/settings/definitions';
import { MockFabricEnvironmentProvider } from './serviceCollection';
import { Mock, Times } from 'moq.ts';

export const mockGuidWorkspaceId: string = 'A1b2C3d4-E5f6-a7B8-9c0D-0e1F2A3b4C5d';
export const mockGuidArtifactId: string =  '4D3c2B1a-6F5e-8b7A-d0C9-D5c4B3a2f1E0';

const expectedWorkspaceDisplayName = 'MockWorkspaceDisplayName';
const mockWorkspace: IWorkspace = {
    objectId: mockGuidWorkspaceId,
    displayName: expectedWorkspaceDisplayName,
    type: 'MockWorkspaceType',
    description: 'Mock Workspace Description',
};

const expectedArtifactDisplayName = 'MockArtifactDisplayName';
const expectedArtifactType = 'MockArtifactType';
const mockArtifact: IArtifact = {
    id: mockGuidArtifactId,
    displayName: expectedArtifactDisplayName,
    type: expectedArtifactType,
    description: 'Mock Artifact Description',
    workspaceId: mockGuidWorkspaceId,
    attributes: {},
    fabricEnvironment: FabricEnvironmentName.MOCK,
};

function createWorkspaceFolder(workspaceId: string, localFolder?: string, fabricEnvironment?: string): IFabricWorkspaceSettings {
    return {
        workspaceId: workspaceId,
        fabricEnv: fabricEnvironment ?? FabricEnvironmentName.MOCK,
        localFolder: localFolder,
    };
}

async function createLocalFolderManager(storage: IFabricExtensionsSettingStorage, addDefaultLocalFolder: boolean = true): Promise<LocalFolderManager> {
    const localFolderManager = new LocalFolderManager(storage, new MockFabricEnvironmentProvider());
    if (addDefaultLocalFolder && !localFolderManager.getLocalFolderForFabricWorkspace(mockWorkspace)) {
        await localFolderManager.setLocalFolderForFabricWorkspace(mockWorkspace, localFolderManager.defaultLocalFolderForFabricWorkspace(mockWorkspace));
    }
    return localFolderManager;
}

function createExpectedPath(baseFolder: string, folderName: string): vscode.Uri {
    return Uri.joinPath(Uri.file(baseFolder), folderName);
}

describe('LocalFolderManager tests that do not require VSCode', () => {
    let storageMock: Mock<IFabricExtensionsSettingStorage>;

    beforeEach(() => {
        storageMock = new Mock<IFabricExtensionsSettingStorage>();
        let settings: IFabricExtensionSettings = {
            version: 1,
            workspaces: [],
            artifacts: [],
        };
        storageMock.setup(s => s.settings).returns(settings);
        storageMock.setup(s => s.save()).returns(Promise.resolve());
    });

    it('New workspace', async () => {
        storageMock.setup(s => s.defaultWorkspacesPath).returns(undefined);
        const manager = await createLocalFolderManager(storageMock.object());

        const workspacePath = await manager.getLocalFolderForFabricWorkspace(mockWorkspace);
        assert(!!workspacePath, 'Workspace path is undefined');
        const expectedWorkspacePath = path.join(os.homedir(), 'Workspaces', expectedWorkspaceDisplayName);

        // On windows, the drive letter is converted to lowercase during all of the file and join operations.
        // fsPath seems to consistently make that drive letter lowercase, so lets use that
        assert.equal(workspacePath.fsPath, vscode.Uri.file(expectedWorkspacePath).fsPath, 'Workspace path');

        // Validate getWorkspaceIdForLocalFolder
        const workspaceId = manager.getWorkspaceIdForLocalFolder(workspacePath);
        assert.equal(workspaceId, mockGuidWorkspaceId, 'Workspace ID should match for new workspace');

        assert(storageMock.verify(s => s.save(), Times.Exactly(1)), 'Values should be saved to storage');
    });

    it('New workspace; default location mapped in settings', async () => {
        const expectedTempFolder: string = os.tmpdir();
        storageMock.setup(s => s.defaultWorkspacesPath).returns(expectedTempFolder);
        const manager = await createLocalFolderManager(storageMock.object());

        const workspacePath = await manager.getLocalFolderForFabricWorkspace(mockWorkspace);
        assert(!!workspacePath, 'Workspace path is undefined');

        const expectedWorkspacePath = vscode.Uri.file(path.join(expectedTempFolder, expectedWorkspaceDisplayName));
        assert.equal(workspacePath.fsPath, expectedWorkspacePath.fsPath, 'Workspace fsPath');
    });

    it('New workspace; default location mapped in settings is empty string', async () => {
        const defaultWorkspacesPath: string = '';
        storageMock.setup(s => s.defaultWorkspacesPath).returns(defaultWorkspacesPath);

        const storage = storageMock.object();
        const manager = await createLocalFolderManager(storage);

        const workspacePath = await manager.getLocalFolderForFabricWorkspace(mockWorkspace);
        assert(!!workspacePath, 'Workspace path is undefined');

        const expectedWorkspacePath = vscode.Uri.file(path.join(os.homedir(), 'Workspaces', expectedWorkspaceDisplayName));
        assert.equal(workspacePath.fsPath, expectedWorkspacePath.fsPath, 'Workspace path');
    });

    it('Existing workspace', async () => {
        const expectedWorkspaceFolder: string = path.join(os.tmpdir(), 'MyRenamedWorkspace');
        const storage = storageMock.object();

        storage.settings.workspaces.push(createWorkspaceFolder(mockGuidWorkspaceId, expectedWorkspaceFolder));
        const manager = await createLocalFolderManager(storage);

        const workspacePath = await manager.getLocalFolderForFabricWorkspace(mockWorkspace);
        assert(!!workspacePath, 'Workspace path is undefined');
        assert.equal(workspacePath.fsPath, vscode.Uri.file(expectedWorkspaceFolder).fsPath, 'Workspace path');

        // Validate getWorkspaceIdForLocalFolder
        const workspaceId = manager.getWorkspaceIdForLocalFolder(workspacePath);
        assert.equal(workspaceId, mockGuidWorkspaceId, 'Workspace ID should match for existing workspace');
    });

    it('New artifact; workspace created', async () => {
        const manager = await createLocalFolderManager(storageMock.object());
        await manager.getLocalFolderForFabricWorkspace(mockWorkspace);

        const artifactPath = await manager.getLocalFolderForFabricArtifact(mockArtifact);
        assert(!!artifactPath, 'Artifact path is undefined');

        const expectedArtifactPath = createExpectedPath(path.join(os.homedir(), 'Workspaces', mockWorkspace.displayName), `${expectedArtifactDisplayName}.${expectedArtifactType}`);
        assert.equal(artifactPath.fsPath, expectedArtifactPath.fsPath, 'Artifact path');
    });

    it('New artifact; workspace NOT created', async () => {
        const manager = await createLocalFolderManager(storageMock.object(), false);

        const artifactPath = await manager.getLocalFolderForFabricArtifact(mockArtifact);
        assert(!artifactPath, 'Artifact path should be undefined');
    });

    it('Existing artifact', async () => {
        const expectedWorkspaceFolder: string = path.join(os.tmpdir(), 'MyRenamedWorkspace');
        const expectedArtifactFolder: string = 'MyRenamedArtifact';
        const expectedArtifactFolderFullPath = createExpectedPath(expectedWorkspaceFolder, `${expectedArtifactDisplayName}.${expectedArtifactType}`);
        const storage = storageMock.object();

        storage.settings.workspaces.push(createWorkspaceFolder(mockWorkspace.objectId, expectedWorkspaceFolder));
        storage.settings.artifacts.push( { artifactId: mockGuidArtifactId, localFolder: expectedArtifactFolder });
        const manager = await createLocalFolderManager(storage);

        const artifactPath = await manager.getLocalFolderForFabricArtifact(mockArtifact);
        assert(!!artifactPath, 'Artifact path is undefined');
        assert.equal(artifactPath.fsPath, expectedArtifactFolderFullPath.fsPath, 'Artifact path');
    });

    it('Workspace folder undefined', async () => {
        const storage = storageMock.object();
        storage.settings.workspaces.push(createWorkspaceFolder(mockGuidWorkspaceId));
        const manager = await createLocalFolderManager(storage);
        const expectedWorkspacePath = vscode.Uri.file(path.join(os.homedir(), 'Workspaces', expectedWorkspaceDisplayName));

        const workspacePath = await manager.getLocalFolderForFabricWorkspace(mockWorkspace);
        assert.equal(workspacePath?.fsPath, expectedWorkspacePath.fsPath, 'Workspace path');

        // Validate getWorkspaceIdForLocalFolder
        const workspaceId = manager.getWorkspaceIdForLocalFolder(workspacePath!);
        assert.equal(workspaceId, mockGuidWorkspaceId, 'Workspace ID should match for workspace with undefined folder');
    });

    it('Workspace folder empty', async () => {
        const storage = storageMock.object();
        storage.settings.workspaces.push(createWorkspaceFolder(mockGuidWorkspaceId, ''));
        const manager = await createLocalFolderManager(storage);
        const expectedWorkspacePath = vscode.Uri.file(path.join(os.homedir(), 'Workspaces', expectedWorkspaceDisplayName));

        const workspacePath = await manager.getLocalFolderForFabricWorkspace(mockWorkspace);
        assert.equal(workspacePath?.fsPath, expectedWorkspacePath.fsPath, 'Workspace path');
    });

    it('Artifact folder undefined', async () => {
        const expectedWorkspaceFolder: string = path.join(os.tmpdir(), 'MyRenamedWorkspace');
        const expectedArtifactFolderFullPath = createExpectedPath(expectedWorkspaceFolder, `${expectedArtifactDisplayName}.${expectedArtifactType}`);
        const storage = storageMock.object();
        storage.settings.workspaces.push(createWorkspaceFolder(mockGuidWorkspaceId, expectedWorkspaceFolder));
        storage.settings.artifacts.push( { artifactId: mockGuidArtifactId });
        const manager = await createLocalFolderManager(storage);

        const artifactPath = await manager.getLocalFolderForFabricArtifact(mockArtifact);
        assert.equal(artifactPath?.fsPath, expectedArtifactFolderFullPath.fsPath, 'Artifact path');
    });

    it('Artifact folder empty', async () => {
        const expectedWorkspaceFolder: string = path.join(os.tmpdir(), 'MyRenamedWorkspace');
        const expectedArtifactFolderFullPath = createExpectedPath(expectedWorkspaceFolder, `${expectedArtifactDisplayName}.${expectedArtifactType}`);

        const storage = storageMock.object();
        storage.settings.workspaces.push(createWorkspaceFolder(mockGuidWorkspaceId, expectedWorkspaceFolder));
        storage.settings.artifacts.push( { artifactId: mockGuidArtifactId, localFolder: '' });
        const manager = await createLocalFolderManager(storage);

        const artifactPath = await manager.getLocalFolderForFabricArtifact(mockArtifact);
        assert.equal(artifactPath?.fsPath, expectedArtifactFolderFullPath.fsPath, 'Artifact path');
    });

    it('Update workspace folder', async () => {
        const initialWorkspaceFolder: string = path.join(os.tmpdir(), 'MyWorkspace');
        const expectedWorkspaceFolder: string = path.join(os.tmpdir(), 'MyRenamedWorkspace');

        const storage = storageMock.object();
        storage.settings.workspaces.push(createWorkspaceFolder(mockGuidWorkspaceId, initialWorkspaceFolder));
        const manager = await createLocalFolderManager(storage);

        await manager.setLocalFolderForFabricWorkspace(mockWorkspace, vscode.Uri.file(expectedWorkspaceFolder));
        const workspacePath = await manager.getLocalFolderForFabricWorkspace(mockWorkspace);
        assert.equal(workspacePath?.fsPath, vscode.Uri.file(expectedWorkspaceFolder).fsPath, 'Workspace path');
    });

    it('Has workspace', async () => {
        const expectedWorkspaceFolder: string = path.join(os.tmpdir(), 'MyRenamedWorkspace');
        const storage = storageMock.object();
        storage.settings.workspaces.push(createWorkspaceFolder(mockGuidWorkspaceId, expectedWorkspaceFolder));
        const manager = await createLocalFolderManager(storage);

        assert(manager.getLocalFolderForFabricWorkspace(mockWorkspace), 'Expected mock workspace to exist');

        const unmappedWorkspace: IWorkspace = {
            objectId: 'UnmappedWorkspace',
            displayName: 'UnmappedWorkspace',
            type: 'MockWorkspaceType',
            description: 'Mock Workspace Description',
        };
        assert(!manager.getLocalFolderForFabricWorkspace(unmappedWorkspace), 'Expected unmapped workspace to not exist');
    });

    it('getWorkspaceIdForLocalFolder returns undefined for non-existent folder', async () => {
        const storage = storageMock.object();
        const manager = await createLocalFolderManager(storage, false);
        const folderPath = path.join(os.tmpdir(), 'WorkspaceA');
        storage.settings.workspaces.push(createWorkspaceFolder('wsA', folderPath));
        const uri = vscode.Uri.file(path.join(os.tmpdir(), 'WorkspaceB'));
        const result = manager.getWorkspaceIdForLocalFolder(uri);
        assert.equal(result, undefined, 'Should return undefined for non-existent folder');
    });

});
