import * as assert from 'assert';
import * as vscode from 'vscode';
import { Mock, It, Times } from 'moq.ts';
import { tryParseLocalProjectData } from '../../../localProject/utilities';

describe('tryParseLocalProjectData', () => {
    let fileSystemMock: Mock<vscode.FileSystem>;

    beforeEach(() => {
        fileSystemMock = new Mock<vscode.FileSystem>();

        fileSystemMock
            .setup(fs => fs.readFile(It.IsAny()))
            .throws(new Error('File not found'));
    });

    it('returns [displayName, type] from .platform file if present', async () => {
        const platformJson = {
            metadata: {
                type: 'Notebook',
                displayName: 'Test Notebook',
            },
        };
        fileSystemMock
            .setup(fs => fs.readFile(It.IsAny()))
            .returns(Promise.resolve(Buffer.from(JSON.stringify(platformJson))));
        const uri = vscode.Uri.file('/test/Foo.Bar');

        const result = await act(uri);

        assert.deepStrictEqual(result, { displayName: 'Test Notebook', type: 'Notebook' });
        fileSystemMock.verify(fs => fs.readFile(It.IsAny()), Times.Once());
    });

    it('falls back to path if .platform file missing metadata', async () => {
        fileSystemMock
            .setup(fs => fs.readFile(It.IsAny()))
            .returns(Promise.resolve(Buffer.from(JSON.stringify({}))));
        const uri = vscode.Uri.file('/test/Foo.Bar');

        const result = await act(uri);

        assert.deepStrictEqual(result, { displayName: 'Foo', type: 'Bar' });
        fileSystemMock.verify(fs => fs.readFile(It.IsAny()), Times.Once());
    });

    it('falls back to path if .platform file has invalid JSON', async () => {
        fileSystemMock
            .setup(fs => fs.readFile(It.IsAny()))
            .returns(Promise.resolve(Buffer.from('{invalid json}')));
        const uri = vscode.Uri.file('/test/Foo.Bar');

        const result = await act(uri);

        assert.deepStrictEqual(result, { displayName: 'Foo', type: 'Bar' });
    });

    it('returns [name, type] for valid path', async () => {
        const uri = vscode.Uri.file('/test/Foo.Bar');

        const result = await act(uri);

        assert.deepStrictEqual(result, { displayName: 'Foo', type: 'Bar' });
    });

    it('returns [name, type] for nested path', async () => {
        const uri = vscode.Uri.file('/some/path/Project.Type');

        const result = await act(uri);

        assert.deepStrictEqual(result, { displayName: 'Project', type: 'Type' });
    });

    it('returns undefined for path without extension', async () => {
        const uri = vscode.Uri.file('/test/FooBar');

        const result = await act(uri);

        assert.strictEqual(result, undefined);
    });

    it('returns undefined for path with only extension', async () => {
        const uri = vscode.Uri.file('/test/.Bar');

        const result = await act(uri);

        assert.strictEqual(result, undefined);
    });

    it('returns [name, type] for extension length 1', async () => {
        const uri = vscode.Uri.file('/test/Foo.B');

        const result = await act(uri);

        assert.deepStrictEqual(result, { displayName: 'Foo', type: 'B' });
    });

    it('returns undefined for empty path', async () => {
        const uri = vscode.Uri.file('');

        const result = await act(uri);

        assert.strictEqual(result, undefined);
    });

    it('returns undefined for malformed uri', async () => {
        // Simulate a malformed path
        const uri = { path: null } as unknown as vscode.Uri;

        const result = await act(uri);

        assert.strictEqual(result, undefined);
    });

    async function act(uri: vscode.Uri): Promise<{ displayName: string; type: string } | undefined> {
        return tryParseLocalProjectData(uri, fileSystemMock.object());
    };
});
