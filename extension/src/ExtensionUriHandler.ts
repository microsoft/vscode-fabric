// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IFabricExtensionServiceCollection } from '@microsoft/vscode-fabric-api';
import {
    FabricUriHandler,
    TelemetryService,
    TelemetryActivity,
    IFabricEnvironmentProvider,
    IConfigurationProvider,
    ILogger,
    doFabricAction,
} from '@microsoft/vscode-fabric-util';
import { WorkspaceManager } from './workspace/WorkspaceManager';

/**
 * Extension-specific URI handler that extends the base FabricUriHandler
 * to handle signup completion callbacks with custom notifications.
 */
export class ExtensionUriHandler extends FabricUriHandler {
    constructor(
        core: IFabricExtensionServiceCollection,
        telemetry: TelemetryService | null,
        logger: ILogger,
        fabricEnvironmentProvider: IFabricEnvironmentProvider,
        configProvider: IConfigurationProvider
    ) {
        super(core, telemetry, logger, fabricEnvironmentProvider, configProvider);
    }

    override handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
        const searchParams = new URLSearchParams(uri.query);

        // Check if this is a signup completion callback
        const signupComplete = searchParams.get('signedUp');
        if (signupComplete === '1') {
            const activity = new TelemetryActivity('fabric/signUpCompleted', this.telemetry);
            return doFabricAction({ fabricLogger: this.logger, telemetryActivity: activity }, async () => {
                await this.handleSignupCompletion(searchParams, activity);
            });
        }

        // Delegate to base class for standard artifact opening
        return super.handleUri(uri);
    }

    private async handleSignupCompletion(searchParams: URLSearchParams, activity: TelemetryActivity): Promise<void> {
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
            const learnMoreMessage = vscode.l10n.t('We\'ve assigned you a Microsoft Fabric (Free) license for personal use. You\'re signed in and can create and explore Fabric items. [Learn More...](https://aka.ms/fabric-trial)');
            void vscode.window.showInformationMessage(learnMoreMessage);
        }
        else {
            void vscode.window.showInformationMessage(vscode.l10n.t('Welcome to Microsoft Fabric! Your account setup is complete.'));
        }
    }
}
