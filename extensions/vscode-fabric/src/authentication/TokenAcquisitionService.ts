import { IDisposable } from '@microsoft/vscode-fabric-api';
import { ITokenAcquisitionService, TokenRequestOptions } from './interfaces';
import * as vscode from 'vscode';
import { IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { getSessionProviderForFabricEnvironment, msSessionProvider, msSessionProviderPPE  } from '@microsoft/vscode-fabric-util';
import { TelemetryService } from '@microsoft/vscode-fabric-util';
import { ILogger, LogImportance } from '@microsoft/vscode-fabric-util';
import { getConfiguredAzureEnv } from '@microsoft/vscode-azext-azureauth';

export class TokenAcquisitionService implements ITokenAcquisitionService, IDisposable {
    private readonly sessionsChangeEventHandle: IDisposable;
    private readonly msSessionChangedEmitter = new vscode.EventEmitter<void>();
    public readonly msSessionChanged = this.msSessionChangedEmitter.event;

    constructor(
        private readonly fabricEnvironmentProvider: IFabricEnvironmentProvider,
        private readonly logger: ILogger,
        private readonly telemetryService: TelemetryService | null,
        private readonly authentication?: VsCodeAuthentication
    ) {

        this.authentication = authentication ?? new DefaultVsCodeAuthentication();
        this.sessionsChangeEventHandle = this.authentication.onDidChangeSessions(e => this.fireUpdate(e.provider.id));
    }

    public async getSessionInfo(options: TokenRequestOptions, extraScopes?: string[], tenantId?: string): Promise<vscode.AuthenticationSession | null> {
        const currentEnv = this.fabricEnvironmentProvider.getCurrent();
        const currentProvider = getSessionProviderForFabricEnvironment(currentEnv.env);
        const fullScope = [...this.vscodeSessionScopes(currentEnv.clientId, tenantId), ...currentEnv.scopes, ...extraScopes ?? []];
        const session = await this.getSession(currentProvider, fullScope, options);
        return session ?? null;
    }

    public getMsAccessToken(options: TokenRequestOptions, extraScopes?: string[], tenantId?: string): Promise<string | null> {
        const currentEnv = this.fabricEnvironmentProvider.getCurrent();
        const currentProvider = getSessionProviderForFabricEnvironment(currentEnv.env);
        const fullScope = [...this.vscodeSessionScopes(currentEnv.clientId, tenantId), ...currentEnv.scopes, ...extraScopes ?? []];
        return this.getAccessToken(currentProvider, fullScope, options);
    }

    public getArmAccessToken(options: TokenRequestOptions, extraScopes?: string[], tenantId?: string): Promise<string | null> {
        const currentEnv = this.fabricEnvironmentProvider.getCurrent();
        const currentProvider = getSessionProviderForFabricEnvironment(currentEnv.env);
        const configuredAzureEnv = getConfiguredAzureEnv();
        const endpoint = configuredAzureEnv.resourceManagerEndpointUrl;

        const fullScope = [...this.vscodeSessionScopes(currentEnv.clientId, tenantId), endpoint + '.default', ...extraScopes ?? []];
        return this.getAccessToken(currentProvider, fullScope, options);
    }

    private vscodeSessionScopes(clientId: string, tenantId?: string): string[] {
        return [...this.vscodeClientScopes(clientId), ...this.vscodeTenantScopes(tenantId)];
    }

    private vscodeClientScopes(clientId?: string): string[] {
        if (!clientId) {
            return [];
        }
        return [`VSCODE_CLIENT_ID:${clientId}`];
    }

    private vscodeTenantScopes(tenantId?: string): string[] {
        return [
            tenantId ? `VSCODE_TENANT:${tenantId}` : 'VSCODE_TENANT:organizations',
        ];
    }

    private async getAccessToken(providerId: string, scopes: string[], options: TokenRequestOptions): Promise<string | null> {
        const session = await this.getSession(providerId, scopes, options);
        return session?.accessToken ?? null;
    }

    private async getSession(providerId: string, scopes: string[], options: TokenRequestOptions): Promise<vscode.AuthenticationSession | undefined> {
        const start = Date.now();
        let succeeded = false;
        let errorMessage: string | undefined;
        let session: vscode.AuthenticationSession | undefined;
        const originalForceNew = options.forceNewSession;
        try {
            if (!options || !options.callerId?.trim() || !options.requestReason?.trim()) {
                throw new Error('Please provide callerId and requestReason in TokenRequestOptions');
            }

            // Optimize: attempt silent existing session if createIfNone specified to avoid UI before instrumentation.
            if (options.createIfNone && !options.forceNewSession) {
                const silentSession = await this.authentication?.getSession(providerId, scopes, { silent: true });
                if (silentSession) {
                    session = silentSession;
                    succeeded = true;
                    return silentSession; // still log telemetry in finally
                }
                else {
                    options.createIfNone = false; // we will attempt interactive (force new)
                    options.forceNewSession = true;
                }
            }

            if (options.forceNewSession === true) {
                options.forceNewSession = { detail: options.requestReason };
            }

            session = await this.authentication?.getSession(providerId, scopes, options);
            succeeded = !!session;
            return session;
        }
        catch (error: unknown) {
            errorMessage = (error instanceof Error ? error.message : String(error));
            const message = `Error getting session for ${options?.callerId}: ${error}`;
            this.logger.log(message, LogImportance.high);

            const wrappedError = error instanceof Error ? error : new Error(String(error ?? message));
            this.logger.reportExceptionTelemetryAndLog('getSession', 'auth-error', wrappedError, this.telemetryService, { callerId: options?.callerId });
        }
        finally {
            const duration = Date.now() - start;
            try {
                // Emit unified auth/get-session event for both silent and interactive attempts.
                this.telemetryService?.sendTelemetryEvent('auth/get-session', {
                    succeeded: succeeded ? 'true' : 'false',
                    // capture original intent vs final
                    createIfNone: originalForceNew ? 'false' : (options.createIfNone ? 'true' : 'false'),
                    forceNewSession: originalForceNew ? 'true' : (options.forceNewSession ? 'true' : 'false'),
                    silent: (!originalForceNew && !options.forceNewSession && !options.createIfNone) ? 'true' : 'false',
                    clearSessionPreference: (options as any).clearSessionPreference ? 'true' : 'false',
                    providerId: providerId,
                    scopes: scopes.join(','),
                    callerId: options.callerId,
                    success: succeeded ? 'true' : 'false',
                    tenantId: scopes.find(s => s.startsWith('VSCODE_TENANT:'))?.replace('VSCODE_TENANT:', '') ?? '',
                    error: errorMessage ?? ''
                }, {
                    activityDurationInMilliseconds: duration,
                    startTimeInMilliseconds: start,
                    endTimeInMilliseconds: Date.now()
                });
            }
            catch { /* swallow telemetry exceptions */ }
        }
    }

    private fireUpdate(providerId: string) {
        // We only care about the MS sessions
        switch (providerId) {
            case msSessionProvider:
            case msSessionProviderPPE:
                this.msSessionChangedEmitter.fire();
                break;
            default:
                break;
        }
    }

    public dispose(): void {
        this.msSessionChangedEmitter.dispose();
        this.sessionsChangeEventHandle.dispose();
    }
}

export interface VsCodeAuthentication {
    getSession(
        providerId: string,
        scopes: readonly string[],
        options: vscode.AuthenticationGetSessionOptions,
    ): Thenable<vscode.AuthenticationSession | undefined>

    onDidChangeSessions: vscode.Event<vscode.AuthenticationSessionsChangeEvent>
}

export class DefaultVsCodeAuthentication implements VsCodeAuthentication {
    getSession(providerId: string, scopes: readonly string[], options: vscode.AuthenticationGetSessionOptions) {
        return vscode.authentication.getSession(providerId, scopes, options);
    }

    onDidChangeSessions: vscode.Event<vscode.AuthenticationSessionsChangeEvent> = vscode.authentication.onDidChangeSessions;
}
