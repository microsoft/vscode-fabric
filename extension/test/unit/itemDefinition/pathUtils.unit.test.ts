// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { getItemDefinitionPathUri } from '../../../src/itemDefinition/pathUtils';

const destination = vscode.Uri.file('/path/to/local/folder');

describe('getItemDefinitionPathUri', () => {
    it('allows file in root of destination', () => {
        const result = getItemDefinitionPathUri('file.txt', destination);
        const expectedPath = vscode.Uri.file('/path/to/local/folder/file.txt');
        assert.strictEqual(result.fsPath, expectedPath.fsPath);
    });

    it('allows file in root of destination (leading .)', () => {
        const result = getItemDefinitionPathUri('./file.txt', destination);
        const expectedPath = vscode.Uri.file('/path/to/local/folder/file.txt');
        assert.strictEqual(result.fsPath, expectedPath.fsPath);
    });

    it('allows file in subdirectory', () => {
        const result = getItemDefinitionPathUri('subdir/file.txt', destination);
        const expectedPath = vscode.Uri.file('/path/to/local/folder/subdir/file.txt');
        assert.strictEqual(result.fsPath, expectedPath.fsPath);
    });

    it('allows file in subdirectory (leading .)', () => {
        const result = getItemDefinitionPathUri('./subdir/file.txt', destination);
        const expectedPath = vscode.Uri.file('/path/to/local/folder/subdir/file.txt');
        assert.strictEqual(result.fsPath, expectedPath.fsPath);
    });

    it('allows file in deep subdirectory', () => {
        const result = getItemDefinitionPathUri('subdir/deep/file.txt', destination);
        const expectedPath = vscode.Uri.file('/path/to/local/folder/subdir/deep/file.txt');
        assert.strictEqual(result.fsPath, expectedPath.fsPath);
    });

    it('allows file in deep subdirectory (leading .)', () => {
        const result = getItemDefinitionPathUri('./subdir/deep/file.txt', destination);
        const expectedPath = vscode.Uri.file('/path/to/local/folder/subdir/deep/file.txt');
        assert.strictEqual(result.fsPath, expectedPath.fsPath);
    });

    it('rejects absolute paths', () => {
        expectUnsafePath('/file.txt', 'Should reject POSIX absolute path');
    });

    it('rejects leading .. traversal', () => {
        expectUnsafePath('../file.txt');
        expectUnsafePath('..\\file.txt');
        expectUnsafePath('../../subdir/file.txt');
        expectUnsafePath('..\\subdir\\file.txt');
    });

    it('rejects traversal inside path', () => {
        expectUnsafePath('subdir/../file.txt');
        expectUnsafePath('subdir\\..\\file.txt');
        expectUnsafePath('subdir/lead../file.txt');
        expectUnsafePath('subdir\\lead..\\file.txt');
    });

    it('rejects empty path', () => {
        expectMissingPath('');
    });

    it('rejects null/undefined input', () => {
        expectMissingPath(undefined as any);
        expectMissingPath(null as any);
    });
});

function expectUnsafePath(path: string, msg?: string) {
    assert.throws(
        () => getItemDefinitionPathUri(path, destination),
        /Unsafe file path/,
        msg ?? `Expected Unsafe file path error for: ${path}`
    );
}

function expectMissingPath(path: string, msg?: string) {
    assert.throws(
        () => getItemDefinitionPathUri(path as any, destination),
        /Missing file path/,
        msg ?? `Expected Missing file path error for: ${path}`
    );
}
