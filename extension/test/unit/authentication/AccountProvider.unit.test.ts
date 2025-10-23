// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';

import { AccountProvider } from '../../../src/authentication/AccountProvider';
import { ITokenAcquisitionService, TokenRequestOptions } from '../../../src/authentication/interfaces';
import { AuthenticationSessionAccountInformation } from 'vscode';
import { SubscriptionClient, TenantIdDescription } from '@azure/arm-resources-subscriptions';

// Mock classes
/**
 * Custom implementation of VS Code's EventEmitter needed because Moq.ts is insufficient
 * for mocking the complex, stateful behavior of EventEmitter:
 *
 * 1. VS Code's event pattern requires chained behaviors (event() returns a function that
 *    registers handlers and returns disposables) that Moq.ts cannot easily represent
 * 2. The EventEmitter requires stateful tracking of registered handlers across multiple calls
 * 3. Manual triggering of events is needed for testing event-driven code paths
 *
 * Sinon is still used to inject this mock into the code under test.
 */
class MockEventEmitter<T> implements vscode.EventEmitter<T> {
    private handlers: ((e: T) => any)[] = [];

    event: vscode.Event<T> = (listener: (e: T) => any): vscode.Disposable => {
        this.handlers.push(listener);
        return {
            dispose: () => {
                const index = this.handlers.indexOf(listener);
                if (index >= 0) {
                    this.handlers.splice(index, 1);
                }
            },
        };
    };

    fire(data: T): void {
        this.handlers.forEach(handler => handler(data));
    }

    dispose(): void {
        this.handlers = [];
    }
}

