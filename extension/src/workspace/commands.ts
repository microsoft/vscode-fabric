// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { commandNames } from '../constants';
import { showSignInPrompt } from '../ui/prompts';
import { WorkspaceManagerBase, UnlicensedUserError } from './WorkspaceManager';
import { WorkspaceTreeNode } from './treeNodes/WorkspaceTreeNode';
import { DefinitionFileTreeNode } from './treeNodes/DefinitionFileTreeNode';
import { showCreateWorkspaceWizard } from '../ui/showCreateWorkspaceWizard';
import { IFabricApiClient, IWorkspace, IWorkspaceManager, PayloadType } from '@microsoft/vscode-fabric-api';
import { TelemetryService, ILogger, IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { IAccountProvider } from '../authentication/interfaces';
import { ICapacityManager } from '../CapacityManager';
import { IWorkspaceFilterManager } from './WorkspaceFilterManager';

let workspaceCommandDisposables: vscode.Disposable[] = [];

function registerCommand<T>(
    commandName: string,
    callback: (...args: any[]) => Promise<T>,
    context: vscode.ExtensionContext
): void {
    const disposable = vscode.commands.registerCommand(commandName, callback);
    context.subscriptions.push(disposable);
    workspaceCommandDisposables.push(disposable);
}

export function registerWorkspaceCommands(
    context: vscode.ExtensionContext,
    auth: IAccountProvider,
    workspaceManager: WorkspaceManagerBase,
    capacityManager: ICapacityManager,
    telemetryService: TelemetryService  | null,
    logger: ILogger,
    workspaceFilterManager: IWorkspaceFilterManager,
    fabricEnvironmentProvider: IFabricEnvironmentProvider
): void {

    // Dispose of any existing commands
    workspaceCommandDisposables.forEach(disposable => disposable.dispose());
    workspaceCommandDisposables = [];

    registerCommand(commandNames.signIn, async () => {
        await auth.signIn();
        // Check if user has a Fabric license, and trigger signup only if needed
        await checkLicenseAndSignUpIfNeeded(auth, fabricEnvironmentProvider, telemetryService, logger, workspaceManager);
    }, context);

    registerCommand(commandNames.createWorkspace, async () => {
        return await createWorkspace(workspaceManager, workspaceFilterManager, capacityManager, telemetryService, logger);
    }, context);

    registerCommand(commandNames.filterWorkspaces, async () => {
        await workspaceFilterManager.showWorkspaceFilterDialog();
    }, context);

    registerCommand(commandNames.clearWorkspaceFilter, async () => {
        await workspaceFilterManager.clearFilters();
    }, context);
}

/**
 * If logged in, allows the user to enter a the name of a new workspace to create along with the capacity to use for the new workspace
 * @param manager Handles the Fabric workspaces for the user
 */
async function createWorkspace(manager: WorkspaceManagerBase, workspaceFilterManager: IWorkspaceFilterManager, capacityManager: ICapacityManager, telemetryService: TelemetryService | null, logger: ILogger): Promise<IWorkspace | undefined> {
    try {
        if (!(await manager.isConnected())) {
            await showSignInPrompt();
            return;
        }

        const createdWorkspace: IWorkspace | undefined = await showCreateWorkspaceWizard(manager as unknown as IWorkspaceManager, capacityManager, telemetryService, logger);
        if (createdWorkspace) {
            await workspaceFilterManager.addWorkspaceToFilters(createdWorkspace.objectId);
        }

        return createdWorkspace;
    }
    catch (error: any) {
        void vscode.window.showErrorMessage(error.message);
        logger.reportExceptionTelemetryAndLog('createWorkspace', 'workspace/create', error, telemetryService);
    }
}

/**
 * If a workspace has been selected, shows the user to select a local folder to associate with the workspace
 * @param manager Handles the Fabric workspaces for the user
 * @param treeNode Optional workspace tree node from context menu, contains the workspace to associate with a local folder
 */
async function selectLocalFolder(manager: WorkspaceManagerBase, treeNode?: WorkspaceTreeNode): Promise<vscode.Uri | undefined> {
    if (!(await manager.isConnected())) {
        await showSignInPrompt();
        return;
    }

    // If called from context menu, use the workspace from the tree node
    if (treeNode && treeNode.workspace) {
        return await manager.promptForLocalFolder(treeNode.workspace);
    }

    // If called from command palette without workspace context, show an error message
    void vscode.window.showErrorMessage(vscode.l10n.t('Please right-click on a workspace in the Fabric explorer to associate it with a local folder.'));
    return undefined;
}

/**
 * Checks if the user has a Fabric license and triggers signup only if they don't
 * @param auth The account provider to get session information
 * @param fabricEnvironmentProvider The environment provider to get portal URI
 * @param telemetryService The telemetry service for tracking signup initiation
 * @param logger The logger for error reporting
 * @param workspaceManager The workspace manager to check license status
 */
async function checkLicenseAndSignUpIfNeeded(
    auth: IAccountProvider,
    fabricEnvironmentProvider: IFabricEnvironmentProvider,
    telemetryService: TelemetryService | null,
    logger: ILogger,
    workspaceManager: WorkspaceManagerBase
): Promise<void> {
    try {
        // Try to list workspaces to check if user has a Fabric license
        await workspaceManager.listWorkspaces();
        // If successful, user has a license, no need to signup
        logger.log('User has a Fabric license, skipping signup');
    }
    catch (error: any) {
        const isUnlicensedError = error instanceof UnlicensedUserError;

        if (isUnlicensedError) {
            logger.info('User does not have a Fabric license, opening signup page');
            await signUpForFabric(auth, fabricEnvironmentProvider, telemetryService, logger);
        }
        else {
            // For other errors, just log them - don't trigger signup
            logger.info(`Error checking Fabric license: ${error?.message}`);
        }
    }
}

/**
 * Opens the Fabric trial signup page in the user's browser with pre-filled information
 * @param auth The account provider to get session information
 * @param fabricEnvironmentProvider The environment provider to get portal URI
 * @param telemetryService The telemetry service for tracking signup initiation
 * @param logger The logger for error reporting
 */
async function signUpForFabric(
    auth: IAccountProvider,
    fabricEnvironmentProvider: IFabricEnvironmentProvider,
    telemetryService: TelemetryService | null,
    logger: ILogger
): Promise<void> {
    try {
        const sessionInfo = await auth.getSessionInfo();
        const environment = fabricEnvironmentProvider.getCurrent();
        const portalUri = environment.portalUri;
        const loginHint = sessionInfo?.account?.label || '';
        const vscodeApp = vscode.env.appName;

        const signupUrl = `https://${portalUri}/autoSignUp?clientApp=vscode&loginHint=${encodeURIComponent(loginHint)}&vscodeApp=${encodeURIComponent(vscodeApp)}`;

        await vscode.env.openExternal(vscode.Uri.parse(signupUrl));

        telemetryService?.sendTelemetryEvent('fabric/signUpInitiated', {
            portalUri,
            vscodeApp,
            hasLoginHint: loginHint,
        });
    }
    catch (error: any) {
        const errorMessage: string = error instanceof Error ? error.message : String(error);

        telemetryService?.sendTelemetryErrorEvent(error, {
            errorEventName: 'fabric/signUpError',
            fault: errorMessage,
        });

        logger.error(`Error occurred in signUpForFabric: ${errorMessage}`);
        void vscode.window.showErrorMessage(vscode.l10n.t('Failed to open Fabric signup pagee'));
    }
}
