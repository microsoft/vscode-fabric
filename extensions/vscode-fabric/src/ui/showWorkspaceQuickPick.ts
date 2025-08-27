import * as vscode from 'vscode';
import { NotSignedInError } from './NotSignedInError';
import { showCreateWorkspaceWizard } from './showCreateWorkspaceWizard';
import { IWorkspace, IWorkspaceManager } from '@microsoft/vscode-fabric-api';
import { TelemetryService, ILogger } from '@microsoft/vscode-fabric-util';
import { ICapacityManager } from '../CapacityManager';

/**
 * Shows a selection list of available workspaces, including the option to create a new workspace.
 * 
 * @param workspaceManager Lists available workspaces
 * @param capacityManager Lists available capacities
 * @param telemetryService The telemetry service
 * @param logger The logger
 * 
 * @returns The selected workspace or undefined if cancelled
 * 
 * @throws A {@link NotSignedInError} If the user is not signed in to Fabric.
 */
export async function showWorkspaceQuickPick(
    workspaceManager: IWorkspaceManager,
    capacityManager: ICapacityManager,
    telemetryService: TelemetryService | null,
    logger: ILogger
): Promise<IWorkspace | undefined> {
    if (!(await workspaceManager.isConnected())) {
        throw new NotSignedInError();
    }

    const workspaces = await workspaceManager.listWorkspaces();
    
    // Prepare items array with "Create new..." option first
    const workspaceItems: string[] = [];
    const createString = vscode.l10n.t('Create a new Fabric Workspace...');
    workspaceItems.push(`$(add) ${createString}`);
    
    // Add workspaces (already sorted by listWorkspaces) - explicitly preserve order
    for (const workspace of workspaces) {
        workspaceItems.push(workspace.displayName);
    }

    const pick: string | undefined = await vscode.window.showQuickPick(workspaceItems, { canPickMany: false, placeHolder: 'Select Fabric workspace' });
    if (pick) {
        for (const workspace of workspaces) {
            if (workspace.displayName === pick) {
                return workspace;
            }
        }

        // User selected the Create new workspace option
        return showCreateWorkspaceWizard(workspaceManager, capacityManager, telemetryService, logger);
    }

    return undefined;
}
