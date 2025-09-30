// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { Mock, It, Times } from 'moq.ts';
import { ItemDefinitionConflictDetector } from '../../../src/itemDefinition/ItemDefinitionConflictDetector';
import { IItemDefinition, PayloadType } from '@microsoft/vscode-fabric-api';

describe('ItemDefinitionConflictDetector', () => {
    let fileSystemMock: Mock<vscode.FileSystem>;
    let conflictDetector: ItemDefinitionConflictDetector;
    let destination: vscode.Uri;

    beforeEach(() => {
        fileSystemMock = new Mock<vscode.FileSystem>();
        conflictDetector = new ItemDefinitionConflictDetector(fileSystemMock.object());
        destination = vscode.Uri.file('/path/to/local/folder/');
    });

    it('returns all conflicts when all files exist and differ', async () => {
        // Arrange
        const itemDefinition: IItemDefinition = {
            parts: [
                {
                    path: 'file1.txt',
                    payload: Buffer.from('abc').toString('base64'),
                    payloadType: PayloadType.InlineBase64,
                },
                {
                    path: 'file2.txt',
                    payload: Buffer.from('def').toString('base64'),
                    payloadType: PayloadType.InlineBase64,
                },
            ],
        };
        fileSystemMock
            .setup(fs => fs.stat(It.IsAny()))
            .returns(Promise.resolve({ type: vscode.FileType.File } as vscode.FileStat));
        fileSystemMock
            .setup(fs => fs.readFile(It.Is<vscode.Uri>(uri => uri.fsPath.endsWith('file1.txt'))))
            .returns(Promise.resolve(Buffer.from('123')));
        fileSystemMock
            .setup(fs => fs.readFile(It.Is<vscode.Uri>(uri => uri.fsPath.endsWith('file2.txt'))))
            .returns(Promise.resolve(Buffer.from('456')));

        // Act
        const result = await conflictDetector.getConflictingFiles(itemDefinition, destination);

        // Assert
        assert.deepStrictEqual(result, ['file1.txt', 'file2.txt']);
    });

    it('returns only existing files with different content as conflicts', async () => {
        // Arrange
        const itemDefinition: IItemDefinition = {
            parts: [
                {
                    path: 'file1.txt',
                    payload: Buffer.from('abc').toString('base64'),
                    payloadType: PayloadType.InlineBase64,
                },
                {
                    path: 'file2.txt',
                    payload: Buffer.from('def').toString('base64'),
                    payloadType: PayloadType.InlineBase64,
                },
            ],
        };
        fileSystemMock
            .setup(fs => fs.stat(It.IsAny()))
            .returns(Promise.resolve({ type: vscode.FileType.File } as vscode.FileStat));
        fileSystemMock
            .setup(fs => fs.readFile(It.Is<vscode.Uri>(uri => uri.fsPath.endsWith('file1.txt'))))
            .returns(Promise.resolve(Buffer.from('abc')));
        fileSystemMock
            .setup(fs => fs.readFile(It.Is<vscode.Uri>(uri => uri.fsPath.endsWith('file2.txt'))))
            .returns(Promise.resolve(Buffer.from('DIFFERENT')));

        // Act
        const result = await conflictDetector.getConflictingFiles(itemDefinition, destination);

        // Assert
        assert.deepStrictEqual(result, ['file2.txt']);
    });

    it('returns empty array if no files exist', async () => {
        // Arrange
        const itemDefinition: IItemDefinition = {
            parts: [
                {
                    path: 'file1.txt',
                    payload: Buffer.from('abc').toString('base64'),
                    payloadType: PayloadType.InlineBase64,
                },
            ],
        };

        fileSystemMock.setup(fs => fs.stat(It.IsAny())).throws(new Error('Not found'));

        // Act
        const result = await conflictDetector.getConflictingFiles(itemDefinition, destination);

        // Assert
        assert.deepStrictEqual(result, []);
    });

    it('handles empty or missing parts gracefully', async () => {
        assert.deepStrictEqual(await conflictDetector.getConflictingFiles({ parts: [] }, destination), []);
        assert.deepStrictEqual(await conflictDetector.getConflictingFiles({} as any, destination), []);
        assert.deepStrictEqual(await conflictDetector.getConflictingFiles(undefined as any, destination), []);
    });

    it('ignores invalid file paths', async () => {
        // Arrange
        const itemDefinition: IItemDefinition = {
            parts: [
                {
                    path: '../evil.txt',
                    payload: Buffer.from('abc').toString('base64'),
                    payloadType: PayloadType.InlineBase64,
                },
            ],
        };
        fileSystemMock
            .setup(fs => fs.stat(It.IsAny()))
            .returns(Promise.resolve({ type: vscode.FileType.File } as vscode.FileStat));
        fileSystemMock
            .setup(fs => fs.readFile(It.IsAny()))
            .returns(Promise.resolve(Buffer.from('DIFFERENT')));

        // Act
        const result = await conflictDetector.getConflictingFiles(itemDefinition, destination);

        // Assert
        assert.deepStrictEqual(result, []);
        fileSystemMock.verify(fs => fs.stat(It.IsAny() as any), Times.Never());
        fileSystemMock.verify(fs => fs.readFile(It.IsAny() as any), Times.Never());
    });

    it('does not match files with same name in different directories', async () => {
        // Arrange
        const itemDefinition: IItemDefinition = {
            parts: [
                { path: 'file.txt', payload: Buffer.from('abc').toString('base64'), payloadType: PayloadType.InlineBase64 },
                { path: 'childDir/file.txt', payload: Buffer.from('def').toString('base64'), payloadType: PayloadType.InlineBase64 },
            ],
        };
        // Only 'file.txt' exists and differs, 'childDir/file.txt' does not exist
        fileSystemMock
            .setup(fs => fs.stat(It.Is<vscode.Uri>(uri => uri.path.endsWith('/file.txt'))))
            .returns(Promise.resolve({ type: vscode.FileType.File } as vscode.FileStat));
        fileSystemMock
            .setup(fs => fs.readFile(It.Is<vscode.Uri>(uri => uri.path.endsWith('/file.txt'))))
            .returns(Promise.resolve(Buffer.from('DIFFERENT')));
        fileSystemMock
            .setup(fs => fs.stat(It.Is<vscode.Uri>(uri => uri.path.endsWith('/childDir/file.txt'))))
            .throws(new Error('Not found'));

        // Act

        const result = await conflictDetector.getConflictingFiles(itemDefinition, destination);
        // Assert
        assert.deepStrictEqual(result, ['file.txt']);
    });

    it('does not report conflict if file exists and content is identical', async () => {
        // Arrange
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
        fileSystemMock
            .setup(fs => fs.stat(It.IsAny()))
            .returns(Promise.resolve({ type: vscode.FileType.File } as vscode.FileStat));
        fileSystemMock
            .setup(fs => fs.readFile(It.IsAny()))
            .returns(Promise.resolve(Buffer.from(content)));

        // Act
        const result = await conflictDetector.getConflictingFiles(itemDefinition, destination);

        // Assert
        assert.deepStrictEqual(result, []);
    });

    it('ignores parts with missing path', async () => {
        // Arrange
        const itemDefinition: IItemDefinition = {
            parts: [
                {
                    payload: Buffer.from('abc').toString('base64'),
                    payloadType: PayloadType.InlineBase64,
                } as any,
            ],
        };

        // Act
        const result = await conflictDetector.getConflictingFiles(itemDefinition, destination);

        // Assert
        assert.deepStrictEqual(result, []);
    });

    it('ignores parts with unsupported payloadType', async () => {
        // Arrange
        const itemDefinition: IItemDefinition = {
            parts: [
                {
                    path: 'unsupported.txt',
                    payload: 'abc',
                    payloadType: 999 as unknown as PayloadType,
                },
            ],
        };

        // Act
        const result = await conflictDetector.getConflictingFiles(itemDefinition, destination);

        // Assert
        assert.deepStrictEqual(result, []);
    });

    it('handles file system errors gracefully', async () => {
        // Arrange
        const itemDefinition: IItemDefinition = {
            parts: [
                {
                    path: 'file.txt',
                    payload: Buffer.from('abc').toString('base64'),
                    payloadType: PayloadType.InlineBase64,
                },
            ],
        };
        fileSystemMock
            .setup(fs => fs.stat(It.IsAny()))
            .throws(new Error('Some FS error'));

        // Act
        const result = await conflictDetector.getConflictingFiles(itemDefinition, destination);

        // Assert
        assert.deepStrictEqual(result, []);
    });
});
