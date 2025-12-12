// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { Mock } from 'moq.ts';
import { WorkspaceFolderWatcher } from '../../../src/localProject/WorkspaceFolderWatcher';
import * as utilities from '../../../src/utilities';
import { IObservableArray } from '../../../src/collections/definitions';
import { ObservableSet } from '../../../src/collections/ObservableSet';
import { ObservableArrayEventValidator } from './ObservableSet.unit.test';

describe('WorkspaceFolderWatcher', () => {
    const sinon = require('sinon');
    let sandbox: any;
    let fileSystemMock: Mock<vscode.FileSystem>;
    let folderCollection: IObservableArray<vscode.Uri>;
    let events: ObservableArrayEventValidator<vscode.Uri>;
    let isDirectoryStub: any;
    let watcherStub: any;
    let onDidCreateHandler: Function | undefined;
    let onDidDeleteHandler: Function | undefined;
    let relativePatternArg: vscode.RelativePattern | undefined;
    const folderUri = vscode.Uri.file('/workspace');
    const childDirUri = vscode.Uri.file('/workspace/child');
    const addDirUri = vscode.Uri.file('/workspace/add');

    beforeEach(() => {
        // Create the folder collection in a manner consistent with how the WorkspaceFolderWatcher is typically created:
        //   including 2 folders that have already been found during a scan and a proper comparer
        folderCollection = new ObservableSet<vscode.Uri>([folderUri, childDirUri], (a, b) => a.toString(true) === b.toString(true));
        events = new ObservableArrayEventValidator(folderCollection);
        fileSystemMock = new Mock<vscode.FileSystem>();

        onDidCreateHandler = undefined;
        onDidDeleteHandler = undefined;
        relativePatternArg = undefined;

        sandbox = sinon.createSandbox();
        isDirectoryStub = sandbox.stub(utilities, 'isDirectory');

        // Stub createFileSystemWatcher to capture event handlers
        watcherStub = {
            onDidCreate: (cb: Function) => {
                onDidCreateHandler = cb; return { dispose: () => {} };
            },
            onDidDelete: (cb: Function) => {
                onDidDeleteHandler = cb; return { dispose: () => {} };
            },
            dispose: sandbox.stub(),
        };
        sandbox.stub(vscode.workspace, 'createFileSystemWatcher').callsFake((pattern: vscode.RelativePattern) => {
            relativePatternArg = pattern;
            return watcherStub;
        });
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('creates a FileSystemWatcher with correct pattern', () => {
        new WorkspaceFolderWatcher(folderUri, fileSystemMock.object(), folderCollection);
        assert.ok(relativePatternArg instanceof vscode.RelativePattern, 'Should use RelativePattern');
        assert.strictEqual(relativePatternArg?.baseUri.fsPath, folderUri.fsPath, 'Pattern base should match folder');
        assert.strictEqual(relativePatternArg?.pattern, '**', 'Pattern should be **');
    });

    it('adds folder to collection on directory creation', async () => {
        isDirectoryStub.resolves(true);
        new WorkspaceFolderWatcher(folderUri, fileSystemMock.object(), folderCollection);
        assert.ok(onDidCreateHandler, 'onDidCreate handler should be set');
        await onDidCreateHandler(addDirUri);
        events.assertStrictEquals([addDirUri], [], 0);
    });

    it('does not add non-directory on creation', async () => {
        isDirectoryStub.resolves(false);
        new WorkspaceFolderWatcher(folderUri, fileSystemMock.object(), folderCollection);
        assert.ok(onDidCreateHandler, 'onDidCreate handler should be set');
        await onDidCreateHandler(addDirUri);
        events.assertStrictEquals([], [], 0);
    });

    it('removes folder from collection on directory deletion', async () => {
        isDirectoryStub.resolves(true);
        new WorkspaceFolderWatcher(folderUri, fileSystemMock.object(), folderCollection);
        assert.ok(onDidDeleteHandler, 'onDidDelete handler should be set');
        await onDidDeleteHandler(childDirUri);
        events.assertStrictEquals([], [childDirUri], 0);
    });

    it('removes folder and descendants from collection on directory deletion', async () => {
        // Add deeply nested directories under /workspace/child
        const childLevel1 = vscode.Uri.file('/workspace/child/level1');
        const childLevel2 = vscode.Uri.file('/workspace/child/level1/level2');

        // Add deeply nested directories under /workspace/child-keep
        const childKeep = vscode.Uri.file('/workspace/child-keep');
        const childKeepLevel1 = vscode.Uri.file('/workspace/child-keep/level1');
        const childKeepLevel2 = vscode.Uri.file('/workspace/child-keep/level1/level2');

        // Add all directories to collection
        folderCollection.add(childLevel1);
        folderCollection.add(childLevel2);
        folderCollection.add(childKeep);
        folderCollection.add(childKeepLevel1);
        folderCollection.add(childKeepLevel2);

        // Reset event tracker after setup
        events = new ObservableArrayEventValidator(folderCollection);

        isDirectoryStub.resolves(true);
        new WorkspaceFolderWatcher(folderUri, fileSystemMock.object(), folderCollection);
        assert.ok(onDidDeleteHandler, 'onDidDelete handler should be set');

        // Delete /workspace/child - should remove child, child/level1, and child/level1/level2
        await onDidDeleteHandler(childDirUri);

        // Verify only child and its descendants were removed
        events.assertStrictEquals([], [childDirUri, childLevel1, childLevel2], 0);

        // Verify child-keep and its descendants remain in collection
        const remainingUris = folderCollection.items.map(uri => uri.toString());
        assert.ok(remainingUris.includes(childKeep.toString()), 'Should keep child-keep');
        assert.ok(remainingUris.includes(childKeepLevel1.toString()), 'Should keep child-keep/level1');
        assert.ok(remainingUris.includes(childKeepLevel2.toString()), 'Should keep child-keep/level1/level2');
    });

    it('does not remove non-directory on deletion', async () => {
        isDirectoryStub.resolves(false);
        new WorkspaceFolderWatcher(folderUri, fileSystemMock.object(), folderCollection);
        assert.ok(onDidDeleteHandler, 'onDidDelete handler should be set');
        await onDidDeleteHandler(childDirUri);
        events.assertStrictEquals([], [], 0);
    });

    it('disposes the watcher and sets it to undefined', () => {
        const watcher = new WorkspaceFolderWatcher(folderUri, fileSystemMock.object(), folderCollection);
        watcher.dispose();
        assert.ok(watcherStub.dispose.calledOnce, 'Watcher dispose should be called');
        // Dispose again should not throw
        watcher.dispose();
    });
});
