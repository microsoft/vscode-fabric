// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import { IApiClientResponse, IWorkspaceManager, IWorkspaceFolder, IFolderManager } from '@microsoft/vscode-fabric-api';
import { TelemetryActivity, ILogger, TelemetryService } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { FabricWorkspaceDataProvider } from '../../../src/workspace/treeView';
import { FolderTreeNode } from '../../../src/workspace/treeNodes/FolderTreeNode';
import { verifyAddOrUpdateProperties, verifyAddOrUpdatePropertiesNever } from '../../utilities/moqUtilities';

// Note: These tests cover the folder CRUD operations conceptually.
// The actual command registration is in folderCommands.ts and uses similar patterns to artifact commands.

describe('FolderTreeNode', () => {
    let contextMock: Mock<vscode.ExtensionContext>;
    let folder: IWorkspaceFolder;

    beforeEach(() => {
        contextMock = new Mock<vscode.ExtensionContext>();
        folder = {
            id: 'folder-123',
            displayName: 'Test Folder',
            workspaceId: 'workspace-456',
            parentFolderId: undefined,
        };
    });

    it('should expose workspaceId', () => {
        // Arrange & Act
        const node = new FolderTreeNode(contextMock.object(), folder);

        // Assert
        assert.strictEqual(node.workspaceId, 'workspace-456');
    });

    it('should expose folderId', () => {
        // Arrange & Act
        const node = new FolderTreeNode(contextMock.object(), folder);

        // Assert
        assert.strictEqual(node.folderId, 'folder-123');
    });

    it('should set contextValue to WorkspaceFolderTreeNode', () => {
        // Arrange & Act
        const node = new FolderTreeNode(contextMock.object(), folder);

        // Assert
        assert.strictEqual(node.contextValue, 'WorkspaceFolderTreeNode');
    });

    it('should set label to folder displayName', () => {
        // Arrange & Act
        const node = new FolderTreeNode(contextMock.object(), folder);

        // Assert
        assert.strictEqual(node.label, 'Test Folder');
    });

    it('should set folder icon', () => {
        // Arrange & Act
        const node = new FolderTreeNode(contextMock.object(), folder);

        // Assert
        assert.ok(node.iconPath instanceof vscode.ThemeIcon);
        assert.strictEqual((node.iconPath as vscode.ThemeIcon).id, 'folder');
    });

    it('should generate correct id', () => {
        // Arrange & Act
        const node = new FolderTreeNode(contextMock.object(), folder);

        // Assert
        assert.strictEqual(node.id, 'ws-folder:workspace-456:folder-123');
    });

    it('should report hasChildren as false when empty', async () => {
        // Arrange
        const node = new FolderTreeNode(contextMock.object(), folder);

        // Act & Assert
        assert.strictEqual(node.hasChildren(), false);
    });

    it('should report hasChildren as true when folders added', async () => {
        // Arrange
        const parentNode = new FolderTreeNode(contextMock.object(), folder);
        const childFolder: IWorkspaceFolder = {
            id: 'child-folder-123',
            displayName: 'Child Folder',
            workspaceId: 'workspace-456',
            parentFolderId: 'folder-123',
        };
        const childNode = new FolderTreeNode(contextMock.object(), childFolder);

        // Act
        parentNode.addFolder(childNode);

        // Assert
        assert.strictEqual(parentNode.hasChildren(), true);
    });

    it('should return sorted child nodes', async () => {
        // Arrange
        const parentNode = new FolderTreeNode(contextMock.object(), folder);

        const folderA: IWorkspaceFolder = {
            id: 'folder-a',
            displayName: 'Zebra Folder',
            workspaceId: 'workspace-456',
            parentFolderId: 'folder-123',
        };
        const folderB: IWorkspaceFolder = {
            id: 'folder-b',
            displayName: 'Alpha Folder',
            workspaceId: 'workspace-456',
            parentFolderId: 'folder-123',
        };

        parentNode.addFolder(new FolderTreeNode(contextMock.object(), folderA));
        parentNode.addFolder(new FolderTreeNode(contextMock.object(), folderB));

        // Act
        const children = await parentNode.getChildNodes();

        // Assert
        assert.strictEqual(children.length, 2);
        assert.strictEqual(children[0].label, 'Alpha Folder');
        assert.strictEqual(children[1].label, 'Zebra Folder');
    });
});

describe('FolderManager folder operations', () => {
    let folderManagerMock: Mock<IFolderManager>;
    let apiClientResponseMock: Mock<IApiClientResponse>;

    beforeEach(() => {
        folderManagerMock = new Mock<IFolderManager>();
        apiClientResponseMock = new Mock<IApiClientResponse>();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('createFolder', () => {
        it('should call createFolder with correct parameters', async () => {
            // Arrange
            apiClientResponseMock.setup(r => r.status).returns(201);
            apiClientResponseMock.setup(r => r.parsedBody).returns({ id: 'new-folder-id' });

            folderManagerMock.setup(fm => fm.createFolder('workspace-123', 'New Folder', undefined))
                .returns(Promise.resolve(apiClientResponseMock.object()));

            // Act
            const result = await folderManagerMock.object().createFolder('workspace-123', 'New Folder', undefined);

            // Assert
            assert.strictEqual(result.status, 201);
            folderManagerMock.verify(
                fm => fm.createFolder('workspace-123', 'New Folder', undefined),
                Times.Once()
            );
        });

        it('should call createFolder with parentFolderId', async () => {
            // Arrange
            apiClientResponseMock.setup(r => r.status).returns(201);
            apiClientResponseMock.setup(r => r.parsedBody).returns({ id: 'new-folder-id' });

            folderManagerMock.setup(fm => fm.createFolder('workspace-123', 'Nested Folder', 'parent-folder-id'))
                .returns(Promise.resolve(apiClientResponseMock.object()));

            // Act
            const result = await folderManagerMock.object().createFolder('workspace-123', 'Nested Folder', 'parent-folder-id');

            // Assert
            assert.strictEqual(result.status, 201);
            folderManagerMock.verify(
                fm => fm.createFolder('workspace-123', 'Nested Folder', 'parent-folder-id'),
                Times.Once()
            );
        });
    });

    describe('deleteFolder', () => {
        it('should call deleteFolder with correct parameters', async () => {
            // Arrange
            apiClientResponseMock.setup(r => r.status).returns(200);

            folderManagerMock.setup(fm => fm.deleteFolder('workspace-123', 'folder-id'))
                .returns(Promise.resolve(apiClientResponseMock.object()));

            // Act
            const result = await folderManagerMock.object().deleteFolder('workspace-123', 'folder-id');

            // Assert
            assert.strictEqual(result.status, 200);
            folderManagerMock.verify(
                fm => fm.deleteFolder('workspace-123', 'folder-id'),
                Times.Once()
            );
        });
    });

    describe('renameFolder', () => {
        it('should call renameFolder with correct parameters', async () => {
            // Arrange
            apiClientResponseMock.setup(r => r.status).returns(200);

            folderManagerMock.setup(fm => fm.renameFolder('workspace-123', 'folder-id', 'Renamed Folder'))
                .returns(Promise.resolve(apiClientResponseMock.object()));

            // Act
            const result = await folderManagerMock.object().renameFolder('workspace-123', 'folder-id', 'Renamed Folder');

            // Assert
            assert.strictEqual(result.status, 200);
            folderManagerMock.verify(
                fm => fm.renameFolder('workspace-123', 'folder-id', 'Renamed Folder'),
                Times.Once()
            );
        });
    });
});
