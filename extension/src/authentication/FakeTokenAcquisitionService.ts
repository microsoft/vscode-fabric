// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as os from 'os';
import { ITokenAcquisitionService, TokenRequestOptions } from './interfaces';

export class FakeTokenAcquisitionService implements ITokenAcquisitionService {
    getArmAccessToken(options: TokenRequestOptions, extraScopes?: string[], tenantId?: string): Promise<string | null> {
        throw new Error('Method not implemented.');
    }

    private readonly msSessionChangedEmitter = new vscode.EventEmitter<void>();
    public readonly msSessionChanged = this.msSessionChangedEmitter.event;

    async getSessionInfo(options: TokenRequestOptions, extraScopes?: string[]): Promise<vscode.AuthenticationSession | null> {
        const session = {
            id: 'fake-session-id',
            scopes: extraScopes,
            accessToken: await this.getToken(),
            account: { id: 'fake-account-id', label: 'fake-account-label' },
            idToken: '.' + 'eyJlbWFpbCI6ImZha2UtdXNlckBtaWNyb3NvZnQuY29tIiwgInRpZCI6ImZha2UtdGVuYW50LWlkIn0=',
            // The above idToken is not sensitive simply the below json base64 encoded
            // idToken: '{"email":"fake-user@microsoft.com", "tid":"fake-tenant-id"}'
        };
        return Promise.resolve(session as vscode.AuthenticationSession);
    }

    async getMsAccessToken(options: TokenRequestOptions, extraScopes?: string[]): Promise<string | null> {
        return await this.getToken() ?? 'fake-token'; // If no token is pre configured, return a fake token string
    }

    private async getToken(): Promise<string | null> {
        const tokenFilePath = vscode.Uri.file(`${os.homedir()}/.fabric-token`);
        try {
            const token = await vscode.workspace.fs.readFile(tokenFilePath);
            return Buffer.from(token).toString('utf8');
        }
        catch (error) {
            // Expected that it may not be present, just return null
            return null;
        }
    }
}
