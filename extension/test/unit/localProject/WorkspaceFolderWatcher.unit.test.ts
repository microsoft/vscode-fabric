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
            onDidCreate: (cb: Function) => { onDidCreateHandler = cb; return { dispose: () => {} }; },
            onDidDelete: (cb: Function) => { onDidDeleteHandler = cb; return { dispose: () => {} }; },
            dispose: sandbox.stub()
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
        assert.strictEqual(relativePatternArg?.pattern, '*', 'Pattern should be *');
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
