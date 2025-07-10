import { Mock } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import { AbstractDatabaseTreeNode, SqlArtifactType } from '../../../../internalSatellites/database/AbstractDatabaseTreeNode';
import { IApiClientResponse, IArtifact, IFabricApiClient } from '@fabric/vscode-fabric-api';
import { FabricError } from '@fabric/vscode-fabric-util';

describe('AbstractDatabaseTreeNode (protected methods)', function() {
    class TestDatabaseTreeNode extends AbstractDatabaseTreeNode {
        protected artifactType: SqlArtifactType = 'SQLDatabase';
        public getConnectionString(apiClient: IFabricApiClient): Promise<string> {
            throw new Error('Not implemented');
        }
        public getExternalUri(apiClient: IFabricApiClient): Promise<string> {
            throw new Error('Not implemented');
        }
        public callValidateResponse(response: IApiClientResponse) {
            return this.validateResponse(response);
        }
        public callConstructExternalUri(serverName: string, databaseName?: string) {
            return this.constructExternalUri(serverName, databaseName);
        }
    }

    let contextMock: Mock<vscode.ExtensionContext>;
    let artifact: IArtifact;
    let node: TestDatabaseTreeNode;

    beforeEach(function() {
        contextMock = new Mock<vscode.ExtensionContext>();
        artifact = { id: 'db-1' } as IArtifact;
        node = new TestDatabaseTreeNode(contextMock.object(), artifact);
    });

    it('validateResponse should not throw for status 200', function() {
        // Arrange
        const response: IApiClientResponse = {
            status: 200,
            parsedBody: {},
        } as IApiClientResponse;
        // Act & Assert
        assert.doesNotThrow(() => node.callValidateResponse(response));
    });

    it('validateResponse should throw FabricError for non-200 status', function() {
        // Arrange
        const response: IApiClientResponse = {
            status: 500,
            parsedBody: { errorCode: 'ERR', message: 'Something went wrong' },
        } as IApiClientResponse;
        // Act & Assert
        assert.throws(
            () => node.callValidateResponse(response),
            (err: any) => err instanceof FabricError && err.message.includes('API call failed'),
            'Should throw FabricError for non-200 status'
        );
    });

    it('constructExternalUri should return correct URI without databaseName', function() {
        // Arrange
        const serverName = 'myserver.database.windows.net';
        const expected = `${vscode.env.uriScheme}://ms-mssql.mssql/connect?server=${serverName}&authenticationType=AzureMFA`;
        // Act
        const result = node.callConstructExternalUri(serverName);
        // Assert
        assert.equal(result, expected, 'Should return correct URI without databaseName');
    });

    it('constructExternalUri should return correct URI with databaseName', function() {
        // Arrange
        const serverName = 'myserver.database.windows.net';
        const databaseName = 'mydb';
        const expected = `${vscode.env.uriScheme}://ms-mssql.mssql/connect?server=${serverName}&authenticationType=AzureMFA&database=${databaseName}`;
        // Act
        const result = node.callConstructExternalUri(serverName, databaseName);
        // Assert
        assert.equal(result, expected, 'Should return correct URI with databaseName');
    });
});
