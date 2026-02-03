// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { MissingExtensionChildNodeProvider } from '../../../src/workspace/treeNodes/childNodeProviders/MissingExtensionChildNodeProvider';
import { IArtifact } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionManagerInternal } from '../../../src/apis/internal/fabricExtensionInternal';
import { InstallExtensionTreeNode } from '../../../src/workspace/treeNodes/InstallExtensionTreeNode';
import * as fabricItemUtilities from '../../../src/metadata/fabricItemUtilities';

describe('MissingExtensionChildNodeProvider', function () {
    let contextMock: Mock<vscode.ExtensionContext>;
    let extensionManagerMock: Mock<IFabricExtensionManagerInternal>;
    let provider: MissingExtensionChildNodeProvider;
    let getArtifactExtensionIdStub: sinon.SinonStub;

    const workspaceId = 'workspace-123';
    const artifactId = 'artifact-456';
    const testExtensionId = 'fabric.test-extension';
    let artifact: IArtifact;

    beforeEach(function () {
        contextMock = new Mock<vscode.ExtensionContext>();
        extensionManagerMock = new Mock<IFabricExtensionManagerInternal>();

        artifact = {
            id: artifactId,
            workspaceId: workspaceId,
            displayName: 'Test Artifact',
            type: 'TestType',
            fabricEnvironment: 'Production',
        };

        // Stub the utility function
        getArtifactExtensionIdStub = sinon.stub(fabricItemUtilities, 'getArtifactExtensionId');

        provider = new MissingExtensionChildNodeProvider(
            contextMock.object(),
            extensionManagerMock.object()
        );
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('canProvideChildren', function () {
        it('should return true when artifact has an associated extension', function () {
            getArtifactExtensionIdStub.returns(testExtensionId);

            const result = provider.canProvideChildren(artifact);

            assert.strictEqual(result, true);
            assert.ok(getArtifactExtensionIdStub.calledOnce);
            assert.ok(getArtifactExtensionIdStub.calledWith(artifact));
        });

        it('should return false when artifact has no associated extension', function () {
            getArtifactExtensionIdStub.returns(undefined);

            const result = provider.canProvideChildren(artifact);

            assert.strictEqual(result, false);
        });

        it('should return false when getArtifactExtensionId returns empty string', function () {
            getArtifactExtensionIdStub.returns('');

            const result = provider.canProvideChildren(artifact);

            assert.strictEqual(result, false);
        });
    });

    describe('getChildNodes', function () {
        it('should return empty array when artifact has no associated extension', async function () {
            getArtifactExtensionIdStub.returns(undefined);

            const nodes = await provider.getChildNodes(artifact);

            assert.strictEqual(nodes.length, 0);
        });

        it('should return InstallExtensionTreeNode when extension is not available', async function () {
            getArtifactExtensionIdStub.returns(testExtensionId);
            extensionManagerMock.setup(x => x.isAvailable(testExtensionId)).returns(false);

            const nodes = await provider.getChildNodes(artifact);

            assert.strictEqual(nodes.length, 1);
            assert.ok(nodes[0] instanceof InstallExtensionTreeNode);
            assert.strictEqual((nodes[0] as InstallExtensionTreeNode).extensionId, testExtensionId);
        });

        it('should return empty array when extension is available and already active', async function () {
            getArtifactExtensionIdStub.returns(testExtensionId);
            extensionManagerMock.setup(x => x.isAvailable(testExtensionId)).returns(true);
            extensionManagerMock.setup(x => x.isActive(testExtensionId)).returns(true);

            const nodes = await provider.getChildNodes(artifact);

            assert.strictEqual(nodes.length, 0);
        });

        it('should activate extension when available but not active', async function () {
            getArtifactExtensionIdStub.returns(testExtensionId);
            extensionManagerMock.setup(x => x.isAvailable(testExtensionId)).returns(true);

            // First call to isActive returns false (before activation)
            // Second call returns true (after activation)
            let isActiveCallCount = 0;
            extensionManagerMock.setup(x => x.isActive(testExtensionId)).callback(() => {
                isActiveCallCount++;
                return isActiveCallCount > 1;
            });

            extensionManagerMock.setup(x => x.activateExtension(testExtensionId)).returns(Promise.resolve({} as vscode.Extension<any>));

            const nodes = await provider.getChildNodes(artifact);

            assert.strictEqual(nodes.length, 0);
            extensionManagerMock.verify(x => x.activateExtension(testExtensionId));
        });

        it('should return InstallExtensionTreeNode when activation fails', async function () {
            getArtifactExtensionIdStub.returns(testExtensionId);
            extensionManagerMock.setup(x => x.isAvailable(testExtensionId)).returns(true);
            extensionManagerMock.setup(x => x.isActive(testExtensionId)).returns(false);
            extensionManagerMock.setup(x => x.activateExtension(testExtensionId)).returns(Promise.resolve(undefined));

            const nodes = await provider.getChildNodes(artifact);

            assert.strictEqual(nodes.length, 1);
            assert.ok(nodes[0] instanceof InstallExtensionTreeNode);
            assert.strictEqual((nodes[0] as InstallExtensionTreeNode).extensionId, testExtensionId);
        });

        it('should return empty array after successful activation', async function () {
            getArtifactExtensionIdStub.returns(testExtensionId);
            extensionManagerMock.setup(x => x.isAvailable(testExtensionId)).returns(true);

            // Track isActive calls - returns false first, then true after activation
            let activationComplete = false;
            extensionManagerMock.setup(x => x.isActive(testExtensionId)).callback(() => activationComplete);
            extensionManagerMock.setup(x => x.activateExtension(testExtensionId)).callback(() => {
                activationComplete = true;
                return Promise.resolve({} as vscode.Extension<any>);
            });

            const nodes = await provider.getChildNodes(artifact);

            assert.strictEqual(nodes.length, 0);
        });

        it('should handle different artifact types correctly', async function () {
            const notebookArtifact: IArtifact = {
                id: 'notebook-123',
                workspaceId: workspaceId,
                displayName: 'Test Notebook',
                type: 'Notebook',
                fabricEnvironment: 'Production',
            };

            const notebookExtensionId = 'fabric.notebook-extension';
            getArtifactExtensionIdStub.withArgs(notebookArtifact).returns(notebookExtensionId);
            extensionManagerMock.setup(x => x.isAvailable(notebookExtensionId)).returns(false);

            const nodes = await provider.getChildNodes(notebookArtifact);

            assert.strictEqual(nodes.length, 1);
            assert.ok(nodes[0] instanceof InstallExtensionTreeNode);
            assert.strictEqual((nodes[0] as InstallExtensionTreeNode).extensionId, notebookExtensionId);
        });

        it('should not call activateExtension when extension is not available', async function () {
            getArtifactExtensionIdStub.returns(testExtensionId);
            extensionManagerMock.setup(x => x.isAvailable(testExtensionId)).returns(false);

            await provider.getChildNodes(artifact);

            extensionManagerMock.verify(x => x.activateExtension(It.IsAny()), Times.Never());
        });

        it('should not call activateExtension when extension is already active', async function () {
            getArtifactExtensionIdStub.returns(testExtensionId);
            extensionManagerMock.setup(x => x.isAvailable(testExtensionId)).returns(true);
            extensionManagerMock.setup(x => x.isActive(testExtensionId)).returns(true);

            await provider.getChildNodes(artifact);

            extensionManagerMock.verify(x => x.activateExtension(It.IsAny()), Times.Never());
        });
    });
});

