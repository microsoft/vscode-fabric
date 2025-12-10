// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { WorkspaceFolderProvider } from '../../../src/localProject/WorkspaceFolderProvider';
import { ILogger, TelemetryService } from '@microsoft/vscode-fabric-util';
import * as utilities from '../../../src/utilities';

/**
 * Fake FileSystem for testing that maintains an in-memory directory structure
 */
class FakeFileSystem implements vscode.FileSystem {
    private directories = new Map<string, [string, vscode.FileType][]>();

    addDirectory(path: string, contents: [string, vscode.FileType][] = []): void {
        this.directories.set(path, contents);
    }

    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const contents = this.directories.get(uri.toString());
        if (contents === undefined) {
            return [];
        }
        return contents;
    }

    // Unused methods required by interface
    stat(uri: vscode.Uri): Thenable<vscode.FileStat> {
        throw new Error('Not implemented');
    }
    readFile(uri: vscode.Uri): Thenable<Uint8Array> {
        throw new Error('Not implemented');
    }
    writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void> {
        throw new Error('Not implemented');
    }
    rename(oldUri: vscode.Uri, newUri: vscode.Uri): Thenable<void> {
        throw new Error('Not implemented');
    }
    delete(uri: vscode.Uri): Thenable<void> {
        throw new Error('Not implemented');
    }
    createDirectory(uri: vscode.Uri): Thenable<void> {
        throw new Error('Not implemented');
    }
    copy(source: vscode.Uri, target: vscode.Uri): Thenable<void> {
        throw new Error('Not implemented');
    }
    isWritableFileSystem(scheme: string): boolean {
        return false;
    }
}

