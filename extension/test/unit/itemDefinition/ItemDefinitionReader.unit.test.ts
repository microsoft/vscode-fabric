// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ItemDefinitionReader, IBase64Encoder } from '../../../src/itemDefinition/ItemDefinitionReader';
import { IItemDefinition, PayloadType } from '@microsoft/vscode-fabric-api';
import { Mock, It, Times } from 'moq.ts';
import * as assert from 'assert';

describe('ItemDefinitionReader', () => {
    let fileSystemMock: Mock<vscode.FileSystem>;
    let encoderMock: Mock<IBase64Encoder>;
    let reader: ItemDefinitionReader;

    const rootUri = vscode.Uri.file('/root');

    beforeEach(() => {
        fileSystemMock = new Mock<vscode.FileSystem>();
        encoderMock = new Mock<IBase64Encoder>();
        reader = new ItemDefinitionReader(fileSystemMock.object(), encoderMock.object());
    });

    it('returns empty parts when directory is empty', async () => {
        fileSystemMock
            .setup(fs => fs.readDirectory(It.IsAny()))
            .returns(Promise.resolve([]));
        const result = await reader.read(rootUri);
        assert.deepStrictEqual(result.parts, []);
    });

    it('reads single file in root directory', async () => {
        fileSystemMock
            .setup(fs => fs.readDirectory(rootUri))
            .returns(Promise.resolve(
                [
                    ['file1.txt', vscode.FileType.File],
                ]
            ));
        fileSystemMock
            .setup(fs => fs.readFile(It.Is<vscode.Uri>(v => v.fsPath.endsWith('file1.txt'))))
            .returns(Promise.resolve(new Uint8Array([1, 2, 3])));
        encoderMock
            .setup(e => e.encode(It.IsAny()))
            .returns('encoded-content');

        const result = await reader.read(rootUri);

        assert.deepStrictEqual(result.parts, [
            {
                path: 'file1.txt',
                payload: 'encoded-content',
                payloadType: PayloadType.InlineBase64,
            },
        ]);
        encoderMock.verify(e => e.encode(It.IsAny()), Times.Once());
    });

    it('recursively reads files in subdirectories', async () => {
        fileSystemMock
            .setup(fs => fs.readDirectory(rootUri))
            .returns(Promise.resolve(
                [
                    ['file1.txt', vscode.FileType.File],
                    ['dir', vscode.FileType.Directory],
                ]
            ));
        fileSystemMock
            .setup(fs => fs.readDirectory(It.Is<vscode.Uri>(v => v.fsPath.endsWith('dir'))))
            .returns(Promise.resolve(
                [
                    ['file2.txt', vscode.FileType.File],
                ]
            ));
        fileSystemMock
            .setup(fs => fs.readFile(It.Is<vscode.Uri>(v => v.fsPath.endsWith('file1.txt'))))
            .returns(Promise.resolve(new Uint8Array([1])));
        fileSystemMock
            .setup(fs => fs.readFile(It.Is<vscode.Uri>(v => v.fsPath.endsWith('file2.txt'))))
            .returns(Promise.resolve(new Uint8Array([2])));
        encoderMock
            .setup(e => e.encode(It.IsAny()))
            .returns('encoded');

        const result = await reader.read(rootUri);

        assert.deepStrictEqual(result.parts, [
            {
                path: 'file1.txt',
                payload: 'encoded',
                payloadType: PayloadType.InlineBase64,
            },
            {
                path: 'dir/file2.txt',
                payload: 'encoded',
                payloadType: PayloadType.InlineBase64,
            },
        ]);
        encoderMock.verify(e => e.encode(It.IsAny()), Times.Exactly(2));
    });

    it('skips .platform file', async () => {
        fileSystemMock
            .setup(fs => fs.readDirectory(rootUri))
            .returns(Promise.resolve(
                [
                    ['.platform', vscode.FileType.File],
                    ['file1.txt', vscode.FileType.File],
                ]
            ));
        fileSystemMock
            .setup(fs => fs.readFile(It.Is<vscode.Uri>(v => v.fsPath.endsWith('file1.txt'))))
            .returns(Promise.resolve(new Uint8Array([1])));
        encoderMock
            .setup(e => e.encode(It.IsAny()))
            .returns('encoded');

        const result = await reader.read(rootUri);

        assert.deepStrictEqual(result.parts, [
            {
                path: 'file1.txt',
                payload: 'encoded',
                payloadType: PayloadType.InlineBase64,
            },
        ]);
    });

    it('uses Base64Encoder by default', async () => {
        // Use real encoder, mock file system
        const realReader = new ItemDefinitionReader(fileSystemMock.object());
        fileSystemMock
            .setup(fs => fs.readDirectory(rootUri))
            .returns(Promise.resolve(
                [
                    ['file1.txt', vscode.FileType.File],
                ]
            ));
        fileSystemMock
            .setup(fs => fs.readFile(It.IsAny()))
            .returns(Promise.resolve(new Uint8Array([65, 66, 67]))); // 'ABC'

        const result = await realReader.read(rootUri);

        assert.strictEqual(result.parts[0].payload, Buffer.from([65, 66, 67]).toString('base64'));
    });

    it('propagates errors from file system', async () => {
        fileSystemMock.setup(fs => fs.readDirectory(It.IsAny()))
            .throws(new Error('File system error'));

        await assert.rejects(
            () => reader.read(rootUri),
            /File system error/
        );
    });

    it('scans directory when files array is empty', async () => {
        fileSystemMock
            .setup(fs => fs.readDirectory(rootUri))
            .returns(Promise.resolve(
                [
                    ['file1.txt', vscode.FileType.File],
                ]
            ));
        fileSystemMock
            .setup(fs => fs.readFile(It.Is<vscode.Uri>(v => v.fsPath.endsWith('file1.txt'))))
            .returns(Promise.resolve(new Uint8Array([1, 2, 3])));
        encoderMock
            .setup(e => e.encode(It.IsAny()))
            .returns('encoded-content');

        const result = await reader.read(rootUri, []);

        assert.deepStrictEqual(result.parts, [
            {
                path: 'file1.txt',
                payload: 'encoded-content',
                payloadType: PayloadType.InlineBase64,
            },
        ]);
        encoderMock.verify(e => e.encode(It.IsAny()), Times.Once());
    });

    it('reads only the specified files', async () => {
        const files = ['a.txt', 'child/c.txt'];
        fileSystemMock
            .setup(fs => fs.readFile(It.Is<vscode.Uri>(v => v.fsPath.endsWith('a.txt'))))
            .returns(Promise.resolve(new Uint8Array([1, 2, 3])));
        fileSystemMock
            .setup(fs => fs.readFile(It.Is<vscode.Uri>(v => v.fsPath.endsWith('child/b.txt'))))
            .returns(Promise.resolve(new Uint8Array([4, 5, 6])));
        fileSystemMock
            .setup(fs => fs.readFile(It.Is<vscode.Uri>(v => v.fsPath.endsWith('child/c.txt'))))
            .returns(Promise.resolve(new Uint8Array([7, 8, 9])));
        encoderMock
            .setup(e => e.encode(It.IsAny()))
            .returns('encoded-file');

        const result = await reader.read(rootUri, files);
        assert.deepStrictEqual(result.parts, [
            {
                path: 'a.txt',
                payload: 'encoded-file',
                payloadType: PayloadType.InlineBase64,
            },
            {
                path: 'child/c.txt',
                payload: 'encoded-file',
                payloadType: PayloadType.InlineBase64,
            },
        ]);
        encoderMock.verify(e => e.encode(It.IsAny()), Times.Exactly(2));
    });

    it('normalizes slashes in file paths', async () => {
        const files = ['dir\\subdir/file.txt'];
        fileSystemMock.setup(fs => fs.readFile(It.Is<vscode.Uri>(v => v.fsPath.endsWith('file.txt'))))
            .returns(Promise.resolve(new Uint8Array([1, 2, 3])));
        encoderMock.setup(e => e.encode(It.IsAny()))
            .returns('encoded-file');

        const result = await reader.read(rootUri, files);
        assert.deepStrictEqual(result.parts, [
            {
                path: 'dir/subdir/file.txt',
                payload: 'encoded-file',
                payloadType: PayloadType.InlineBase64,
            },
        ]);
        encoderMock.verify(e => e.encode(It.IsAny()), Times.Once());
    });

    it('throws if files contains directory traversal', async () => {
        const files = ['../evil.txt'];
        await assert.rejects(
            () => reader.read(rootUri, files),
            /directory traversal/
        );
    });

    it('includes file name in error message when file read fails', async () => {
        const files = ['good.txt', 'problematic.abf'];
        fileSystemMock
            .setup(fs => fs.readFile(It.Is<vscode.Uri>(v => v.fsPath.endsWith('good.txt'))))
            .returns(Promise.resolve(new Uint8Array([1, 2, 3])));
        fileSystemMock
            .setup(fs => fs.readFile(It.Is<vscode.Uri>(v => v.fsPath.endsWith('problematic.abf'))))
            .throws(new Error('Cannot create a string longer than 0x1fffffe8 characters'));
        encoderMock
            .setup(e => e.encode(It.IsAny()))
            .returns('encoded');

        await assert.rejects(
            () => reader.read(rootUri, files),
            (error: Error) => {
                assert.ok(error.message.includes('problematic.abf'), 'Error should include the problematic file name');
                assert.ok(error.message.includes('Cannot create a string longer than'), 'Error should include the original error message');
                return true;
            }
        );
    });

    it('includes file name in error message when encoding fails', async () => {
        const files = ['large-file.bin'];
        fileSystemMock
            .setup(fs => fs.readFile(It.IsAny()))
            .returns(Promise.resolve(new Uint8Array([1, 2, 3])));
        encoderMock
            .setup(e => e.encode(It.IsAny()))
            .throws(new Error('String length exceeded'));

        await assert.rejects(
            () => reader.read(rootUri, files),
            (error: Error) => {
                assert.ok(error.message.includes('large-file.bin'), 'Error should include the file name');
                assert.ok(error.message.includes('String length exceeded'), 'Error should include the encoding error');
                return true;
            }
        );
    });
});
