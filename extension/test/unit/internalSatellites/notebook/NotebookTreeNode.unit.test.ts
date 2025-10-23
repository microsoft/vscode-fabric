// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';

import { Mock } from 'moq.ts';
import { NotebookTreeNode } from '../../../../src/internalSatellites/notebook/NotebookTreeNode';
import { IArtifact } from '@microsoft/vscode-fabric-api';

describe('NotebookTreeNode', function () {
    let contextMock: Mock<vscode.ExtensionContext>;
    let artifact: IArtifact;
    let node: NotebookTreeNode;

    before(function () {
        // No global setup needed
    });

    beforeEach(function () {
        contextMock = new Mock<vscode.ExtensionContext>();
        artifact = { id: 'notebook-123', workspaceId: 'ws1' } as IArtifact;
        node = new NotebookTreeNode(contextMock.object(), artifact);
    });

    afterEach(function () {
        // No teardown needed
    });

    after(function () {
        // No global teardown needed
    });

    it('getExternalUri should return the correct URI for the notebook', async function () {
        const expectedUri = `${vscode.env.uriScheme}://SynapseVSCode.synapse?workspaceId=ws1&artifactId=notebook-123`;

        // Act
        const result = await node.getExternalUri();

        // Assert
        assert.equal(result, expectedUri, 'Should return the correct external URI');
    });
});
