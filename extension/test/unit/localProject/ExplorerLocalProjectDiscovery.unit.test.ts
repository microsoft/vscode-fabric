// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import { Uri } from 'vscode';
import { IWorkspaceFolderProvider } from '../../../src/localProject/definitions';
import { ExplorerLocalProjectDiscovery } from '../../../src/localProject/ExplorerLocalProjectDiscovery';
import { IObservableArray } from '../../../src/collections/definitions';
import { ObservableSet } from '../../../src/collections/ObservableSet';
import { ObservableArrayEventValidator } from './ObservableSet.unit.test';

class MockWorkspaceFolderProvider implements IWorkspaceFolderProvider {
    public workspaceFolders: IObservableArray<Uri>;

    constructor(workspaceFolders: Uri[] = []) {
        this.workspaceFolders = new ObservableSet<Uri>(workspaceFolders);
    }
}

describe('ExplorerLocalProjectDiscovery unit tests', () => {
    it('Empty when no workspaces found', async () => {
        const folders: Uri[] = [];
        const discovery = await ExplorerLocalProjectDiscovery.create(new MockWorkspaceFolderProvider(folders));
        assert.equal(discovery.projects.length, 0, 'Expected empty array');
    });

    it('Finds top-level folder', async () => {
        const folders: Uri[] = [
            Uri.file('/user/me/workspaces/Type2Item.type2'),
        ];
        const discovery = await ExplorerLocalProjectDiscovery.create(new MockWorkspaceFolderProvider(folders));
        assert.equal(discovery.projects.items.length, 1, 'Discovered projects');
        assert.equal(discovery.projects.items[0].path, folders[0], 'Path');
        assert.equal(discovery.projects.items[0].artifactType, 'type2', 'Artifact type');
    });

    it('Ignores top-level with incorrect naming', async () => {
        const folders: Uri[] = [
            Uri.file('/user/me/workspaces/Type2Item'),
        ];
        const discovery = await ExplorerLocalProjectDiscovery.create(new MockWorkspaceFolderProvider(folders));
        assert.equal(discovery.projects.items.length, 0, 'Expected empty array');
    });

    it('Events: basic adds and deletes', async () => {
        const initialFolder = Uri.file('/user/me/workspaces/Type2Item.type2');
        const folderProvider = new MockWorkspaceFolderProvider([initialFolder]);
        const discovery = await ExplorerLocalProjectDiscovery.create(folderProvider);

        const events = new ObservableArrayEventValidator(discovery.projects);
        const folderToAdd = Uri.file('/user/me/workspaces/Type3Item.type3');

        folderProvider.workspaceFolders.add(folderToAdd);
        // Wait for the async onItemAdded handler to finish
        await new Promise(resolve => setTimeout(resolve, 10));

        folderProvider.workspaceFolders.remove(initialFolder);
        // Wait for the async onItemRemoved handler if needed (not currently async in code, but added for symmetry)
        await new Promise(resolve => setTimeout(resolve, 10));

        assert.equal(discovery.projects.items.length, 1, 'Discovered projects');
        assert.equal(discovery.projects.items[0].path, folderToAdd, 'Path');
        assert.equal(discovery.projects.items[0].artifactType, 'type3', 'Artifact type');

        // Note: there are actually 2 adds throughout the test, but because the event listener was only hooked up after the initial add, it only sees one
        events.assertEventCounts(1, 1, 0);
    });

    it('Events: mis-matches', async () => {
        const initialFolder = Uri.file('/user/me/workspaces/Type2Item.type2');
        const folderProvider = new MockWorkspaceFolderProvider([initialFolder]);
        const discovery = await ExplorerLocalProjectDiscovery.create(folderProvider);

        const events = new ObservableArrayEventValidator(discovery.projects);
        folderProvider.workspaceFolders.remove(Uri.file('/user/me/workspaces/Type2Item.type4'));
        assert.equal(discovery.projects.items.length, 1, 'Discovered projects - Type mismatch');
        folderProvider.workspaceFolders.remove(Uri.file('/user/me/workspaces/Type4Item.type2'));
        assert.equal(discovery.projects.items.length, 1, 'Discovered projects - Name mismatch');
        folderProvider.workspaceFolders.remove(Uri.file('/user/me/workspaces/Type2Item.type2'.toLowerCase()));
        assert.equal(discovery.projects.items.length, 1, 'Discovered projects - Case mismatch');

        events.assertEventCounts(0, 0, 0);
    });

    it('Finds nested projects when WorkspaceFolderProvider discovers child folders', async () => {
        // Simulates WorkspaceFolderProvider discovering folders at various depths
        // Root workspace: /user/me/workspaces
        // WorkspaceFolderProvider would discover:
        //   - /user/me/workspaces (root)
        //   - /user/me/workspaces/TopLevel.type1 (child)
        //   - /user/me/workspaces/subfolder (child)
        //   - /user/me/workspaces/subfolder/ChildLevel.type2 (grandchild - requires recursive discovery)
        //   - /user/me/workspaces/another (child)
        //   - /user/me/workspaces/another/deep (grandchild - requires recursive discovery)
        //   - /user/me/workspaces/another/deep/DeepProject.type3 (great-grandchild - requires recursive discovery)
        const folders: Uri[] = [
            Uri.file('/user/me/workspaces'),
            Uri.file('/user/me/workspaces/TopLevel.type1'),
            Uri.file('/user/me/workspaces/subfolder'),
            Uri.file('/user/me/workspaces/subfolder/ChildLevel.type2'),
            Uri.file('/user/me/workspaces/another'),
            Uri.file('/user/me/workspaces/another/deep'),
            Uri.file('/user/me/workspaces/another/deep/DeepProject.type3'),
        ];
        const discovery = await ExplorerLocalProjectDiscovery.create(new MockWorkspaceFolderProvider(folders));
        
        // Should discover only the valid project folders (those with .typeX extensions)
        assert.equal(discovery.projects.items.length, 3, 'Discovered all nested projects');
        
        const types = discovery.projects.items.map(p => p.artifactType).sort();
        assert.deepStrictEqual(types, ['type1', 'type2', 'type3'], 'All artifact types found');
    });

    it('Ignores non-project folders in nested hierarchy', async () => {
        // WorkspaceFolderProvider discovers all folders, but only some are valid projects
        // Root workspace: /user/me/workspaces
        const folders: Uri[] = [
            Uri.file('/user/me/workspaces'),
            Uri.file('/user/me/workspaces/TopLevel.type1'),
            Uri.file('/user/me/workspaces/notaproject'),
            Uri.file('/user/me/workspaces/subfolder'),
            Uri.file('/user/me/workspaces/subfolder/ChildLevel.type2'),
            Uri.file('/user/me/workspaces/subfolder/alsoinvalid'),
            Uri.file('/user/me/workspaces/subfolder/nested'),
            Uri.file('/user/me/workspaces/subfolder/nested/stillnotvalid'),
        ];
        const discovery = await ExplorerLocalProjectDiscovery.create(new MockWorkspaceFolderProvider(folders));
        
        // Should only discover folders with valid naming pattern (Name.type)
        assert.equal(discovery.projects.items.length, 2, 'Only valid projects discovered');
        
        const types = discovery.projects.items.map(p => p.artifactType).sort();
        assert.deepStrictEqual(types, ['type1', 'type2'], 'Only valid artifact types found');
    });

    it('Events: nested folder addition and removal', async () => {
        // Start with workspace root and some discovered folders
        const initialFolders = [
            Uri.file('/user/me/workspaces'),
            Uri.file('/user/me/workspaces/Project1.type1'),
            Uri.file('/user/me/workspaces/subfolder'),
            Uri.file('/user/me/workspaces/subfolder/Project2.type2'),
        ];
        const folderProvider = new MockWorkspaceFolderProvider(initialFolders);
        const discovery = await ExplorerLocalProjectDiscovery.create(folderProvider);

        const events = new ObservableArrayEventValidator(discovery.projects);
        
        // Simulate WorkspaceFolderProvider discovering a new nested folder
        const nestedFolder = Uri.file('/user/me/workspaces/subfolder/nested/Project3.type3');
        folderProvider.workspaceFolders.add(nestedFolder);
        await new Promise(resolve => setTimeout(resolve, 10));

        assert.equal(discovery.projects.items.length, 3, 'Nested project added');
        
        // Remove a nested project folder
        folderProvider.workspaceFolders.remove(initialFolders[3]); // Project2.type2
        await new Promise(resolve => setTimeout(resolve, 10));

        assert.equal(discovery.projects.items.length, 2, 'Nested project removed');
        
        events.assertEventCounts(1, 1, 0);
    });

    it('Events: handles deeply nested paths correctly', async () => {
        // Start with just the workspace root
        const workspaceRoot = Uri.file('/user/me/workspaces');
        const folderProvider = new MockWorkspaceFolderProvider([workspaceRoot]);
        const discovery = await ExplorerLocalProjectDiscovery.create(folderProvider);

        const events = new ObservableArrayEventValidator(discovery.projects);
        
        // Simulate WorkspaceFolderProvider discovering folders at various depths
        const level1Project = Uri.file('/user/me/workspaces/Level1.type1');
        const level1Folder = Uri.file('/user/me/workspaces/level1');
        const level2Project = Uri.file('/user/me/workspaces/level1/Level2.type2');
        const level2Folder = Uri.file('/user/me/workspaces/level1/level2');
        const level3Project = Uri.file('/user/me/workspaces/level1/level2/Level3.type3');
        const level3Folder = Uri.file('/user/me/workspaces/level1/level2/level3');
        const level4Project = Uri.file('/user/me/workspaces/level1/level2/level3/Level4.type4');

        // Add folders as they would be discovered (including intermediate non-project folders)
        folderProvider.workspaceFolders.add(level1Project);
        folderProvider.workspaceFolders.add(level1Folder);
        folderProvider.workspaceFolders.add(level2Project);
        folderProvider.workspaceFolders.add(level2Folder);
        folderProvider.workspaceFolders.add(level3Project);
        folderProvider.workspaceFolders.add(level3Folder);
        folderProvider.workspaceFolders.add(level4Project);
        
        await new Promise(resolve => setTimeout(resolve, 20));

        // Should only discover the 4 valid projects, not the intermediate folders
        assert.equal(discovery.projects.items.length, 4, 'All nested projects discovered');
        
        // Verify paths are correct
        const paths = discovery.projects.items.map(p => p.path.path).sort();
        assert.ok(paths.includes(level1Project.path), 'Level 1 project included');
        assert.ok(paths.includes(level2Project.path), 'Level 2 project included');
        assert.ok(paths.includes(level3Project.path), 'Level 3 project included');
        assert.ok(paths.includes(level4Project.path), 'Level 4 project included');
        
        events.assertEventCounts(4, 0, 0);
    });

});
