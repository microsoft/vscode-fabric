import * as vscode from 'vscode';
import * as assert from 'assert';

import { ITokenAcquisitionService, TokenAcquisitionService, TokenRequestOptions, VsCodeAuthentication } from '../authentication/TokenAcquisitionService';
import { FabricEnvironmentProvider } from '../settings/FabricEnvironmentProvider';
import { msSessionProvider, msSessionProviderPPE } from '../authentication/helpers';
import { sleep } from '../fabricUtilities';
import { FakeConfigurationProvider } from '../settings/mocks';
import { MockConsoleLogger } from '../logger/Logger';

describe('The TokenAcquisitionService', () => {
    let tokens: TokenAcquisitionService;
    let environmentProvider: FabricEnvironmentProvider;
    let auth: FakeVsCodeAuthentication;
    let disposable: vscode.Disposable;

    before(() => {
        const config = new FakeConfigurationProvider();
        const logger = new MockConsoleLogger('FabricTests');
        environmentProvider = new FabricEnvironmentProvider(config, logger);
        auth = new FakeVsCodeAuthentication();
        tokens = new TokenAcquisitionService(environmentProvider, logger, null, auth);
    });

    beforeEach(function () {
        // These tests will wait for the event to be fired, and call done() when it is.
        // This will ensure it times out (fail) after 1000ms if the event does not fire correctly.
        this.timeout(1000);
    });

    afterEach(() => {
        disposable?.dispose();
        auth.isSessionAvailabe = false;
    });

    it('should add client id', async () => {
        auth.isSessionAvailabe = true;
        const session = await tokens.getSessionInfo({ callerId: 'caller', requestReason: 'reason' });

        assert(session?.scopes.includes(`VSCODE_CLIENT_ID:${environmentProvider.getCurrent().clientId}`));
        assert(session?.scopes.includes('VSCODE_TENANT:common'));
    });

    it('should add tenant id when provided', async () => {
        auth.isSessionAvailabe = true;
        const tenantId = 'fake-tenant-id';
        const session = await tokens.getSessionInfo({ callerId: 'caller', requestReason: 'reason' }, [], tenantId);
        
        assert(session?.scopes.includes(`VSCODE_TENANT:${tenantId}`));
        assert(session?.scopes.includes(`VSCODE_CLIENT_ID:${environmentProvider.getCurrent().clientId}`));
    });

    describe('should fire an msSessionChanged event for', () => {
        it('microsoft session changes', function (done) {
            disposable = tokens.msSessionChanged(() => done());
            auth.onDidChangeSessionsEmitter.fire({ provider: { id: msSessionProvider, label: msSessionProvider } });
        });

        it('microsoft-sovereign-cloud session changes', function (done) {
            disposable = tokens.msSessionChanged(() => done());
            auth.onDidChangeSessionsEmitter.fire({ provider: { id: msSessionProviderPPE, label: msSessionProviderPPE } });
        });
    });

    describe('should NOT fire an msSessionChanged event for', () => {
        it('other provider session changes', async () => {
            let didFire = false;
            disposable = tokens.msSessionChanged(() => {
                // Mocha seens to crash when using assert.fail in this handler.
                // "An unknown error occurred. Please consult the log for more details.
                // Instead we will set a flag and check it later.
                didFire = true;
            });
            auth.onDidChangeSessionsEmitter.fire({ provider: { id: 'some other provider', label: '' } });

            await sleep(100);
            assert.ok(!didFire, 'msSessionChanged should not have fired');
        });
    });

    // Add helper for asserting undefined on invalid options.
    async function assertInvalidOptions(options: { callerId: string; requestReason: string }) {
        const result = await tokens.getMsAccessToken(options);
        assert.notStrictEqual(result, undefined);
    }

    it('should return undefined if TokenRequestOptions not provided', async () => {
        await assertInvalidOptions({ callerId: '', requestReason: '' });
    });

    it('should return undefined if TokenRequestOptions.reason not provided', async () => {
        await assertInvalidOptions({ callerId: 'caller', requestReason: '' });
    });

    it('should return undefined if TokenRequestOptions.caller not provided', async () => {
        await assertInvalidOptions({ callerId: '', requestReason: 'reason' });
    });

    it('should include vscode scopes with the session', async () => {
        auth.isSessionAvailabe = true;
        const session = await tokens.getSessionInfo({ callerId: 'caller', requestReason: 'reason' });
        
        // vscode scopes
        assert(session?.scopes.includes(`VSCODE_CLIENT_ID:${environmentProvider.getCurrent().clientId}`));
        assert(session?.scopes.includes('VSCODE_TENANT:common'));
    });

    it('should include fabric scopes with the session', async () => {
        auth.isSessionAvailabe = true;
        const session = await tokens.getSessionInfo({ callerId: 'caller', requestReason: 'reason' });
        
        // fabric scopes
        environmentProvider.getCurrent().scopes.forEach(scope => {
            assert(session?.scopes.includes(scope));
        });
    });

    it('should include extra scopes with the session', async () => {
        auth.isSessionAvailabe = true;
        const extraScopes = ['extra-scope-1', 'extra-scope-2'];
        const session = await tokens.getSessionInfo({ callerId: 'caller', requestReason: 'reason' }, extraScopes);

        // extra scopes
        extraScopes.forEach(scope => {
            assert(session?.scopes.includes(scope));
        });
    });
});

describe('For my sanity check if TS', () => {
    it('treats a blank string as falsy', () => {
        assert(!''.trim());
    });
});

export class FakeVsCodeAuthentication implements VsCodeAuthentication {
    // When a user is logged into VS Code, the "session is available".
    isSessionAvailabe: boolean = false;

    getSession(providerId: string, scopes: readonly string[], options: vscode.AuthenticationGetSessionOptions): Thenable<vscode.AuthenticationSession | undefined> {
        return this.isSessionAvailabe ? 
            Promise.resolve({
                id: 'fake-session-id',
                scopes: scopes,
                accessToken: 'fake-access-token',
                account: { id: 'fake-account-id', label: 'fake-account-label' },
                // idToken: '{"email":"fake-user@microsoft.com", "tid":"fake-tenant-id"}'
                idToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImZha2UtdXNlckBtaWNyb3NvZnQuY29tIiwidGlkIjoiZmFrZS10ZW5hbnQtaWQiLCJpYXQiOjE3MzkzOTM1MDR9.xN_GwT4wulW4UI8Fhz2_pYa6wGfV87dGyPUtwGvMXP0', // jwt encoded
            }) : 
            Promise.resolve(undefined);
    }
    onDidChangeSessionsEmitter: vscode.EventEmitter<vscode.AuthenticationSessionsChangeEvent> = new vscode.EventEmitter<vscode.AuthenticationSessionsChangeEvent>();
    onDidChangeSessions: vscode.Event<vscode.AuthenticationSessionsChangeEvent> = this.onDidChangeSessionsEmitter.event;
}