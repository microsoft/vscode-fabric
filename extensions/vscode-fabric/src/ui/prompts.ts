import * as vscode from 'vscode';

import { commandNames } from '../constants';

/**
 * Shows a modal dialog requesting the user to sign in to Fabric. The user can select a Sign in Button which will execute the command
 */
export async function showSignInPrompt() {
    const signInAction = vscode.l10n.t('Sign in');
    await vscode.window.showInformationMessage(vscode.l10n.t('Please sign in to Fabric'), { modal: true }, signInAction).then(async (selection) => {
        if (selection === signInAction) {
            await vscode.commands.executeCommand(commandNames.signIn);
        }
    });
}

/**
 * Shows a modal dialog requesting the user to select a workspace. The user can select a 'Select Workspace' button which will execute the command
 */
export async function showSelectWorkspacePrompt() {
    const selectWorkspaceAction = vscode.l10n.t('Select workspace');
    await vscode.window.showInformationMessage(vscode.l10n.t('Please select a Fabric workspace'), { modal: true }, selectWorkspaceAction).then(async (selection) => {
        if (selection === selectWorkspaceAction) {
            await vscode.commands.executeCommand(commandNames.openWorkspace);
        }
    });
}

