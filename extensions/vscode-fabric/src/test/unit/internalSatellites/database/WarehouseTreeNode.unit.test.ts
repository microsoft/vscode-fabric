import { Mock } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { WarehouseTreeNode } from '../../../../internalSatellites/database/WarehouseTreeNode';
import { IArtifact, IFabricApiClient } from '@microsoft/vscode-fabric-api';
import { SqlDatabaseApiResponse } from '../../../../internalSatellites/database/ApiResponseModels';

describe('WarehouseTreeNode', function () {
    let contextMock: Mock<vscode.ExtensionContext>;
    let artifact: IArtifact;
    let apiClientMock: Mock<IFabricApiClient>;
    let node: WarehouseTreeNode;
    let sandbox: sinon.SinonSandbox;

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        contextMock = new Mock<vscode.ExtensionContext>();
        artifact = { id: 'wh1', workspaceId: 'ws1' } as IArtifact;
        apiClientMock = new Mock<IFabricApiClient>();
        node = new WarehouseTreeNode(contextMock.object(), artifact);
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('getConnectionString should return the connection string from API response', async function () {
        const fakeResponse: SqlDatabaseApiResponse = {
            properties: {
                connectionString: 'Server=whServer;Database=whDb;',
                serverFqdn: 'whServer.database.windows.net',
                databaseName: 'whDb',
            },
        } as SqlDatabaseApiResponse;
        sandbox.stub<any, any>(node, 'callApi').resolves(fakeResponse);

        const result = await node.getConnectionString(apiClientMock.object());
        assert.equal(result, 'Server=whServer;Database=whDb;');
    });

    it('getExternalUri should construct the external URI from API response', async function () {
        const fakeResponse: SqlDatabaseApiResponse = {
            properties: {
                connectionString: 'ignored',
                serverFqdn: 'whServer.database.windows.net,1433',
                databaseName: 'whDb',
            },
        } as SqlDatabaseApiResponse;
        sandbox.stub<any, any>(node, 'callApi').resolves(fakeResponse);
        const constructExternalUriStub = sandbox.stub<any, any>(node, 'constructExternalUri').returns('vscode://ms-mssql.mssql/connect?server=whServer.database.windows.net&authenticationType=AzureMFA&database=whDb');

        const result = await node.getExternalUri(apiClientMock.object());
        assert.equal(result, 'vscode://ms-mssql.mssql/connect?server=whServer.database.windows.net&authenticationType=AzureMFA&database=whDb');
        assert(constructExternalUriStub.calledWith('whServer.database.windows.net', 'whDb'));
    });
});
