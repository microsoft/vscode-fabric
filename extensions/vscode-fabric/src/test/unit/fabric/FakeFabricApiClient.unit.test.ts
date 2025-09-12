import { expect } from 'chai';
import { Mock, It } from 'moq.ts';
import { FakeFabricApiClient } from '../../../fabric/FakeFabricApiClient';
import { IAccountProvider } from '../../../authentication/interfaces';
import { IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { TelemetryService } from '@microsoft/vscode-fabric-util';
import { ILogger } from '@microsoft/vscode-fabric-util';
import * as azApi from '@azure/core-rest-pipeline';
import { AbortError } from '@azure/abort-controller';

// Returns a strict mock object that throws on access to any unmocked member
function createStrictMock<T extends object>(mock: Mock<T>): T {
    const strictMock = new Proxy(mock.object() as object, {
        get(target, prop: string | symbol, receiver) {
            if (!(prop in target)) {
                throw new Error(`Access to unmocked member: ${String(prop)}`);
            }
            return Reflect.get(target, prop, receiver);
        },
    }) as T;
    return strictMock;
}

describe('FakeFabricApiClient', () => {
    let authMock: Mock<IAccountProvider>;
    let configMock: Mock<IConfigurationProvider>;
    let envProviderMock: Mock<IFabricEnvironmentProvider>;
    let telemetryMock: Mock<TelemetryService>;
    let loggerMock: Mock<ILogger>;
    let client: FakeFabricApiClient;

    beforeEach(() => {
        authMock = new Mock<IAccountProvider>();
        configMock = new Mock<IConfigurationProvider>();
        envProviderMock = new Mock<IFabricEnvironmentProvider>();
        telemetryMock = new Mock<TelemetryService>();
        loggerMock = new Mock<ILogger>();

        // Setup minimal mocks to avoid "access to unmocked member" errors
        loggerMock.setup(instance => instance.log(It.IsAny())).returns();
        loggerMock.setup(instance => instance.reportExceptionTelemetryAndLog(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny())).returns();
        envProviderMock.setup(x => x.getCurrent()).returns({ sharedUri: 'https://test.fabric', env: 'PROD' } as any);
        configMock.setup(x => x.get(It.IsAny<string>(), It.IsAny<any>())).returns((key: string, def: any) => def);
        telemetryMock.setup(x => x.sendTelemetryEvent(It.IsAny(), It.IsAny(), It.IsAny())).returns();

        client = new FakeFabricApiClient(
            createStrictMock(authMock),
            createStrictMock(configMock),
            createStrictMock(envProviderMock),
            createStrictMock(telemetryMock),
            createStrictMock(loggerMock)
        );
    });

    it('should intercept requests and return JSON response using respondWithJson', async () => {
        authMock.setup(x => x.getToken()).returnsAsync('test-token');

        const testResponse = { message: 'Hello from fake API', id: 123 };
        client.respondWithJson(200, testResponse);

        const result = await client.sendRequest({ pathTemplate: '/api/test' });

        expect(result.status).to.equal(200);
        expect(result.parsedBody).to.deep.equal(testResponse);
        expect(result.bodyAsText).to.equal(JSON.stringify(testResponse));
    });

    it('should intercept requests and return text response using respondWithText', async () => {
        authMock.setup(x => x.getToken()).returnsAsync('test-token');

        client.respondWithText(404, 'Not Found');

        const result = await client.sendRequest({ pathTemplate: '/api/missing' });

        expect(result.status).to.equal(404);
        expect(result.bodyAsText).to.equal('Not Found');
        expect(result.parsedBody).to.be.undefined; // Should not parse non-JSON
    });

    it('should allow custom request inspection using respondWith', async () => {
        authMock.setup(x => x.getToken()).returnsAsync('test-token');

        let capturedRequest: azApi.PipelineRequest | undefined;

        client.respondWith((request) => {
            capturedRequest = request;
            return {
                status: 200,
                headers: azApi.createHttpHeaders({ 'x-custom': 'response' }),
                bodyAsText: 'Custom response',
                request: request,
            };
        });

        await client.sendRequest({
            pathTemplate: '/api/custom',
            headers: { 'x-test-header': 'test-value' },
        });

        // Verify the request was captured and contains expected data
        expect(capturedRequest).to.not.be.undefined;
        expect(capturedRequest!.url).to.include('/api/custom');
        expect(capturedRequest!.headers.get('authorization')).to.equal('Bearer test-token');
        expect(capturedRequest!.headers.get('x-test-header')).to.equal('test-value');
    });

    it('should throw specified error using throwOnSend', async () => {
        authMock.setup(x => x.getToken()).returnsAsync('test-token');

        const testError = new AbortError('Connection timeout');
        client.throwOnSend(testError);

        const result = await client.sendRequest({ pathTemplate: '/api/timeout' });

        // FabricApiClient should catch AbortError and convert to 408 response
        expect(result.status).to.equal(408);
        expect(result.bodyAsText).to.contain('Timeout error');
    });

    it('should still process requests through base FabricApiClient logic', async () => {
        authMock.setup(x => x.getToken()).returnsAsync('my-auth-token');

        let receivedAuthHeader: string | undefined;

        client.respondWith((request) => {
            receivedAuthHeader = request.headers.get('authorization');
            return {
                status: 200,
                headers: azApi.createHttpHeaders({}),
                bodyAsText: '{}',
                request: request,
            };
        });

        await client.sendRequest({ pathTemplate: '/api/verify-auth' });

        // Verify that the base client's auth logic still runs
        expect(receivedAuthHeader).to.equal('Bearer my-auth-token');
    });

    it('should handle DELETE requests and remove decompression policy', async () => {
        authMock.setup(x => x.getToken()).returnsAsync('test-token');

        let requestMethod: string | undefined;

        client.respondWith((request) => {
            requestMethod = request.method;
            return {
                status: 204,
                headers: azApi.createHttpHeaders({}),
                bodyAsText: '',
                request: request,
            };
        });

        await client.sendRequest({
            pathTemplate: '/api/delete-test',
            method: 'DELETE',
        });

        // Verify DELETE request was processed
        expect(requestMethod).to.equal('DELETE');
        // Note: We can't directly verify removePolicy was called, but the request should succeed
        // which indicates the base client's DELETE handling logic ran
    });
});