describe('WorkspaceFolderProvider unit tests', () => {
    let logger: ILogger;
    let telemetry: TelemetryService;
    let fileSystem: FakeFileSystem;

    beforeEach(() => {
        logger = {} as ILogger;
        telemetry = {} as TelemetryService;
        fileSystem = new FakeFileSystem();
    });

    describe('Basic functionality', () => {
        it('should create provider with empty workspace', async () => {
            const provider = await createWorkspaceFolderProvider();

            assert.ok(provider, 'Provider should be created');
            assert.ok(provider.workspaceFolders, 'Should have workspaceFolders collection');
            assert.ok(Array.isArray(provider.workspaceFolders.items), 'workspaceFolders.items should be an array');
        });

        it('initializes with empty collection when no workspace folders', async () => {
            // When vscode.workspace.workspaceFolders is undefined or empty
            const provider = await createWorkspaceFolderProvider();

            assert.strictEqual(provider.workspaceFolders.items.length, 0, 'Should have no folders in empty workspace');
        });

        it('is disposable and can be disposed multiple times', async () => {
            const provider = await createWorkspaceFolderProvider();

            assert.ok(typeof provider.dispose === 'function', 'Should have dispose method');

            // Should not throw when disposed
            provider.dispose();

            // Should be safe to call multiple times
            provider.dispose();
        });

        it('should use ObservableSet for workspaceFolders', async () => {
            const provider = await createWorkspaceFolderProvider();

            // ObservableSet should have event methods
            assert.ok(typeof provider.workspaceFolders.onItemAdded === 'function', 'Should have onItemAdded');
            assert.ok(typeof provider.workspaceFolders.onItemRemoved === 'function', 'Should have onItemRemoved');
            assert.ok(typeof provider.workspaceFolders.add === 'function', 'Should have add method');
            assert.ok(typeof provider.workspaceFolders.remove === 'function', 'Should have remove method');
        });
    });

    describe('WorkspaceFolderProvider flat workspace scenarios', () => {
        const sinon = require('sinon');
        let sandbox: any;

        const workspaceUri = vscode.Uri.file('/workspace');
        const subdir1 = vscode.Uri.file('/workspace/project1.type1');
        const subdir2 = vscode.Uri.file('/workspace/project2.type2');

        let isDirectoryStub: any;

        beforeEach(() => {
            sandbox = sinon.createSandbox();
            isDirectoryStub = sandbox.stub(utilities, 'isDirectory').returns(Promise.resolve(true));

            sandbox.stub(vscode.workspace, 'workspaceFolders').value([
                { uri: workspaceUri } as vscode.WorkspaceFolder
            ]);

            // Stub createFileSystemWatcher to return a dummy watcher
            sandbox.stub(vscode.workspace, 'createFileSystemWatcher').returns({
                onDidCreate: () => ({ dispose: () => { } }),
                onDidDelete: () => ({ dispose: () => { } }),
                dispose: () => { }
            } as unknown as vscode.FileSystemWatcher);
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('discovers workspace root and immediate subdirectories', async () => {
            // Set up filesystem
            fileSystem.addDirectory(workspaceUri.toString(), [
                ['project1.type1', vscode.FileType.Directory],
                ['project2.type2', vscode.FileType.Directory]
            ]);
            fileSystem.addDirectory(subdir1.toString(), []);
            fileSystem.addDirectory(subdir2.toString(), []);

            const provider = await createWorkspaceFolderProvider();

            const foundUris = provider.workspaceFolders.items.map(uri => uri.toString());
            assert.ok(foundUris.includes(workspaceUri.toString()), 'Should include workspace root');
            assert.ok(foundUris.includes(subdir1.toString()), 'Should include project1.type1');
            assert.ok(foundUris.includes(subdir2.toString()), 'Should include project2.type2');
            assert.strictEqual(foundUris.length, 3, 'Should discover exactly 3 folders');

        });

        it('ignores files and only adds directories from workspace root', async () => {
            const workspaceUri = vscode.Uri.file('/workspace');
            const subdir = vscode.Uri.file('/workspace/project.type1');

            fileSystem.addDirectory(workspaceUri.toString(), [
                ['readme.md', vscode.FileType.File],
                ['project.type1', vscode.FileType.Directory],
                ['data.json', vscode.FileType.File]
            ]);
            fileSystem.addDirectory(subdir.toString(), []);

            const provider = await createWorkspaceFolderProvider();

            const foundUris = provider.workspaceFolders.items.map(uri => uri.toString());
            assert.ok(foundUris.includes(workspaceUri.toString()), 'Should include workspace root');
            assert.ok(foundUris.includes(subdir.toString()), 'Should include project.type1');
            assert.strictEqual(foundUris.length, 2, 'Should only discover workspace and directory');
        });

        it('discovers multiple workspace roots and their immediate subdirectories', async () => {
            const workspaceUri1 = vscode.Uri.file('/workspace1');
            const workspaceUri2 = vscode.Uri.file('/workspace2');
            const subdir1 = vscode.Uri.file('/workspace1/project1.type1');
            const subdir2 = vscode.Uri.file('/workspace2/project2.type2');

            sandbox.stub(vscode.workspace, 'workspaceFolders').value([
                { uri: workspaceUri1 } as vscode.WorkspaceFolder,
                { uri: workspaceUri2 } as vscode.WorkspaceFolder
            ]);

            fileSystem.addDirectory(workspaceUri1.toString(), [
                ['project1.type1', vscode.FileType.Directory]
            ]);
            fileSystem.addDirectory(subdir1.toString(), []);
            fileSystem.addDirectory(workspaceUri2.toString(), [
                ['project2.type2', vscode.FileType.Directory]
            ]);
            fileSystem.addDirectory(subdir2.toString(), []);

            const provider = await createWorkspaceFolderProvider();

            const foundUris = provider.workspaceFolders.items.map(uri => uri.toString());
            assert.ok(foundUris.includes(workspaceUri1.toString()), 'Should include workspace1 root');
            assert.ok(foundUris.includes(workspaceUri2.toString()), 'Should include workspace2 root');
            assert.ok(foundUris.includes(subdir1.toString()), 'Should include project1.type1');
            assert.ok(foundUris.includes(subdir2.toString()), 'Should include project2.type2');
            assert.strictEqual(foundUris.length, 4, 'Should discover both roots and both projects');
        });

        it('does not add non-existent workspace folder', async () => {
            isDirectoryStub.callsFake(async (fs: vscode.FileSystem, uri: vscode.Uri) => {
                return false;
            });

            // Don't add the directory to fileSystem - it doesn't exist

            const provider = await createWorkspaceFolderProvider();

            const foundUris = provider.workspaceFolders.items.map(uri => uri.toString());
            assert.strictEqual(foundUris.length, 0, 'Should not add non-existent workspace folder');
        });

    });

    describe('Recursive directory scanning', () => {
        const sinon = require('sinon');
        let sandbox: any;
        let isDirectoryStub: any;

        beforeEach(() => {
            sandbox = sinon.createSandbox();
            isDirectoryStub = sandbox.stub(utilities, 'isDirectory').returns(Promise.resolve(true));

            sandbox.stub(vscode.workspace, 'createFileSystemWatcher').returns({
                onDidCreate: () => ({ dispose: () => { } }),
                onDidDelete: () => ({ dispose: () => { } }),
                dispose: () => { }
            } as unknown as vscode.FileSystemWatcher);
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('discovers deeply nested directories (3+ levels)', async () => {
            const workspaceUri = vscode.Uri.file('/workspace');
            const level1 = vscode.Uri.file('/workspace/level1');
            const level2 = vscode.Uri.file('/workspace/level1/level2');
            const level3 = vscode.Uri.file('/workspace/level1/level2/level3');
            const project = vscode.Uri.file('/workspace/level1/level2/level3/project.type1');

            sandbox.stub(vscode.workspace, 'workspaceFolders').value([
                { uri: workspaceUri } as vscode.WorkspaceFolder
            ]);

            // Set up deeply nested directory structure
            fileSystem.addDirectory(workspaceUri.toString(), [['level1', vscode.FileType.Directory]]);
            fileSystem.addDirectory(level1.toString(), [['level2', vscode.FileType.Directory]]);
            fileSystem.addDirectory(level2.toString(), [['level3', vscode.FileType.Directory]]);
            fileSystem.addDirectory(level3.toString(), [['project.type1', vscode.FileType.Directory]]);
            fileSystem.addDirectory(project.toString(), []);

            const provider = await createWorkspaceFolderProvider();

            const foundUris = provider.workspaceFolders.items.map(uri => uri.toString());
            assert.ok(foundUris.includes(workspaceUri.toString()), 'Should include workspace root');
            assert.ok(foundUris.includes(level1.toString()), 'Should include level1');
            assert.ok(foundUris.includes(level2.toString()), 'Should include level2');
            assert.ok(foundUris.includes(level3.toString()), 'Should include level3');
            assert.ok(foundUris.includes(project.toString()), 'Should include project.type1');
            assert.strictEqual(foundUris.length, 5, 'Should discover all 5 nested folders');
        });

        it('discovers multiple branches at different depths', async () => {
            const workspaceUri = vscode.Uri.file('/workspace');
            const branch1 = vscode.Uri.file('/workspace/branch1');
            const project1 = vscode.Uri.file('/workspace/branch1/project1.type1');
            const branch2 = vscode.Uri.file('/workspace/branch2');
            const branch2Sub = vscode.Uri.file('/workspace/branch2/sub');
            const project2 = vscode.Uri.file('/workspace/branch2/sub/project2.type2');
            const branch3 = vscode.Uri.file('/workspace/branch3');
            const branch3Sub = vscode.Uri.file('/workspace/branch3/sub');
            const branch3Deep = vscode.Uri.file('/workspace/branch3/sub/deep');
            const project3 = vscode.Uri.file('/workspace/branch3/sub/deep/project3.type3');

            sandbox.stub(vscode.workspace, 'workspaceFolders').value([
                { uri: workspaceUri } as vscode.WorkspaceFolder
            ]);

            // Set up multi-branch directory structure
            fileSystem.addDirectory(workspaceUri.toString(), [
                ['branch1', vscode.FileType.Directory],
                ['branch2', vscode.FileType.Directory],
                ['branch3', vscode.FileType.Directory]
            ]);

            // Branch 1: shallow nesting
            fileSystem.addDirectory(branch1.toString(), [['project1.type1', vscode.FileType.Directory]]);
            fileSystem.addDirectory(project1.toString(), []);

            // Branch 2: medium nesting
            fileSystem.addDirectory(branch2.toString(), [['sub', vscode.FileType.Directory]]);
            fileSystem.addDirectory(branch2Sub.toString(), [['project2.type2', vscode.FileType.Directory]]);
            fileSystem.addDirectory(project2.toString(), []);

            // Branch 3: deep nesting
            fileSystem.addDirectory(branch3.toString(), [['sub', vscode.FileType.Directory]]);
            fileSystem.addDirectory(branch3Sub.toString(), [['deep', vscode.FileType.Directory]]);
            fileSystem.addDirectory(branch3Deep.toString(), [['project3.type3', vscode.FileType.Directory]]);
            fileSystem.addDirectory(project3.toString(), []);
            const provider = await createWorkspaceFolderProvider();

            const foundUris = provider.workspaceFolders.items.map(uri => uri.toString());
            assert.ok(foundUris.includes(workspaceUri.toString()), 'Should include workspace root');
            assert.ok(foundUris.includes(branch1.toString()), 'Should include branch1');
            assert.ok(foundUris.includes(project1.toString()), 'Should include project1.type1');
            assert.ok(foundUris.includes(branch2.toString()), 'Should include branch2');
            assert.ok(foundUris.includes(branch2Sub.toString()), 'Should include branch2/sub');
            assert.ok(foundUris.includes(project2.toString()), 'Should include project2.type2');
            assert.ok(foundUris.includes(branch3.toString()), 'Should include branch3');
            assert.ok(foundUris.includes(branch3Sub.toString()), 'Should include branch3/sub');
            assert.ok(foundUris.includes(branch3Deep.toString()), 'Should include branch3/sub/deep');
            assert.ok(foundUris.includes(project3.toString()), 'Should include project3.type3');
            assert.strictEqual(foundUris.length, 10, 'Should discover all 10 folders across branches');
        });

        it('ignores files at all nesting levels', async () => {
            const workspaceUri = vscode.Uri.file('/workspace');
            const level1 = vscode.Uri.file('/workspace/level1');
            const project = vscode.Uri.file('/workspace/level1/project.type1');

            sandbox.stub(vscode.workspace, 'workspaceFolders').value([
                { uri: workspaceUri } as vscode.WorkspaceFolder
            ]);

            fileSystem.addDirectory(workspaceUri.toString(), [
                ['readme.md', vscode.FileType.File],
                ['level1', vscode.FileType.Directory],
                ['data.json', vscode.FileType.File]
            ]);
            fileSystem.addDirectory(level1.toString(), [
                ['config.yaml', vscode.FileType.File],
                ['project.type1', vscode.FileType.Directory],
                ['notes.txt', vscode.FileType.File]
            ]);
            fileSystem.addDirectory(project.toString(), [
                ['source.py', vscode.FileType.File]
            ]);

            const provider = await createWorkspaceFolderProvider();

            const foundUris = provider.workspaceFolders.items.map(uri => uri.toString());
            assert.ok(foundUris.includes(workspaceUri.toString()), 'Should include workspace root');
            assert.ok(foundUris.includes(level1.toString()), 'Should include level1');
            assert.ok(foundUris.includes(project.toString()), 'Should include project.type1');
            assert.strictEqual(foundUris.length, 3, 'Should only discover directories, not files');
        });

        it('handles mixed depth across multiple workspace roots', async () => {
            const workspace1Uri = vscode.Uri.file('/workspace1');
            const workspace1Level1 = vscode.Uri.file('/workspace1/level1');
            const workspace1Project = vscode.Uri.file('/workspace1/level1/project1.type1');

            const workspace2Uri = vscode.Uri.file('/workspace2');
            const workspace2Project = vscode.Uri.file('/workspace2/project2.type2');

            sandbox.stub(vscode.workspace, 'workspaceFolders').value([
                { uri: workspace1Uri } as vscode.WorkspaceFolder,
                { uri: workspace2Uri } as vscode.WorkspaceFolder
            ]);

            // Workspace 1: nested structure
            fileSystem.addDirectory(workspace1Uri.toString(), [['level1', vscode.FileType.Directory]]);
            fileSystem.addDirectory(workspace1Level1.toString(), [['project1.type1', vscode.FileType.Directory]]);
            fileSystem.addDirectory(workspace1Project.toString(), []);

            // Workspace 2: flat structure
            fileSystem.addDirectory(workspace2Uri.toString(), [['project2.type2', vscode.FileType.Directory]]);
            fileSystem.addDirectory(workspace2Project.toString(), []);

            const provider = await createWorkspaceFolderProvider();

            const foundUris = provider.workspaceFolders.items.map(uri => uri.toString());
            assert.ok(foundUris.includes(workspace1Uri.toString()), 'Should include workspace1 root');
            assert.ok(foundUris.includes(workspace1Level1.toString()), 'Should include workspace1/level1');
            assert.ok(foundUris.includes(workspace1Project.toString()), 'Should include workspace1 project');
            assert.ok(foundUris.includes(workspace2Uri.toString()), 'Should include workspace2 root');
            assert.ok(foundUris.includes(workspace2Project.toString()), 'Should include workspace2 project');
            assert.strictEqual(foundUris.length, 5, 'Should discover all folders across both workspaces');
        });
    });

    function createWorkspaceFolderProvider(): Promise<WorkspaceFolderProvider> {
        return WorkspaceFolderProvider.create(
            fileSystem,
            logger,
            telemetry
        );
    }
});
