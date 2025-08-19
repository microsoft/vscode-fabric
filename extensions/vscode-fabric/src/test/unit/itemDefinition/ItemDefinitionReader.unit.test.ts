import * as vscode from 'vscode';
import { ItemDefinitionReader, IBase64Encoder } from '../../../itemDefinition/ItemDefinitionReader';
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
                payloadType: PayloadType.InlineBase64
            }
        ]);
        encoderMock.verify(e => e.encode(It.IsAny()), Times.Once());
    });

    it('recursively reads files in subdirectories', async () => {
        fileSystemMock
            .setup(fs => fs.readDirectory(rootUri))
            .returns(Promise.resolve(
                [
                    ['file1.txt', vscode.FileType.File],
                    ['dir', vscode.FileType.Directory]
                ]
            ));
        fileSystemMock
            .setup(fs => fs.readDirectory(It.Is<vscode.Uri>(v => v.fsPath.endsWith('dir'))))
            .returns(Promise.resolve(
                [
                    ['file2.txt', vscode.FileType.File]
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
                payloadType: PayloadType.InlineBase64
            },
            {
                path: 'dir/file2.txt',
                payload: 'encoded',
                payloadType: PayloadType.InlineBase64
            }
        ]);
        encoderMock.verify(e => e.encode(It.IsAny()), Times.Exactly(2));
    });

    it('skips .platform file', async () => {
        fileSystemMock
            .setup(fs => fs.readDirectory(rootUri))
            .returns(Promise.resolve(
                [
                    ['.platform', vscode.FileType.File],
                    ['file1.txt', vscode.FileType.File]
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
                payloadType: PayloadType.InlineBase64
            }
        ]);
    });

    it('uses Base64Encoder by default', async () => {
        // Use real encoder, mock file system
        const realReader = new ItemDefinitionReader(fileSystemMock.object());
        fileSystemMock
            .setup(fs => fs.readDirectory(rootUri))
            .returns(Promise.resolve(
                [
                    ['file1.txt', vscode.FileType.File]
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
    
});