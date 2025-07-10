import * as Mocha from 'mocha';
import * as assert from 'assert';
import { Uri } from 'vscode';
import { IWorkspaceFolderProvider } from '../../../localProject/definitions';
import { ExplorerLocalProjectDiscovery } from '../../../localProject/ExplorerLocalProjectDiscovery';
import { IObservableArray } from '../../../collections/definitions';
import { ObservableSet } from '../../../collections/ObservableSet';
import { ObservableArrayEventValidator } from './ObservableSet.unit.test';

class MockWorkspaceFolderProvider implements IWorkspaceFolderProvider {
    public workspaceFolders: IObservableArray<Uri>;
    
    constructor (workspaceFolders: Uri[] = []) {
        this.workspaceFolders = new ObservableSet<Uri>(workspaceFolders);
    }
}

describe('ExplorerLocalProjectDiscovery unit tests', () => {
    it('Empty when no workspaces found', async () => {
        const folders: Uri[] = [];
        const discovery = new ExplorerLocalProjectDiscovery(new MockWorkspaceFolderProvider(folders));
        assert.equal(discovery.projects.length, 0, 'Expected empty array');
    });

    it('Finds top-level folder', async () => {
        const folders: Uri[] = [
            Uri.file('/user/me/workspaces/Type2Item.type2'),
        ];
        const discovery = new ExplorerLocalProjectDiscovery(new MockWorkspaceFolderProvider(folders));
        assert.equal(discovery.projects.items.length, 1, 'Discovered projects');
        assert.equal(discovery.projects.items[0].path, folders[0], 'Path');
        assert.equal(discovery.projects.items[0].artifactType, 'type2', 'Artifact type');
    });

    it('Ignores top-level with incorrect naming', async () => {
        const folders: Uri[] = [
            Uri.file('/user/me/workspaces/Type2Item'),
        ];
        const discovery = new ExplorerLocalProjectDiscovery(new MockWorkspaceFolderProvider(folders));
        assert.equal(discovery.projects.items.length, 0, 'Expected empty array');
    });

    it('Events: basic adds and deletes', async () => {
        const initialFolder = Uri.file('/user/me/workspaces/Type2Item.type2');
        const folderProvider = new MockWorkspaceFolderProvider([ initialFolder ]);
        const discovery = new ExplorerLocalProjectDiscovery(folderProvider);

        const events = new ObservableArrayEventValidator(discovery.projects);
        const folderToAdd = Uri.file('/user/me/workspaces/Type3Item.type3');
        folderProvider.workspaceFolders.add(folderToAdd);
        folderProvider.workspaceFolders.remove(initialFolder);

        assert.equal(discovery.projects.items.length, 1, 'Discovered projects');
        assert.equal(discovery.projects.items[0].path, folderToAdd, 'Path');
        assert.equal(discovery.projects.items[0].artifactType, 'type3', 'Artifact type');

        // Note: there are actually 2 adds throughout the test, but because the event listener was only hooked up after the initial add, it only sees one
        events.assertEventCounts(1, 1, 0);
    });

    it('Events: mis-matches', async () => {
        const initialFolder = Uri.file('/user/me/workspaces/Type2Item.type2');
        const folderProvider = new MockWorkspaceFolderProvider([ initialFolder ]);
        const discovery = new ExplorerLocalProjectDiscovery(folderProvider);

        const events = new ObservableArrayEventValidator(discovery.projects);
        folderProvider.workspaceFolders.remove(Uri.file('/user/me/workspaces/Type2Item.type4'));
        assert.equal(discovery.projects.items.length, 1, 'Discovered projects - Type mismatch');
        folderProvider.workspaceFolders.remove(Uri.file('/user/me/workspaces/Type4Item.type2'));
        assert.equal(discovery.projects.items.length, 1, 'Discovered projects - Name mismatch');
        folderProvider.workspaceFolders.remove(Uri.file('/user/me/workspaces/Type2Item.type2'.toLowerCase()));
        assert.equal(discovery.projects.items.length, 1, 'Discovered projects - Case mismatch');

        events.assertEventCounts(0, 0, 0);
    });

});
