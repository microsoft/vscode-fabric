// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { DefinitionFilesChildNodeProvider } from '../../../src/workspace/treeNodes/childNodeProviders/DefinitionFilesChildNodeProvider';
import { IArtifactManager, IArtifact, IItemDefinition, PayloadType, IApiClientResponse } from '@microsoft/vscode-fabric-api';
import { DefinitionFileSystemProvider } from '../../../src/workspace/DefinitionFileSystemProvider';
import { IFabricFeatureConfiguration } from '../../../src/settings/FabricFeatureConfiguration';
import { DefinitionFileTreeNode } from '../../../src/workspace/treeNodes/DefinitionFileTreeNode';
import { DefinitionFolderTreeNode } from '../../../src/workspace/treeNodes/DefinitionFolderTreeNode';
import { DefinitionRootTreeNode } from '../../../src/workspace/treeNodes/DefinitionRootTreeNode';
import * as fabricItemUtilities from '../../../src/metadata/fabricItemUtilities';

describe('DefinitionFilesChildNodeProvider', function () {
    let contextMock: Mock<vscode.ExtensionContext>;
    let artifactManagerMock: Mock<IArtifactManager>;
    let fileSystemProviderMock: Mock<DefinitionFileSystemProvider>;
    let featureConfigMock: Mock<IFabricFeatureConfiguration>;
    let provider: DefinitionFilesChildNodeProvider;
    let getSupportsArtifactWithDefinitionStub: sinon.SinonStub;

    const workspaceId = 'workspace-123';
    const artifactId = 'artifact-456';
    let artifact: IArtifact;

    beforeEach(function () {
        contextMock = new Mock<vscode.ExtensionContext>();
        artifactManagerMock = new Mock<IArtifactManager>();
        fileSystemProviderMock = new Mock<DefinitionFileSystemProvider>();
        featureConfigMock = new Mock<IFabricFeatureConfiguration>();

        artifact = {
            id: artifactId,
            workspaceId: workspaceId,
            displayName: 'Test Report',
            type: 'Report',
            fabricEnvironment: 'Production',
        };

        // Stub the utility function
        getSupportsArtifactWithDefinitionStub = sinon.stub(fabricItemUtilities, 'getSupportsArtifactWithDefinition');

        provider = new DefinitionFilesChildNodeProvider(
            contextMock.object(),
            artifactManagerMock.object(),
            fileSystemProviderMock.object(),
            featureConfigMock.object()
        );
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('canProvideChildren', function () {
        it('should call getSupportsArtifactWithDefinition with the artifact', function () {
            getSupportsArtifactWithDefinitionStub.returns(true);

            provider.canProvideChildren(artifact);

            assert.ok(getSupportsArtifactWithDefinitionStub.calledOnce);
            assert.ok(getSupportsArtifactWithDefinitionStub.calledWith(artifact));
        });

        it('should return true when getSupportsArtifactWithDefinition returns true', function () {
            getSupportsArtifactWithDefinitionStub.returns(true);

            const result = provider.canProvideChildren(artifact);

            assert.strictEqual(result, true);
        });

        it('should return false when getSupportsArtifactWithDefinition returns false', function () {
            getSupportsArtifactWithDefinitionStub.returns(false);

            const result = provider.canProvideChildren(artifact);

            assert.strictEqual(result, false);
        });
    });

    describe('getChildNodes', function () {
        it('should return empty array when definition is not available', async function () {
            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({});

            artifactManagerMock.setup(x => x.getArtifactDefinition(artifact))
                .returns(Promise.resolve(responseMock.object()));

            const nodes = await provider.getChildNodes(artifact);

            assert.strictEqual(nodes.length, 0);
        });

        it('should return empty array when API call fails', async function () {
            artifactManagerMock.setup(x => x.getArtifactDefinition(artifact))
                .returns(Promise.reject(new Error('API Error')));

            const nodes = await provider.getChildNodes(artifact);

            assert.strictEqual(nodes.length, 0);
        });

        it('should skip .platform file', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: '.platform', payload: 'eyJwbGF0Zm9ybSI6IlBvd2VyQkkifQ==', payloadType: PayloadType.InlineBase64 },
                ],
            };

            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(artifact))
                .returns(Promise.resolve(responseMock.object()));

            const nodes = await provider.getChildNodes(artifact);

            // Should have root node but no children under it
            assert.strictEqual(nodes.length, 0);
        });

        it('should create a single file node for single file definition', async function () {
            const fileName = 'report.definition.pbir';
            const fileContent = Buffer.from('{"version":"1.0"}', 'utf-8').toString('base64');
            const editableUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/${fileName}`);

            const definition: IItemDefinition = {
                parts: [
                    { path: fileName, payload: fileContent, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(artifact))
                .returns(Promise.resolve(responseMock.object()));

            fileSystemProviderMock.setup(x => x.registerFile(
                artifact,
                fileName,
                It.IsAny()
            )).returns(editableUri);

            const nodes = await provider.getChildNodes(artifact);

            assert.strictEqual(nodes.length, 1);
            assert.ok(nodes[0] instanceof DefinitionRootTreeNode);

            const rootNode = nodes[0] as DefinitionRootTreeNode;
            const children = await rootNode.getChildNodes();
            assert.strictEqual(children.length, 1);
            assert.ok(children[0] instanceof DefinitionFileTreeNode);

            const fileNode = children[0] as DefinitionFileTreeNode;
            assert.strictEqual(fileNode.fileName, fileName);
        });

        it('should create folder structure for nested files', async function () {
            const file1 = 'folder1/file1.json';
            const file2 = 'folder1/file2.json';
            const fileContent = Buffer.from('{}', 'utf-8').toString('base64');

            const definition: IItemDefinition = {
                parts: [
                    { path: file1, payload: fileContent, payloadType: PayloadType.InlineBase64 },
                    { path: file2, payload: fileContent, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(artifact))
                .returns(Promise.resolve(responseMock.object()));

            fileSystemProviderMock.setup(x => x.registerFile(
                It.IsAny(),
                It.IsAny(),
                It.IsAny()
            )).returns(vscode.Uri.parse('fabric-definition:///test'));

            const nodes = await provider.getChildNodes(artifact);

            assert.strictEqual(nodes.length, 1);
            const rootNode = nodes[0] as DefinitionRootTreeNode;
            const children = await rootNode.getChildNodes();

            // Should have one folder
            assert.strictEqual(children.length, 1);
            assert.ok(children[0] instanceof DefinitionFolderTreeNode);

            const folder = children[0] as DefinitionFolderTreeNode;
            assert.strictEqual(folder.label, 'folder1');

            const folderChildren = await folder.getChildNodes();
            assert.strictEqual(folderChildren.length, 2);
            assert.ok(folderChildren[0] instanceof DefinitionFileTreeNode);
            assert.ok(folderChildren[1] instanceof DefinitionFileTreeNode);
        });

        it('should handle deeply nested folder structures', async function () {
            const file = 'folder1/folder2/folder3/deep.json';
            const fileContent = Buffer.from('{}', 'utf-8').toString('base64');

            const definition: IItemDefinition = {
                parts: [
                    { path: file, payload: fileContent, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(artifact))
                .returns(Promise.resolve(responseMock.object()));

            fileSystemProviderMock.setup(x => x.registerFile(
                It.IsAny(),
                It.IsAny(),
                It.IsAny()
            )).returns(vscode.Uri.parse('fabric-definition:///test'));

            const nodes = await provider.getChildNodes(artifact);

            assert.strictEqual(nodes.length, 1);
            const rootNode = nodes[0] as DefinitionRootTreeNode;
            let currentChildren = await rootNode.getChildNodes();

            // Navigate through folder hierarchy
            assert.strictEqual(currentChildren.length, 1);
            assert.ok(currentChildren[0] instanceof DefinitionFolderTreeNode);
            assert.strictEqual((currentChildren[0] as DefinitionFolderTreeNode).label, 'folder1');

            currentChildren = await (currentChildren[0] as DefinitionFolderTreeNode).getChildNodes();
            assert.strictEqual(currentChildren.length, 1);
            assert.ok(currentChildren[0] instanceof DefinitionFolderTreeNode);
            assert.strictEqual((currentChildren[0] as DefinitionFolderTreeNode).label, 'folder2');

            currentChildren = await (currentChildren[0] as DefinitionFolderTreeNode).getChildNodes();
            assert.strictEqual(currentChildren.length, 1);
            assert.ok(currentChildren[0] instanceof DefinitionFolderTreeNode);
            assert.strictEqual((currentChildren[0] as DefinitionFolderTreeNode).label, 'folder3');

            currentChildren = await (currentChildren[0] as DefinitionFolderTreeNode).getChildNodes();
            assert.strictEqual(currentChildren.length, 1);
            assert.ok(currentChildren[0] instanceof DefinitionFileTreeNode);
        });

        it('should sort folders before files', async function () {
            const fileContent = Buffer.from('{}', 'utf-8').toString('base64');

            const definition: IItemDefinition = {
                parts: [
                    { path: 'zebra.json', payload: fileContent, payloadType: PayloadType.InlineBase64 },
                    { path: 'folder1/file.json', payload: fileContent, payloadType: PayloadType.InlineBase64 },
                    { path: 'alpha.json', payload: fileContent, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(artifact))
                .returns(Promise.resolve(responseMock.object()));

            fileSystemProviderMock.setup(x => x.registerFile(
                It.IsAny(),
                It.IsAny(),
                It.IsAny()
            )).returns(vscode.Uri.parse('fabric-definition:///test'));

            const nodes = await provider.getChildNodes(artifact);

            const rootNode = nodes[0] as DefinitionRootTreeNode;
            const children = await rootNode.getChildNodes();

            assert.strictEqual(children.length, 3);

            // First should be folder
            assert.ok(children[0] instanceof DefinitionFolderTreeNode);
            assert.strictEqual((children[0] as DefinitionFolderTreeNode).label, 'folder1');

            // Then files in alphabetical order
            assert.ok(children[1] instanceof DefinitionFileTreeNode);
            assert.strictEqual((children[1] as DefinitionFileTreeNode).fileName, 'alpha.json');

            assert.ok(children[2] instanceof DefinitionFileTreeNode);
            assert.strictEqual((children[2] as DefinitionFileTreeNode).fileName, 'zebra.json');
        });

        it('should normalize backslash paths to forward slashes', async function () {
            const file = 'folder1\\subfolder\\file.json';
            const fileContent = Buffer.from('{}', 'utf-8').toString('base64');

            const definition: IItemDefinition = {
                parts: [
                    { path: file, payload: fileContent, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(artifact))
                .returns(Promise.resolve(responseMock.object()));

            fileSystemProviderMock.setup(x => x.registerFile(
                artifact,
                'folder1/subfolder/file.json', // Should normalize to forward slashes
                It.IsAny()
            )).returns(vscode.Uri.parse('fabric-definition:///test'));

            const nodes = await provider.getChildNodes(artifact);

            assert.strictEqual(nodes.length, 1);
            fileSystemProviderMock.verify(
                x => x.registerFile(artifact, 'folder1/subfolder/file.json', It.IsAny()),
                Times.Once()
            );
        });

        it('should register file with decoded base64 content', async function () {
            const fileName = 'test.json';
            const originalContent = '{"test":"value"}';
            const base64Content = Buffer.from(originalContent, 'utf-8').toString('base64');

            const definition: IItemDefinition = {
                parts: [
                    { path: fileName, payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(artifact))
                .returns(Promise.resolve(responseMock.object()));

            fileSystemProviderMock.setup(x => x.registerFile(
                artifact,
                fileName,
                It.Is<Uint8Array>(content => {
                    const decoded = Buffer.from(content).toString('utf-8');
                    return decoded === originalContent;
                })
            )).returns(vscode.Uri.parse('fabric-definition:///test'));

            await provider.getChildNodes(artifact);

            fileSystemProviderMock.verify(
                x => x.registerFile(artifact, fileName, It.IsAny()),
                Times.Once()
            );
        });

        it('should create both readonly and editable URIs for each file', async function () {
            const fileName = 'test.pbir';
            const fileContent = Buffer.from('{}', 'utf-8').toString('base64');
            const editableUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/${fileName}`);

            const definition: IItemDefinition = {
                parts: [
                    { path: fileName, payload: fileContent, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(artifact))
                .returns(Promise.resolve(responseMock.object()));

            fileSystemProviderMock.setup(x => x.registerFile(
                It.IsAny(),
                It.IsAny(),
                It.IsAny()
            )).returns(editableUri);

            const nodes = await provider.getChildNodes(artifact);

            const rootNode = nodes[0] as DefinitionRootTreeNode;
            const children = await rootNode.getChildNodes();
            const fileNode = children[0] as DefinitionFileTreeNode;

            // Check that both URIs are set
            assert.ok(fileNode.editableUri);
            assert.strictEqual(fileNode.editableUri.scheme, 'fabric-definition');

            assert.ok(fileNode.readonlyUri);
            assert.strictEqual(fileNode.readonlyUri.scheme, 'fabric-definition-virtual');
        });
    });
});
