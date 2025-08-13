import * as vscode from 'vscode';
import { NotSignedInError } from './NotSignedInError';
import { showCreateWorkspaceWizard } from './showCreateWorkspaceWizard';
import { IWorkspace, IWorkspaceManager } from '@fabric/vscode-fabric-api';
import { TelemetryService, ILogger } from '@fabric/vscode-fabric-util';
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

    let workspaces = await workspaceManager.listWorkspaces();
    // Sort all workspaces alphabetically
    workspaces = workspaces.sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    // Filter personal and non-personal workspaces
    const personalWorkspaces = workspaces.filter(w => w.type === 'Personal');
    const otherWorkspaces = workspaces.filter(w => w.type !== 'Personal');
    
    // Prepare items array with "Create new..." option first
    const workspaceItems: string[] = [];
    const createString = vscode.l10n.t('Create a new Fabric Workspace...');
    workspaceItems.push(`$(add) ${createString}`);
    
    // Add personal workspaces first, then others
    personalWorkspaces.forEach(w => workspaceItems.push(w.displayName));
    otherWorkspaces.forEach(w => workspaceItems.push(w.displayName));

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