describe('AccountProvider', function () {
    let tokenServiceMock: Mock<ITokenAcquisitionService>;
    let accountProvider: AccountProvider;
    let mockSuccessfulSignInEmitter: MockEventEmitter<void>;
    let mockSignInChangedEmitter: MockEventEmitter<void>;

    before(function () {
        // Setup operations that need to happen once before all tests
    });

    beforeEach(function () {
        // Initialize mocks for each test
        tokenServiceMock = new Mock<ITokenAcquisitionService>();

        // Create a stub for the session changed event
        // This sets up the msSessionChanged method to return a disposable
        // that AccountProvider can use to listen for auth session changes
        tokenServiceMock.setup(instance => instance.msSessionChanged(It.IsAny())).returns(
            { dispose: () => {} }
        );

        // Set up mock event emitters
        mockSuccessfulSignInEmitter = new MockEventEmitter<void>();
        mockSignInChangedEmitter = new MockEventEmitter<void>();

        // Create stubs for vscode.EventEmitter
        sinon.stub(vscode, 'EventEmitter').callsFake(() => {
            return {
                event: mockSuccessfulSignInEmitter.event,
                fire: mockSuccessfulSignInEmitter.fire.bind(mockSuccessfulSignInEmitter),
                dispose: mockSuccessfulSignInEmitter.dispose.bind(mockSuccessfulSignInEmitter),
            };
        });

        // Initialize the class under test with mocks
        accountProvider = new AccountProvider(tokenServiceMock.object(), null);
    });

    afterEach(function () {
        // Clean up after each test
        sinon.restore();
    });

    after(function () {
        // Teardown operations after all tests complete
    });

    describe('getAccountInfo', function () {
        it('should return account information when session exists', async function () {
            // Arrange
            const mockAccount: AuthenticationSessionAccountInformation = {
                id: 'test-id',
                label: 'test-label',
            };
            const mockSession = {
                account: mockAccount,
                id: 'test-session-id',
                accessToken: 'test-token',
                scopes: [],
            };

            tokenServiceMock.setup(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.IsAny()
            )).returns(Promise.resolve(mockSession));

            // Act
            const result = await accountProvider.getAccountInfo(false);

            // Assert
            assert.strictEqual(result, mockAccount, 'Should return the account from the session');
            tokenServiceMock.verify(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.IsAny()
            ), Times.Once());
        });

        it('should return null when no session exists', async function () {
            // Arrange
            tokenServiceMock.setup(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.IsAny()
            )).returns(Promise.resolve(null));

            // Act
            const result = await accountProvider.getAccountInfo(false);

            // Assert
            assert.strictEqual(result, null, 'Should return null when no session exists');
            tokenServiceMock.verify(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.IsAny()
            ), Times.Once());
        });

        it('should set createIfNone to true when askToSignIn is true', async function () {
            // Arrange
            tokenServiceMock.setup(instance => instance.getSessionInfo(
                It.Is<TokenRequestOptions>(options =>
                    options.createIfNone === true &&
                    options.silent === false
                ),
                It.IsAny(),
                It.IsAny()
            )).returns(Promise.resolve(null));

            // Act
            await accountProvider.getAccountInfo(true);

            // Assert
            tokenServiceMock.verify(instance => instance.getSessionInfo(
                It.Is<TokenRequestOptions>(options =>
                    options.createIfNone === true &&
                    options.silent === false
                ),
                It.IsAny(),
                It.IsAny()
            ), Times.Once());
        });
    });

    describe('signIn', function () {
        it('should return true and fire onSignInChanged when sign-in is successful', async function () {
            // Arrange
            const mockAccount: AuthenticationSessionAccountInformation = {
                id: 'test-id',
                label: 'test-label',
            };
            const mockSession = {
                account: mockAccount,
                id: 'test-session-id',
                accessToken: 'test-token',
                scopes: [],
            };

            tokenServiceMock.setup(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.IsAny()
            )).returns(Promise.resolve(mockSession));

            let eventFired = false;
            accountProvider.onSignInChanged(() => {
                eventFired = true;
            });

            // Act
            const result = await accountProvider.signIn();

            // Assert
            assert.strictEqual(result, true, 'Should return true on successful sign-in');
            assert.strictEqual(eventFired, true, 'Should fire onSignInChanged event');
        });

        it('should store tenantId when provided and sign-in is successful', async function () {
            // Arrange
            const mockAccount: AuthenticationSessionAccountInformation = {
                id: 'test-id',
                label: 'test-label',
            };
            const mockSession = {
                account: mockAccount,
                id: 'test-session-id',
                accessToken: 'test-token',
                scopes: [],
            };

            tokenServiceMock.setup(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.Is<string>(tenantId => tenantId === 'test-tenant')
            )).returns(Promise.resolve(mockSession));

            // Act
            const result = await accountProvider.signIn('test-tenant');

            // Assert
            assert.strictEqual(result, true, 'Should return true on successful sign-in');

            // Verify the tenant ID was stored by making a subsequent call
            tokenServiceMock.setup(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.Is<string>(tenantId => tenantId === 'test-tenant')
            )).returns(Promise.resolve(mockSession));

            await accountProvider.getAccountInfo(false);

            tokenServiceMock.verify(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.Is<string>(tenantId => tenantId === 'test-tenant')
            ), Times.Exactly(2));
        });

        it('should not store tenantId when sign-in is unsuccessful', async function () {
            // Arrange
            // Setup mock to return null for the first sign-in attempt (unsuccessful)
            tokenServiceMock.setup(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.Is<string>(tenantId => tenantId === 'test-tenant')
            )).returns(Promise.resolve(null));

            // Act
            const result = await accountProvider.signIn('test-tenant');

            // Assert
            assert.strictEqual(result, false, 'Should return false on unsuccessful sign-in');

            // Verify that getSessionInfo was called exactly once with the test tenant
            tokenServiceMock.verify(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.Is<string>(tenantId => tenantId === 'test-tenant')
            ), Times.Once());

            // Setup for a subsequent call without a tenant ID
            // The mock should expect getSessionInfo to be called without the tenant ID parameter
            tokenServiceMock.setup(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.Is<string>(tenantId => tenantId === undefined)
            )).returns(Promise.resolve(null));

            // Make a call that would use the stored tenant ID if it had been stored
            await accountProvider.getAccountInfo(false);

            // Verify again that getSessionInfo was still only called once with the test tenant
            // (meaning the test tenant ID was not stored or used in the subsequent call)
            tokenServiceMock.verify(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.Is<string>(tenantId => tenantId === 'test-tenant')
            ), Times.Once());

            // Verify the subsequent call was made without the tenant ID
            tokenServiceMock.verify(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.Is<string>(tenantId => tenantId === undefined)
            ), Times.Once());
        });
    });

    describe('getToken', function () {
        it('should pass the tenant ID when provided', async function () {
            // Arrange
            const mockToken = 'test-access-token';
            const testTenantId = 'test-tenant-id';

            tokenServiceMock.setup(instance => instance.getMsAccessToken(
                It.IsAny(),
                It.IsAny(),
                It.Is<string>(tenantId => tenantId === testTenantId)
            )).returns(Promise.resolve(mockToken));

            // Act
            await accountProvider.getToken(testTenantId);

            // Assert
            tokenServiceMock.verify(instance => instance.getMsAccessToken(
                It.IsAny(),
                It.IsAny(),
                It.Is<string>(tenantId => tenantId === testTenantId)
            ), Times.Once());
        });
    });

    describe('getTenants', function () {
        it('should return empty array when no ARM token available', async function () {
            // Arrange
            tokenServiceMock.setup(instance => instance.getArmAccessToken(
                It.IsAny()
            )).returns(Promise.resolve(null));

            // Act
            const result = await accountProvider.getTenants();

            // Assert
            assert.deepStrictEqual(result, [], 'Should return empty array when no token available');
            tokenServiceMock.verify(instance => instance.getArmAccessToken(
                It.IsAny()
            ), Times.Once());
        });

    });

    describe('getDefaultTelemetryProperties', function () {
        it('should return default properties when user is not signed in', async function () {
            // Arrange
            tokenServiceMock.setup(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.IsAny()
            )).returns(Promise.resolve(null));

            // Act
            const result = await accountProvider.getDefaultTelemetryProperties();

            // Assert
            assert.strictEqual(result['isMicrosoftInternal'], 'false', 'Should set isMicrosoftInternal to false when not signed in');
        });

        it('should return Microsoft internal user properties when email is from microsoft.com', async function () {
            // Arrange
            const mockSession = {
                account: { id: 'test-id', label: 'test-label' },
                id: 'test-session-id',
                accessToken: 'test-token',
                scopes: [],
                idToken: 'header.eyJlbWFpbCI6InRlc3QtdXNlckBtaWNyb3NvZnQuY29tIiwidGlkIjoidGVzdC10ZW5hbnQtaWQifQ.signature',
            };

            // Make isSignedIn return true
            tokenServiceMock.setup(instance => instance.getSessionInfo(
                It.Is<TokenRequestOptions>(options => options.silent === true && !options.createIfNone),
                It.IsAny(),
                It.IsAny()
            )).returns(Promise.resolve(mockSession));

            // Create a spy on the JSON.parse method
            const jsonParseSpy = sinon.spy(JSON, 'parse');

            // Create a spy on Buffer.from that will return our mock data
            const bufferFromStub = sinon.stub(Buffer, 'from').callsFake((data, encoding) => {
                if (encoding === 'base64' && typeof data === 'string') {
                    // This is the mocked decoded JSON that would be returned
                    // We're simulating the decoding of the JWT token payload
                    // which AccountProvider uses to extract user information
                    const mockJson = '{"email":"test-user@microsoft.com","tid":"test-tenant-id"}';
                    return {
                        toString: () => mockJson,
                    } as any;
                }
                return originalBuffer.from(data as any, encoding as any);
            });

            // Store a reference to the original Buffer.from
            // This allows us to delegate to the real implementation when not handling base64
            const originalBuffer = { from: Buffer.from };

            // Act
            const result = await accountProvider.getDefaultTelemetryProperties();

            // Assert
            assert.strictEqual(result['isMicrosoftInternal'], 'true', 'Should identify Microsoft internal user');
            assert.strictEqual(result['useralias'], 'test-user', 'Should extract alias from email');
            assert.strictEqual(result['tenantid'], 'test-tenant-id', 'Should extract tenant ID from token');

            // Restore the stubs
            // These calls are important to ensure we don't leave mocked functions
            // that could affect other tests. Sinon's restore() will handle most
            // stubs automatically in afterEach, but it's good practice to be explicit
            // about cleanup, especially for important global objects like Buffer
            bufferFromStub.restore();
            jsonParseSpy.restore();
        });

        it('should handle preferred_username when email is not available', async function () {
            // Arrange
            const mockSession = {
                account: { id: 'test-id', label: 'test-label' },
                id: 'test-session-id',
                accessToken: 'test-token',
                scopes: [],
                idToken: 'header.eyJwcmVmZXJyZWRfdXNlcm5hbWUiOiJ0ZXN0LXVzZXJAbWljcm9zb2Z0LmNvbSIsInRpZCI6InRlc3QtdGVuYW50LWlkIn0.signature',
            };

            // Make isSignedIn return true
            tokenServiceMock.setup(instance => instance.getSessionInfo(
                It.Is<TokenRequestOptions>(options => options.silent === true),
                It.IsAny(),
                It.IsAny()
            )).returns(Promise.resolve(mockSession));

            // Create a spy on Buffer.from that will return our mock data
            // This is testing the case where the JWT token contains preferred_username
            // instead of email, which AccountProvider should also handle correctly
            const bufferFromStub = sinon.stub(Buffer, 'from').callsFake((data, encoding) => {
                if (encoding === 'base64' && typeof data === 'string') {
                    // This is the mocked decoded JSON that would be returned
                    const mockJson = '{"preferred_username":"test-user@microsoft.com","tid":"test-tenant-id"}';
                    return {
                        toString: () => mockJson,
                    } as any;
                }
                return originalBuffer.from(data as any, encoding as any);
            });

            // Store a reference to the original Buffer.from
            const originalBuffer = { from: Buffer.from };

            // Act
            const result = await accountProvider.getDefaultTelemetryProperties();

            // Assert
            assert.strictEqual(result['isMicrosoftInternal'], 'true', 'Should identify Microsoft internal user');
            assert.strictEqual(result['useralias'], 'test-user', 'Should extract alias from preferred_username');

            // Restore the stub
            bufferFromStub.restore();
        });

        it('should mark non-Microsoft email as external', async function () {
            // Arrange
            const mockSession = {
                account: { id: 'test-id', label: 'test-label' },
                id: 'test-session-id',
                accessToken: 'test-token',
                scopes: [],
                idToken: 'header.eyJlbWFpbCI6InRlc3QtdXNlckBleGFtcGxlLmNvbSIsInRpZCI6InRlc3QtdGVuYW50LWlkIn0.signature',
            };

            // Make isSignedIn return true
            tokenServiceMock.setup(instance => instance.getSessionInfo(
                It.Is<TokenRequestOptions>(options => options.silent === true),
                It.IsAny(),
                It.IsAny()
            )).returns(Promise.resolve(mockSession));

            // Create a spy on Buffer.from that will return our mock data
            // This test case verifies that non-Microsoft email domains are correctly
            // identified as external users in the telemetry properties
            const bufferFromStub = sinon.stub(Buffer, 'from').callsFake((data, encoding) => {
                if (encoding === 'base64' && typeof data === 'string') {
                    // This is the mocked decoded JSON that would be returned
                    // Note the email domain is example.com (non-Microsoft)
                    const mockJson = '{"email":"test-user@example.com","tid":"test-tenant-id"}';
                    return {
                        toString: () => mockJson,
                    } as any;
                }
                return originalBuffer.from(data as any, encoding as any);
            });

            // Store a reference to the original Buffer.from
            const originalBuffer = { from: Buffer.from };

            // Act
            const result = await accountProvider.getDefaultTelemetryProperties();

            // Assert
            assert.strictEqual(result['isMicrosoftInternal'], 'false', 'Should identify external user');
            assert.strictEqual(result['useralias'], undefined, 'Should not have alias for external user');
            assert.strictEqual(result['tenantid'], 'test-tenant-id', 'Should extract tenant ID from token');

            // Restore the stub
            bufferFromStub.restore();
        });
    });

    describe('awaitSignIn', function () {
        it('should not wait if already signed in', async function () {
            // Arrange
            tokenServiceMock.setup(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.IsAny()
            )).returns(Promise.resolve({
                account: { id: 'test-id', label: 'test-label' },
                id: 'test-session-id',
                accessToken: 'test-token',
                scopes: [],
            }));

            // Create a spy for vscode.commands.executeCommand
            const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();

            // Act
            await accountProvider.awaitSignIn();

            // Assert
            assert.strictEqual(executeCommandStub.called, false, 'Should not call executeCommand when already signed in');
        });

        it('should execute sign-in command and wait for event when not signed in', async function () {
            // Arrange - first call to isSignedIn returns false
            let signInCallCount = 0;
            tokenServiceMock.setup(instance => instance.getSessionInfo(
                It.IsAny(),
                It.IsAny(),
                It.IsAny()
            )).callback(() => {
                signInCallCount++;
                // First call returns null (not signed in)
                // Second call (if any) returns a session (signed in)
                return Promise.resolve(signInCallCount === 1 ? null : {
                    account: { id: 'test-id', label: 'test-label' },
                    id: 'test-session-id',
                    accessToken: 'test-token',
                    scopes: [],
                });
            });

            // Create a spy for vscode.commands.executeCommand
            const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();

            // Setup to fire the sign-in event after a short delay
            setTimeout(() => {
                accountProvider['onSuccessfulSignInEmitter'].fire();
            }, 10);

            // Act
            await accountProvider.awaitSignIn();

            // Assert
            assert.strictEqual(executeCommandStub.calledOnce, true, 'Should call executeCommand once');
            assert.strictEqual(
                executeCommandStub.calledWith('vscode-fabric.signIn', undefined),
                true,
                'Should call sign-in command with correct parameters'
            );
        });
    });

    describe('dispose', function () {
        it('should dispose all event emitters and listeners', function () {
            // Arrange
            // Create simple spies for the dispose methods
            const disposeSpy = sinon.spy();

            // Create a stub for the EventEmitter that returns an object with a spied dispose method
            sinon.restore();
            const emitterStub = sinon.stub(vscode, 'EventEmitter').returns({
                event: () => ({ dispose: () => {} }),
                fire: () => {},
                dispose: disposeSpy,
            });

            // Create a spy for the session changed listener's dispose method
            const sessionChangedDisposeSpy = sinon.spy();
            tokenServiceMock.setup(instance => instance.msSessionChanged(It.IsAny())).returns({
                dispose: sessionChangedDisposeSpy,
            });

            // Create a new instance with these mocks
            const provider = new AccountProvider(tokenServiceMock.object(), null);

            // Act
            provider.dispose();

            // Assert
            // Verify that EventEmitter.dispose was called for both emitters
            assert.strictEqual(disposeSpy.callCount, 3, 'Should dispose both event emitters');

            // Verify that the session changed listener was disposed
            assert.strictEqual(sessionChangedDisposeSpy.callCount, 1, 'Should dispose session changed listener');
        });
    });
});
