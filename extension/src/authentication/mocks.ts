// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { ITokenAcquisitionService, TokenRequestOptions, IAccountProvider, ITenantSettings } from './interfaces';
import { VsCodeAuthentication } from './TokenAcquisitionService';

export class MockVsCodeAuthentication implements VsCodeAuthentication {
    static readonly instance = new MockVsCodeAuthentication();
    readonly didChangeSessionsEmitter = new vscode.EventEmitter<vscode.AuthenticationSessionsChangeEvent>();

    lastRequestProviderId: string | undefined = undefined;
    lastRequestScopes: readonly string[] = [];
    lastRequestOptions: vscode.AuthenticationGetSessionOptions | undefined = undefined;
    responseToProvide: vscode.AuthenticationSession | undefined = undefined;

    onDidChangeSessions = this.didChangeSessionsEmitter.event;
    getSession(providerId: string, scopes: readonly string[], options: vscode.AuthenticationGetSessionOptions): Thenable<vscode.AuthenticationSession | undefined> {
        this.lastRequestProviderId = providerId;
        this.lastRequestScopes = scopes;
        this.lastRequestOptions = options;
        return Promise.resolve(this.responseToProvide);
    }
}

export class MockTokenAcquisitionService implements ITokenAcquisitionService {
    getArmAccessToken(options: TokenRequestOptions, extraScopes?: string[], tenantId?: string): Promise<string | null> {
        throw new Error('Method not implemented.');
    }
    readonly #msSessionChangedEmitter = new vscode.EventEmitter<void>();
    readonly msSessionChanged = this.#msSessionChangedEmitter.event;

    getSessionInfo(options: TokenRequestOptions, extraScopes?: string[] | undefined): Promise<vscode.AuthenticationSession | null> {
        return Promise.resolve(null);
    }
    getMsAccessToken(options: TokenRequestOptions, extraScopes?: string[] | undefined): Promise<string | null> {
        throw new Error('Method not implemented.');
    }
}

export class MockAccountProvider implements IAccountProvider {
    #isSignedIn: boolean = true;

    readonly #onSuccessfulSignInEmitter = new vscode.EventEmitter<void>();
    readonly onSuccessfulSignIn = this.#onSuccessfulSignInEmitter.event;

    readonly #onSignInChangedEmitter = new vscode.EventEmitter<void>();
    readonly onSignInChanged = this.#onSignInChangedEmitter.event;

    readonly #onTenantChangedEmitter = new vscode.EventEmitter<void>();
    readonly onTenantChanged = this.#onTenantChangedEmitter.event;

    public loginCount: number = 0;
    constructor() {
        this.#isSignedIn = true;
    }
    getCurrentTenant(): Promise<ITenantSettings | undefined> {
        // For mocking purposes, return undefined to indicate no tenant selection (direct workspace access)
        return Promise.resolve(undefined);
    }
    getTenants(): Promise<ITenantSettings[]> {
        // For mocking purposes, return empty array
        return Promise.resolve([]);
    }

    getAccountInfo(askToSignIn: boolean): Promise<vscode.AuthenticationSessionAccountInformation | null> {
        throw new Error('Method not implemented.');
    }
    async signIn(): Promise<boolean> {
        this.#isSignedIn = true;
        this.loginCount++;
        this.#onSuccessfulSignInEmitter.fire();
        return true;
    }
    async isSignedIn(): Promise<boolean> {
        return this.#isSignedIn;
    }
    async getDefaultTelemetryProperties(): Promise<{ [key: string]: string }> {
        return {
            'common.tenantid': 'ten-ant-id',
            'common.extmode': '2',
        };
    }
    async getToken(): Promise<string> {
        return 'mock token';
    }

    async getSessionInfo(): Promise<vscode.AuthenticationSession | null> {
        return Promise.resolve({
            id: 'mock-session-id',
            accessToken: 'mock-access-token',
            account: {
                id: 'mock-account-id',
                label: 'mock@example.com',
            },
            scopes: [],
        });
    }

    awaitSignIn(): Promise<void> {
        return Promise.resolve();
    }
}
