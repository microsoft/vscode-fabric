import * as vscode from 'vscode';
import { Mock, It, Times } from 'moq.ts';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { IApiClientResponse, IApiClientRequestOptions, IFabricApiClient } from '@microsoft/vscode-fabric-api';
import { FabricError } from '@microsoft/vscode-fabric-util';
import { CapacityManager, CapacityState, ICapacity } from '../../../CapacityManager';
import * as utilities from '../../../utilities';

describe('CapacityManager', function () {
    let apiClientMock: Mock<IFabricApiClient>;
    let formatErrorResponseStub: sinon.SinonStub;

    let capacityManager: CapacityManager;

    beforeEach(function () {
        apiClientMock = new Mock<IFabricApiClient>();
        formatErrorResponseStub = sinon.stub(utilities, 'formatErrorResponse').returns('Formatted error response');

        capacityManager = new CapacityManager(apiClientMock.object());
    });

    afterEach(function () {
        sinon.restore();
    });

    it('should list capacities successfully', async function () {
        // Arrange
        const capacities: ICapacity[] = [
            {
                id: '96f3f0ff-4fe2-4712-b61b-05a456ba9357',
                displayName: 'F4 Capacity',
                sku: 'F4',
                region: 'West Central US',
                state: 'Active',
            },
            {
                id: '0b9a4952-b5e7-4a55-8739-3e7251a2fd43',
                displayName: 'F8 Capacity',
                sku: 'F8',
                region: 'West Central US',
                state: 'Inactive',
            },
            {
                id: 'af196b7b-0bf8-4430-b383-ad48d14f4edf',
                displayName: 'F16 Capacity',
                sku: 'F16',
                region: 'West Central US',
                state: 'Active',
            },
        ];

        apiClientMock.setup(x => x.sendRequest(It.IsAny<IApiClientRequestOptions>()))
            .returns(Promise.resolve({ status: 200, parsedBody: { value: capacities } }));

        // Act
        const result = await act();

        // Assert
        assert.strictEqual(result.length, 3, 'Expected 3 capacities to be returned');
        assert.deepStrictEqual(result, capacities);
        apiClientMock.verify(x => x.sendRequest(It.IsAny<IApiClientRequestOptions>()), Times.Once());
        apiClientMock.verify(
            x => x.sendRequest(
                It.Is<IApiClientRequestOptions>(req =>
                    req.method === 'GET' &&
                    !!req.pathTemplate && req.pathTemplate.includes('v1/capacities')
                )
            ),
            Times.Once()
        );

        assert.ok(formatErrorResponseStub.notCalled, 'formatErrorResponse should not be called on success');
    });

    it('should list empty capacities', async function () {
        // Arrange
        apiClientMock.setup(x => x.sendRequest(It.IsAny<IApiClientRequestOptions>()))
            .returns(Promise.resolve({ status: 200, parsedBody: { value: [] } }));

        // Act
        const result = await act();

        // Assert
        assert.strictEqual(result.length, 0, 'Expected no capacities to be returned');
    });

    it('should throw an error when listing capacities fails', async function () {
        // Arrange
        const errorResponse: IApiClientResponse = {
            status: 500,
            parsedBody: { errorCode: 'InternalError', message: 'Internal server error' },
        };

        apiClientMock.setup(x => x.sendRequest(It.IsAny<IApiClientRequestOptions>()))
            .returns(Promise.resolve(errorResponse));

        // Act & Assert
        await assert.rejects(
            async () => {
                await act();
            },
            (err: Error) => {
                assert.ok(err instanceof FabricError, 'Should throw a FabricError');
                return true;
            }
        );

        // Assert
        assert.ok(formatErrorResponseStub.called, 'formatErrorResponse should be called on error');
        assert.strictEqual(formatErrorResponseStub.getCall(0).args[0], 'Unable to list capacities', 'Error message should match');
        assert.strictEqual(formatErrorResponseStub.getCall(0).args[1], errorResponse, 'Error response should match');
    });

    async function act(): Promise<ICapacity[]> {
        return capacityManager.listCapacities();
    }
});
