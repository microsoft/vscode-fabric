// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IFabricExtensionServiceCollection } from '@microsoft/vscode-fabric-api';
import {
    FabricUriHandler,
    TelemetryService,
    TelemetryActivity,
    ILogger,
    doFabricAction,
} from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from './TelemetryEventNames';
import { WorkspaceManager } from './workspace/WorkspaceManager';

/**
 * Extension-specific URI handler that extends the base FabricUriHandler
 * to handle signup completion callbacks with custom notifications.
 */
export class ExtensionUriHandler extends FabricUriHandler {
    constructor(
        private core: IFabricExtensionServiceCollection,
        telemetry: TelemetryService | null,
        logger: ILogger
    ) {
        super(telemetry, logger);
    }

    override async handleUri(uri: vscode.Uri): Promise<void> {
        const searchParams = new URLSearchParams(uri.query);

        // Check if this is a signup completion callback
        const signupComplete = searchParams.get('signedUp');
        if (signupComplete === '1') {
            const activity = new TelemetryActivity<CoreTelemetryEventNames>('fabric/signUpCompleted', this.telemetry);
            return doFabricAction({ fabricLogger: this.logger, telemetryActivity: activity }, async () => {
                await this.handleSignupCompletion(searchParams, activity);
            });
        }

        // Delegate to base class for standard artifact opening
        return super.handleUri(uri);
    }

    private async handleSignupCompletion(searchParams: URLSearchParams, activity: TelemetryActivity<CoreTelemetryEventNames>): Promise<void> {
        this.logger.info('Signup completion callback received');
        activity.addOrUpdateProperties({
            'targetEnvironment': 'signupCallback',
            'uriQuery': searchParams.toString(),
        });

        // Refresh the workspace manager to reload workspaces
        // Cast to any to access the concrete implementation method
        // TODO: Expose a proper method in the interface
        const workspaceManager = this.core.workspaceManager as WorkspaceManager;
        if (typeof workspaceManager.refreshConnectionToFabric === 'function') {
            await workspaceManager.refreshConnectionToFabric(true);
        }

        // Show the Fabric remote view
        await vscode.commands.executeCommand('workbench.view.extension.vscode-fabric_view_workspace');

        // Check if a license was auto-assigned
        const autoAssigned = searchParams.get('autoAssigned');
        if (autoAssigned === '1') {
            const title = vscode.l10n.t('Microsoft Fabric (Free) license assigned. You\'re signed in and can now create and explore Fabric items.');
            const learnMoreLabel = vscode.l10n.t('Learn More');
            const privacyStatementLabel = vscode.l10n.t('Privacy Statement');

            const selection = await vscode.window.showInformationMessage(
                title,
                learnMoreLabel,
                privacyStatementLabel
            );

            if (selection === learnMoreLabel) {
                await vscode.env.openExternal(vscode.Uri.parse('https://go.microsoft.com/fwlink/?linkid=2147433'));
            }
            else if (selection === privacyStatementLabel) {
                await vscode.env.openExternal(vscode.Uri.parse('https://go.microsoft.com/fwlink/?linkid=521839'));
            }
        }
    }
}
