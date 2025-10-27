// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { TelemetryService, ILogger, doFabricAction, FabricActionOptions, UserCancelledError, TelemetryActivity, TelemetryEventRecord } from '@microsoft/vscode-fabric-util';
import { IAccountProvider, ITenantSettings } from '../authentication/interfaces';

/**
 * Switches the active tenant for the user.
 *
 * Attempts to retrieve tenants from the account provider, which may require the user to sign in to Azure.
 * If no tenants are found or the user cancels, prompts for manual tenant entry.
 * Once a tenant is obtained, calls auth.signIn with the selected or entered tenant.
 * If sign-in is successful, refreshes the workspace manager connection.
 *
 * @param auth The account provider used for authentication and tenant management.
 */
export async function switchTenantCommand(auth: IAccountProvider, activity: TelemetryActivity<TelemetryEventRecord, string>): Promise<void> {
    // Variable to store the tenant ID to sign in with
    let tenantIdToSignIn: string | undefined;

    // see if we can get tenants from the account provider
    const tenants = await auth.getTenants();
    if (!tenants || tenants.length === 0) {
        // Use quickInput for manual tenant entry when no tenants are available
        tenantIdToSignIn = await vscode.window.showInputBox({
            prompt: vscode.l10n.t('Enter a tenant'),
            placeHolder: vscode.l10n.t('example: contoso.onmicrosoft.com'),
            title: vscode.l10n.t('Enter a tenant...'),
        });

        if (!tenantIdToSignIn || tenantIdToSignIn.trim() === '') {
            throw new UserCancelledError('tenantEntry');
        }
    }
    else {
        const currentTenant = await auth.getCurrentTenant();
        const tenantItems = tenants.map((tenant: ITenantSettings) => ({
            label: tenant.displayName || tenant.tenantId || vscode.l10n.t('Unknown tenant'),
            description: (tenant.defaultDomain || '') + (currentTenant && tenant.tenantId === currentTenant.tenantId ? vscode.l10n.t(' (currently active)') : ''),
            id: tenant.tenantId,
        }));

        const selectedTenant = await vscode.window.showQuickPick(tenantItems, {
            placeHolder: vscode.l10n.t('Select a tenant'),
            title: vscode.l10n.t('Switch tenant...'),
        });

        if (!selectedTenant) {
            throw new UserCancelledError('tenantSelection');
        }

        tenantIdToSignIn = selectedTenant.id;
    }

    const currentTenant = await auth.getCurrentTenant();
    const currentTenantId = currentTenant?.tenantId;

    // Only sign in if the tenant is different from the current one
    if (currentTenantId !== tenantIdToSignIn) {
        await auth.signIn(tenantIdToSignIn);
        activity.addOrUpdateProperties({ newTenantId: tenantIdToSignIn });
    }
}
