import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { SqlEndpointTreeNode } from '../../../../internalSatellites/database/SqlEndpointTreeNode';
import { IArtifact, IFabricApiClient } from '@microsoft/vscode-fabric-api';
import { SqlEndpontGetConnectionStringResponse } from '../../../../internalSatellites/database/ApiResponseModels';

describe('SqlEndpointTreeNode', function () {
    let contextMock: Mock<vscode.ExtensionContext>;
    let artifact: IArtifact;
    let apiClientMock: Mock<IFabricApiClient>;
    let node: SqlEndpointTreeNode;
    let sandbox: sinon.SinonSandbox;

    before(function () {
        // No global setup needed
    });

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        contextMock = new Mock<vscode.ExtensionContext>();
        artifact = { id: 'endpoint1', workspaceId: 'ws1' } as IArtifact;
        apiClientMock = new Mock<IFabricApiClient>();
        node = new SqlEndpointTreeNode(contextMock.object(), artifact);
    });

    afterEach(function () {
        sandbox.restore();
    });

    after(function () {
        // No global teardown needed
    });

    it('getConnectionString should return the connection string from API response', async function () {
        // Arrange
        const fakeResponse: SqlEndpontGetConnectionStringResponse = {
            connectionString: 'Server=myserver;Database=mydb;',
        } as SqlEndpontGetConnectionStringResponse;
        sandbox.stub<any, any>(node, 'callApi').resolves(fakeResponse);

        // Act
        const result = await node.getConnectionString(apiClientMock.object());

        // Assert
        assert.equal(result, 'Server=myserver;Database=mydb;', 'Should return the correct connection string');
    });

    it('getExternalUri should construct the external URI from connection string', async function () {
        // Arrange
        sandbox.stub<any, any>(node, 'getConnectionString').resolves('Server=myserver;Database=mydb;');
        const constructExternalUriStub = sandbox.stub<any, any>(node, 'constructExternalUri').returns('https://external.uri');

        // Act
        const result = await node.getExternalUri(apiClientMock.object());

        // Assert
        assert.equal(result, 'https://external.uri', 'Should return the constructed external URI');
        assert(constructExternalUriStub.calledWith('Server=myserver;Database=mydb;'), 'constructExternalUri should be called with correct argument');
    });
});
