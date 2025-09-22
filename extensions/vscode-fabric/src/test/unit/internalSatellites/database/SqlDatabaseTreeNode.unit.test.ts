import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { SqlDatabaseTreeNode } from '../../../../internalSatellites/database/SqlDatabaseTreeNode';
import { IArtifact, IFabricApiClient, IApiClientRequestOptions, IApiClientResponse } from '@microsoft/vscode-fabric-api';
import { AbstractDatabaseTreeNode } from '../../../../internalSatellites/database/AbstractDatabaseTreeNode';
import { SqlDatabaseApiResponse } from '../../../../internalSatellites/database/ApiResponseModels';

describe('SqlDatabaseTreeNode', function () {
    let contextMock: Mock<vscode.ExtensionContext>;
    let artifact: IArtifact;
    let apiClientMock: Mock<IFabricApiClient>;
    let node: SqlDatabaseTreeNode;
    let sandbox: sinon.SinonSandbox;

    before(function () {
        // No global setup needed
    });

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        contextMock = new Mock<vscode.ExtensionContext>();
    artifact = { id: 'db1', workspaceId: 'ws1', displayName: 'My Database' } as IArtifact;
        apiClientMock = new Mock<IFabricApiClient>();
        node = new SqlDatabaseTreeNode(contextMock.object(), artifact);
    });

    afterEach(function () {
        sandbox.restore();
    });

    after(function () {
        // No global teardown needed
    });

    it('getConnectionString should return the connection string from API response', async function () {
        // Arrange
        const fakeResponse: SqlDatabaseApiResponse = {
            properties: {
                connectionString: 'Server=myserver;Database=mydb;',
                serverFqdn: 'myserver.database.windows.net',
                databaseName: 'mydb',
            },
        } as SqlDatabaseApiResponse;
        sandbox.stub<any, any>(node, 'callApi').resolves(fakeResponse);

        // Act
        const result = await node.getConnectionString(apiClientMock.object());

        // Assert
        assert.equal(result, 'Server=myserver;Database=mydb;', 'Should return the correct connection string');
    });

    it('getExternalUri should construct the external URI end-to-end from API response', async function () {
        // Arrange
        const fakeResponse: SqlDatabaseApiResponse = {
            properties: {
                connectionString: 'irrelevant',
                serverFqdn: 'myserver.database.windows.net,1433',
                databaseName: 'mydb',
            },
        } as SqlDatabaseApiResponse;
        sandbox.stub<any, any>(node, 'callApi').resolves(fakeResponse);

        // Act
        const result = await node.getExternalUri(apiClientMock.object());

        // Assert
        const expected = 'vscode://ms-mssql.mssql/connect?server=myserver.database.windows.net&authenticationType=AzureMFA&profileName=My Database (SQL Database)&database=mydb';
        assert.equal(result, expected, 'Should build external URI with stripped port, encoded profile name and database');
    });
});
