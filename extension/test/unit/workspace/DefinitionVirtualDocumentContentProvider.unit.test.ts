// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import { DefinitionVirtualDocumentContentProvider } from '../../../src/workspace/DefinitionVirtualDocumentContentProvider';
import { DefinitionFileSystemProvider } from '../../../src/workspace/DefinitionFileSystemProvider';

describe('DefinitionVirtualDocumentContentProvider', function () {
    let fileSystemProviderMock: Mock<DefinitionFileSystemProvider>;
    let provider: DefinitionVirtualDocumentContentProvider;

    const workspaceId = 'workspace-123';
    const artifactId = 'artifact-456';
    const fileName = 'test.json';

    beforeEach(function () {
        fileSystemProviderMock = new Mock<DefinitionFileSystemProvider>();
        provider = new DefinitionVirtualDocumentContentProvider(fileSystemProviderMock.object());
    });

    describe('scheme', function () {
        it('should have correct scheme constant', function () {
            assert.strictEqual(DefinitionVirtualDocumentContentProvider.scheme, 'fabric-definition-virtual');
        });
    });

    describe('createUri', function () {
        it('should create URI with correct scheme', function () {
            const uri = DefinitionVirtualDocumentContentProvider.createUri(workspaceId, artifactId, fileName);

            assert.strictEqual(uri.scheme, 'fabric-definition-virtual');
        });

        it('should create URI with correct path format', function () {
            const uri = DefinitionVirtualDocumentContentProvider.createUri(workspaceId, artifactId, fileName);

            assert.strictEqual(uri.path, `/${workspaceId}/${artifactId}/${fileName}`);
        });

        it('should handle nested file paths', function () {
            const nestedPath = 'folder/subfolder/file.json';
            const uri = DefinitionVirtualDocumentContentProvider.createUri(workspaceId, artifactId, nestedPath);

            assert.strictEqual(uri.path, `/${workspaceId}/${artifactId}/${nestedPath}`);
        });
    });

    describe('provideTextDocumentContent', function () {
        it('should convert virtual URI to editable URI and read from file system', async function () {
            const virtualUri = DefinitionVirtualDocumentContentProvider.createUri(workspaceId, artifactId, fileName);
            const content = new TextEncoder().encode('{"test": "value"}');

            fileSystemProviderMock.setup(x => x.readFile(It.Is<vscode.Uri>(uri => 
                uri.scheme === 'fabric-definition' &&
                uri.path === virtualUri.path
            ))).returns(Promise.resolve(content));

            const result = await provider.provideTextDocumentContent(virtualUri);

            assert.strictEqual(result, '{"test": "value"}');
        });

        it('should handle synchronous readFile result', async function () {
            const virtualUri = DefinitionVirtualDocumentContentProvider.createUri(workspaceId, artifactId, fileName);
            const content = new TextEncoder().encode('sync content');

            // readFile can return Uint8Array directly (sync) or Promise<Uint8Array>
            fileSystemProviderMock.setup(x => x.readFile(It.IsAny())).returns(content);

            const result = await provider.provideTextDocumentContent(virtualUri);

            assert.strictEqual(result, 'sync content');
        });

        it('should decode UTF-8 content correctly', async function () {
            const virtualUri = DefinitionVirtualDocumentContentProvider.createUri(workspaceId, artifactId, fileName);
            const unicodeContent = '{"message": "Hello 世界 🌍"}';
            const content = new TextEncoder().encode(unicodeContent);

            fileSystemProviderMock.setup(x => x.readFile(It.IsAny())).returns(Promise.resolve(content));

            const result = await provider.provideTextDocumentContent(virtualUri);

            assert.strictEqual(result, unicodeContent);
        });

        it('should return error message when readFile throws', async function () {
            const virtualUri = DefinitionVirtualDocumentContentProvider.createUri(workspaceId, artifactId, fileName);
            const error = new Error('File not found');

            fileSystemProviderMock.setup(x => x.readFile(It.IsAny())).returns(Promise.reject(error));

            const result = await provider.provideTextDocumentContent(virtualUri);

            assert.ok(result.startsWith('// Error loading definition file:'));
            assert.ok(result.includes('File not found'));
        });

        it('should handle FileSystemError', async function () {
            const virtualUri = DefinitionVirtualDocumentContentProvider.createUri(workspaceId, artifactId, fileName);
            const error = vscode.FileSystemError.FileNotFound(virtualUri);

            fileSystemProviderMock.setup(x => x.readFile(It.IsAny())).returns(Promise.reject(error));

            const result = await provider.provideTextDocumentContent(virtualUri);

            assert.ok(result.startsWith('// Error loading definition file:'));
        });

        it('should handle empty file content', async function () {
            const virtualUri = DefinitionVirtualDocumentContentProvider.createUri(workspaceId, artifactId, fileName);
            const content = new Uint8Array(0);

            fileSystemProviderMock.setup(x => x.readFile(It.IsAny())).returns(Promise.resolve(content));

            const result = await provider.provideTextDocumentContent(virtualUri);

            assert.strictEqual(result, '');
        });
    });

    describe('refresh', function () {
        it('should fire onDidChange event with the URI', function (done) {
            const uri = DefinitionVirtualDocumentContentProvider.createUri(workspaceId, artifactId, fileName);

            provider.onDidChange(firedUri => {
                assert.strictEqual(firedUri, uri);
                done();
            });

            provider.refresh(uri);
        });

        it('should trigger multiple onDidChange listeners', function () {
            const uri = DefinitionVirtualDocumentContentProvider.createUri(workspaceId, artifactId, fileName);
            let listener1Called = false;
            let listener2Called = false;

            provider.onDidChange(() => { listener1Called = true; });
            provider.onDidChange(() => { listener2Called = true; });

            provider.refresh(uri);

            assert.ok(listener1Called, 'First listener should be called');
            assert.ok(listener2Called, 'Second listener should be called');
        });
    });
});
