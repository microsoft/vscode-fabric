// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import { Mock, It } from 'moq.ts';
import { FabricApiClient } from '../../../src/fabric/FabricApiClient';
import { IAccountProvider } from '../../../src/authentication/interfaces';
import { IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { TelemetryService } from '@microsoft/vscode-fabric-util';
import { ILogger } from '@microsoft/vscode-fabric-util';
import { IApiClientRequestOptions } from '@microsoft/vscode-fabric-api';
import * as azApi from '@azure/core-rest-pipeline';
import { AbortError } from '@azure/abort-controller';

use(chaiAsPromised); //  chaiAsPromised is imported and then registered with Chai using use(chaiAsPromised);. This enables promise-aware assertions like expect(promise).to.eventually.equal(value) or expect(promise).to.be.rejectedWith(Error), improving the clarity and maintainability of your asynchronous tests.

// Returns a strict mock object that throws on access to any unmocked member
/*
Reasons to want a strict mock from me:
1. When I unit test a class, strict mocks help me to ensure that the class under test only interacts with its dependencies in the ways that I have explicitly defined in the test setup.
This helps me to catch unintended interactions or dependencies that might be introduced by changes to the class or its dependencies.
The members of the dependencies that are used are explicitly defined in the mock setup, so I can be confident that the test is only testing the intended interactions.
2. Some methods might have optional parameters or default values that are not explicitly set in the mock.
For example, I might mock ILogger.Log with 3 params, but the one with 1 param is not mocked, the test succeeds, but the log output doesn't correlate, and I don't understand what's happening.
Strict mock helps me to catch cases where the class under test relies on these defaults, which might change in the future.
3. A test might pass solely because an unmocked method returns undefined or a default value, even though the real implementation would behave differently. Strict mocks ensure that my tests only pass if all interactions with dependencies are intentional and explicitly defined.
4. A test might fail because the class under test is using a new method or property on a dependency that was not explicitly set up in the mock. Finding what is missing can be difficult: requires debugging.
5. I can write tests iteratively, with initially minimal mocking,  run the test and exmamine the output to understand what needs to be mocked WITHOUT having to debug the test.

<from copilot:>
Using a strict mock—such as the one implemented with createStrictMock in your test code—offers several important benefits, especially in a large, interface-driven codebase like the Fabric extensions for VS Code:

Early Detection of Test Gaps
A strict mock throws an error whenever your code under test tries to access a property or method that you have not explicitly set up in your mock. This immediately exposes missing or incomplete test setups, helping you catch untested code paths or accidental dependencies on unmocked members.

Prevents False Positives
Without strict mocks, a test might pass simply because an unmocked method returns undefined or a default value, even though the real implementation would behave differently. Strict mocks ensure that your tests only pass if all interactions with dependencies are intentional and explicitly defined.

Improved Refactoring Safety
When you refactor code, strict mocks help you identify where interface changes break tests. If you add, remove, or rename members on an interface, any test that relies on the old contract will fail fast, making it easier to update tests in sync with your code.

Clearer, More Maintainable Tests
By requiring explicit setup for every dependency interaction, strict mocks make your tests more readable and maintainable. Anyone reading the test can see exactly which methods and properties are expected to be used, reducing ambiguity.

Encourages Good Design
Strict mocking encourages you to keep your interfaces small and focused, since every dependency must be accounted for in your tests. This can lead to better separation of concerns and more modular code.

Reduces Accidental Coupling
If your code accidentally starts using a new method or property on a dependency, a strict mock will immediately throw an error, alerting you to the unintended coupling. This helps keep your codebase clean and your abstractions well-defined.

In summary, strict mocks make your tests more robust, reliable, and maintainable by enforcing explicitness and catching unintended interactions early in the development process.

does moq.ts have a strict mode?

GitHub Copilot
No, moq.ts does not have a built-in "strict mode" like some other mocking libraries (such as Moq for .NET or Jest's jest.mock().mockImplementationOnce). In moq.ts, by default, accessing or calling a member that has not been explicitly set up will return undefined (for properties) or a no-op function (for methods), and will not throw an error.

If you want strict behavior—where any access to an unmocked member throws an error—you need to implement it yourself. This is commonly done by wrapping the mock object with a Proxy, as shown in your createStrictMock function. This approach enforces strictness by intercepting property access and throwing an error if the property was not set up on the mock.

Summary:

moq.ts does not have a built-in strict mode.
You can achieve strict behavior by wrapping your mock with a Proxy that throws on unmocked member access, as you have done in your code.

</from copilot:>

it would be great to set a global Strict mode on moq.ts, so that all mocks are strict by default.

 */
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

describe('FabricApiClient', () => {
    let authMock: Mock<IAccountProvider>;
    let configMock: Mock<IConfigurationProvider>;
    let envProviderMock: Mock<IFabricEnvironmentProvider>;
    let telemetryMock: Mock<TelemetryService>;
    let loggerMock: Mock<ILogger>;
    let client: FabricApiClient;
    let pipelineMock: any;
    let logger: ILogger;
    let errorMessageLogged: string | undefined;

    beforeEach(() => {
        loggerMock = new Mock<ILogger>();
        loggerMock.setup(instance => instance.log(It.IsAny())).callback((interaction) => {
            const message = interaction.args[0];
            console.log(message);
        });
        loggerMock.setup(instance => instance.reportExceptionTelemetryAndLog(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny())).callback((interaction) => {
            const methodName = interaction.args[0];
            const eventName = interaction.args[1];
            const error = interaction.args[2]  as Error;
            logger.log('Error logged:' + error.message);
            errorMessageLogged = error.message;
        });
        errorMessageLogged = undefined;

        logger = createStrictMock(loggerMock);
        logger.log('test');
        authMock = new Mock<IAccountProvider>();
        configMock = new Mock<IConfigurationProvider>();
        envProviderMock = new Mock<IFabricEnvironmentProvider>();
        telemetryMock = new Mock<TelemetryService>();
        // telemetryMock.setup(x => x.sendTelemetryErrorEvent(It.IsAny(), It.IsAny(), It.IsAny())).callback((interaction) => {
        //     const message = interaction.args[0];
        //     console.log(message);
        // });
        // telemetryMock.setup(x => x.sendTelemetryEvent(It.IsAny(), It.IsAny())).callback((interaction) => {
        //     const message = interaction.args[0];
        //     console.log(message);
        // });
        telemetryMock.setup(x => x.sendTelemetryEvent(It.IsAny(), It.IsAny(), It.IsAny())).callback((interaction) => {
            const message = interaction.args[0];
            console.log(message);
        });
        envProviderMock.setup(x => x.getCurrent()).returns({ sharedUri: 'https://test.fabric', env: 'PROD' } as any);
        configMock.setup(x => x.get(It.IsAny<string>(), It.IsAny<any>())).returns((key: string, def: any) => def);
        pipelineMock = {
            sendRequest: async () => {
                throw new Error('Not implemented');
            },
            removePolicy: () => { },
        };
        client = new FabricApiClient(
            createStrictMock(authMock),
            createStrictMock(configMock),
            createStrictMock(envProviderMock),
            createStrictMock(telemetryMock),
            createStrictMock(loggerMock),
            () => pipelineMock
        );
    });

    afterEach(() => {
        // nothing to restore
    });

    it('should send request with valid token', async () => {
        authMock.setup(x => x.getToken()).returnsAsync('abc123');
        const fakeResponse = {
            status: 200,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: azApi.createHttpHeaders({ 'Content-Type': 'application/json' }),
            bodyAsText: '{"ok":true}',
            request: {},
            get: () => undefined,
        } as any;
        pipelineMock.sendRequest = async () => fakeResponse;
        const result = await client.sendRequest({ pathTemplate: '/foo' });
        expect(result.status).to.equal(200);
        expect(result.parsedBody).to.deep.equal({ ok: true });
    });

    it('should throw if not signed in', async () => {
        authMock.setup(x => x.getToken()).returnsAsync(null);
        await expect(client.sendRequest({ pathTemplate: '/foo' })).to.be.rejectedWith('Not signed in');
    });

    it('should handle AbortError as timeout', async () => {
        authMock.setup(x => x.getToken()).returnsAsync('abc123');
        pipelineMock.sendRequest = async () => {
            throw new AbortError('timeout');
        };
        const result = await client.sendRequest({ pathTemplate: '/foo' });
        expect(result.status).to.equal(408);
        expect(result.bodyAsText).to.contain('Timeout error');
    });

    it('should not parse non-JSON body', async () => {
        authMock.setup(x => x.getToken()).returnsAsync('abc123');
        const fakeResponse = {
            status: 200,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: azApi.createHttpHeaders({ 'Content-Type': 'text/plain' }),
            bodyAsText: 'plain text',
            request: {},
            get: () => undefined,
        } as any;
        pipelineMock.sendRequest = async () => fakeResponse;
        const result = await client.sendRequest({ pathTemplate: '/foo' });
        expect(result.bodyAsText).to.equal('plain text');
        expect(result.parsedBody).to.be.undefined;
    });

    it('should send bodyAsText to TelemetryActivity on HTTP failure', async () => {
        authMock.setup(x => x.getToken()).returnsAsync('abc123');
        const fakeResponse = {
            status: 500,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: azApi.createHttpHeaders({ 'Content-Type': 'application/json' }),
            bodyAsText: '{"error":"fail"}',
            request: {},
            get: () => undefined,
        } as any;
        pipelineMock.sendRequest = async () => fakeResponse;
        const telemetryPayloads: any[] = [];
        telemetryMock.setup(x => x.sendTelemetryEvent(It.IsAny(), It.IsAny(), It.IsAny()))
            .callback((interaction) => {
                telemetryPayloads.push(interaction.args[1]);
            });
        await client.sendRequest({ pathTemplate: '/foo' });
        expect(telemetryPayloads.some(p => p && p.bodyAsText === '{"error":"fail"}')).to.be.true;
    });

    it('should call getToken and send Authorization header if environment is valid and pathTemplate is provided', async () => {
        envProviderMock.setup(x => x.getCurrent()).returns({ sharedUri: 'https://test.fabric', env: 'PROD' } as any);
        let getTokenCalled = false;
        authMock.setup(x => x.getToken()).callback(() => {
            getTokenCalled = true; return Promise.resolve('abc123');
        });//.returnsAsync('abc123');

        let receivedHeaders: any = {};
        pipelineMock.sendRequest = async (apiClient: any, req: any) => {
            receivedHeaders = req.headers?.toJSON ? req.headers.toJSON() : req.headers;
            return {
                status: 200,
                headers: azApi.createHttpHeaders({}),
                bodyAsText: '',
                request: {},
                get: () => undefined,
            } as any;
        };

        await client.sendRequest({ pathTemplate: '/foo' });
        expect(receivedHeaders['authorization']).to.equal('Bearer abc123');
        expect(getTokenCalled).to.be.true;
    });

    it('should send custom headers if provided in request options', async () => {
        authMock.setup(x => x.getToken()).returnsAsync('abc123');
        let receivedHeaders: any = {};
        pipelineMock.sendRequest = async (apiClient: any, req: any) => {
            receivedHeaders = req.headers?.toJSON ? req.headers.toJSON() : req.headers;
            return {
                status: 200,
                headers: azApi.createHttpHeaders({}),
                bodyAsText: '',
                request: {},
                get: () => undefined,
            } as any;
        };
        await client.sendRequest({
            pathTemplate: '/foo',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: { 'x-custom-header': 'value123' },
        });
        expect(receivedHeaders['x-custom-header']).to.equal('value123');
        expect(receivedHeaders['authorization']).to.equal('Bearer abc123');
    });

    it('should set Authorization header with token when token is available', async () => {
        const testToken = 'test-token-456';
        authMock.setup(x => x.getToken()).returnsAsync(testToken);
        let receivedHeaders: any = {};
        pipelineMock.sendRequest = async (apiClient: any, req: any) => {
            receivedHeaders = req.headers?.toJSON ? req.headers.toJSON() : req.headers;
            return {
                status: 200,
                headers: azApi.createHttpHeaders({}),
                bodyAsText: '',
                request: {},
                get: () => undefined,
            } as any;
        };
        await client.sendRequest({ pathTemplate: '/foo' });
        expect(receivedHeaders['authorization']).to.equal(`Bearer ${testToken}`);
    });

    it('should handle pipeline returning a response with missing bodyAsText', async () => {
        authMock.setup(x => x.getToken()).returnsAsync('abc123');
        pipelineMock.sendRequest = async () => ({
            status: 200,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: azApi.createHttpHeaders({ 'Content-Type': 'application/json' }),
            request: {},
            get: () => undefined,
        } as any);
        const result = await client.sendRequest({ pathTemplate: '/foo' });
        expect(result.status).to.equal(200);
        expect(result.bodyAsText).to.be.undefined;
        expect(result.parsedBody).to.be.undefined;
    });

    it('should handle pipeline returning a response with invalid JSON', async () => {
        authMock.setup(x => x.getToken()).returnsAsync('abc123');
        pipelineMock.sendRequest = async () => ({
            status: 200,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: azApi.createHttpHeaders({ 'Content-Type': 'application/json' }),
            bodyAsText: '{invalidJson:}',
            request: {},
            get: () => undefined,
        } as any);
        let exceptionWasThrown = false;
        try {
            await client.sendRequest({ pathTemplate: '/foo' });
        }
        catch (error) {
            exceptionWasThrown = true;
            expect(error).to.be.instanceOf(Error);
            expect((error as Error).message).to.contain('Expected property name or'); // "Expected property name or '}' in JSON at position 1 (line 1 column 2)"
            expect(errorMessageLogged).to.contain('Expected property name or');
        }
        expect(exceptionWasThrown).to.be.true;
    });

    it('should call sendTelemetryEvent with correct event name on HTTP 4xx', async () => {
        authMock.setup(x => x.getToken()).returnsAsync('abc123');
        const fakeResponse = {
            status: 404,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: azApi.createHttpHeaders({ 'Content-Type': 'application/json' }),
            bodyAsText: '{"error":"not found"}',
            request: {},
            get: () => undefined,
        } as any;
        pipelineMock.sendRequest = async () => fakeResponse;
        let eventName: string | undefined;
        telemetryMock.setup(x => x.sendTelemetryEvent(It.IsAny(), It.IsAny(), It.IsAny()))
            .callback((interaction) => {
                eventName = interaction.args[0];
            });
        await client.sendRequest({ pathTemplate: '/foo' });
        expect(eventName).to.be.a('string');
    });

});
