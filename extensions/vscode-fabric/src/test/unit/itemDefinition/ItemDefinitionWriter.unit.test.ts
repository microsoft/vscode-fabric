// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { Mock, It, Times } from 'moq.ts';
import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import { IItemDefinition, PayloadType } from '@microsoft/vscode-fabric-api';
import { ItemDefinitionWriter } from '../../../itemDefinition/ItemDefinitionWriter';
import * as pathUtils from '../../../itemDefinition/pathUtils';

describe('ItemDefinitionWriter', () => {
    let fileSystemMock: Mock<vscode.FileSystem>;
    let writer: ItemDefinitionWriter;
    let destination: vscode.Uri;

    beforeEach(() => {
        fileSystemMock = new Mock<vscode.FileSystem>();
        writer = new ItemDefinitionWriter(fileSystemMock.object());
        destination = vscode.Uri.file('/path/to/local/folder/');
    });

    it('should create directories and write all files for each part', async () => {
        const itemDefinition: IItemDefinition = {
            parts: [
                {
                    path: 'root.txt',
                    payload: Buffer.from('root content').toString('base64'),
                    payloadType: PayloadType.InlineBase64,
                },
                {
                    path: 'subdir/file.txt',
                    payload: Buffer.from('subdir content').toString('base64'),
                    payloadType: PayloadType.InlineBase64,
                },
            ],
        };

        fileSystemMock.setup(fs => fs.createDirectory(It.IsAny())).returns(Promise.resolve());
        fileSystemMock.setup(fs => fs.writeFile(It.IsAny(), It.IsAny())).returns(Promise.resolve());

        await writer.save(itemDefinition, destination);

        // WriteFile automatically creates directories as needed
        fileSystemMock.verify(fs => fs.createDirectory(It.IsAny()), Times.Never());

        fileSystemMock.verify(fs => fs.writeFile(
            It.Is<vscode.Uri>(uri => uri.fsPath.endsWith('root.txt')),
            It.Is<Uint8Array>(buf => buf.toString() === 'root content')
        ), Times.Once());
        const expectedSubdirPath = path.join(destination.fsPath, 'subdir', 'file.txt');
        fileSystemMock.verify(fs => fs.writeFile(
            It.Is<vscode.Uri>(uri => uri.fsPath.endsWith(expectedSubdirPath)),
            It.Is<Uint8Array>(buf => buf.toString() === 'subdir content')
        ), Times.Once());
    });

    it('should propagate errors from file system', async () => {
        const itemDefinition: IItemDefinition = {
            parts: [
                {
                    path: 'fail.txt',
                    payload: Buffer.from('fail').toString('base64'),
                    payloadType: PayloadType.InlineBase64,
                },
            ],
        };

        fileSystemMock.setup(fs => fs.createDirectory(It.IsAny())).returns(Promise.resolve());
        fileSystemMock.setup(fs => fs.writeFile(It.IsAny(), It.IsAny()))
            .throws(new Error('File system error'));

        await assert.rejects(
            () => writer.save(itemDefinition, destination),
            /File system error/
        );
    });

    it('should decode base64 payloads correctly', async () => {
        const content = 'Hello, VS Code!';
        const itemDefinition: IItemDefinition = {
            parts: [
                {
                    path: 'hello.txt',
                    payload: Buffer.from(content).toString('base64'),
                    payloadType: PayloadType.InlineBase64,
                },
            ],
        };

        let writtenBuffer: Uint8Array | undefined;
        fileSystemMock.setup(fs => fs.createDirectory(It.IsAny())).returns(Promise.resolve());
        fileSystemMock.setup(fs => fs.writeFile(It.IsAny(), It.IsAny()))
            .callback(({ args }) => {
                writtenBuffer = args[1];
                return Promise.resolve();
            });

        await writer.save(itemDefinition, destination);

        assert.ok(writtenBuffer, 'Buffer should be written');
        assert.strictEqual(writtenBuffer!.toString(), content, 'Decoded content should match original');
    });

    it('should not write files for unsupported payloadType', async () => {
        const itemDefinition: IItemDefinition = {
            parts: [
                {
                    path: 'unsupported.txt',
                    payload: 'somepayload',
                    payloadType: 999 as unknown as PayloadType, // Simulate unsupported type
                },
            ],
        };

        fileSystemMock.setup(fs => fs.createDirectory(It.IsAny())).returns(Promise.resolve());
        fileSystemMock.setup(fs => fs.writeFile(It.IsAny(), It.IsAny())).returns(Promise.resolve());

        await writer.save(itemDefinition, destination);

        // writeFile should not be called
        fileSystemMock.verify(fs => fs.writeFile(It.IsAny(), It.IsAny()), Times.Never());
    });

    it('should throw for illegal directory traversal in part path', async () => {
        const itemDefinition: IItemDefinition = {
            parts: [
                {
                    path: '../evil.txt',
                    payload: Buffer.from('malicious').toString('base64'),
                    payloadType: PayloadType.InlineBase64,
                },
            ],
        };

        fileSystemMock.setup(fs => fs.writeFile(It.IsAny(), It.IsAny())).returns(Promise.resolve());

        await assert.rejects(
            () => writer.save(itemDefinition, destination),
            /Unsafe file path/,
            'Should throw Unsafe file path error for traversal'
        );
    });

    it('should delegate to getItemDefinitionPathUri and handle its error', async () => {
        const stub = sinon.stub(pathUtils, 'getItemDefinitionPathUri');
        stub.throws(new Error('Stubbed path error'));

        const itemDefinition: IItemDefinition = {
            parts: [
                {
                    path: 'bad.txt',
                    payload: Buffer.from('bad').toString('base64'),
                    payloadType: PayloadType.InlineBase64,
                },
            ],
        };

        await assert.rejects(
            () => writer.save(itemDefinition, destination),
            /Stubbed path error/,
            'Should propagate error from getItemDefinitionPathUri'
        );

        sinon.assert.calledOnce(stub);
        stub.restore();
    });
});
