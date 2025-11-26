// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

export interface ITenantSettings {
    tenantId: string;
    displayName: string;
    defaultDomain: string;
}

export interface IAccountProvider {
    getTenants(): Promise<ITenantSettings[]>;
    getCurrentTenant(): Promise<ITenantSettings | undefined>;
    onTenantChanged: vscode.Event<void>;

    getToken(tenantId?: string): Promise<string | null>;
    signIn(tenantId?: string): Promise<boolean>;
    isSignedIn(tenantId?: string): Promise<boolean>;

    getDefaultTelemetryProperties(): Promise<{ [key: string]: string }>;
    onSignInChanged: vscode.Event<void>;
    awaitSignIn(): Promise<void>;
    getSessionInfo(tenantId?: string): Promise<vscode.AuthenticationSession | null>;
}

export interface TokenRequestOptions extends vscode.AuthenticationGetSessionOptions {
    /**
     * Identifier of caller partner (ex. NuGet or AvailabilityService) that would be used for telemetry.
     */
    callerId: string

    /**
     * Reason to request session from customer. This string could be displayed to customer in the future, so ideally should be localized.
     */
    requestReason: string
}

export interface ITokenAcquisitionService {
    getSessionInfo(options: TokenRequestOptions, extraScopes?: string[], tenantId?: string): Promise<vscode.AuthenticationSession | null>
    getMsAccessToken(options: TokenRequestOptions, extraScopes?: string[], tenantId?: string): Promise<string | null>
    getArmAccessToken(options: TokenRequestOptions, extraScopes?: string[], tenantId?: string): Promise<string | null>
    msSessionChanged: vscode.Event<void>
}
