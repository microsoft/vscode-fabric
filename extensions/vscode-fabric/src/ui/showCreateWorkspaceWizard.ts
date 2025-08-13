import * as vscode from 'vscode';

import { IApiClientRequestOptions, IFabricApiClient, IApiClientResponse, IWorkspace, IWorkspaceManager } from '@fabric/vscode-fabric-api';
import { TelemetryActivity, TelemetryService, doFabricAction, ILogger, UserCancelledError, FabricError } from '@fabric/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../TelemetryEventNames';
import { NotSignedInError } from './NotSignedInError';
import { ICapacityManager, ICapacity } from '../CapacityManager';
import { formatErrorResponse } from '../utilities';

/**
 * Gathers information from the user for creating a new workspace, then creates the workspace.
 * 
 * @param workspaceManager The workspace manager
 * @param apiClient The API client
 * @param telemetryService The telemetry service
 * @param logger The logger
 * 
 * @returns The created workspace or undefined if cancelled
 *
 * @throws A {@link NotSignedInError} If the user is not signed in to Fabric.
 * @throws An error if no capacities are available or if the workspace creation fails.
*/
export async function showCreateWorkspaceWizard(
    workspaceManager: IWorkspaceManager,
    capacityManager: ICapacityManager,
    telemetryService: TelemetryService | null,
    logger: ILogger
): Promise<IWorkspace | undefined> {
    if (!(await workspaceManager.isConnected())) {
        throw new NotSignedInError();
    }

    // Step 1: Get a new workspace name from the user
    const workspaceName = await vscode.window.showInputBox({ prompt: 'Name', value: '', title: 'Create a workspace' });
    if (!workspaceName) {
        return undefined;
    }

    // Step 2: Show a quick pick to select the capacity
    const capacities: ICapacity[] = await capacityManager.listCapacities();
    const quickPickItems: CapacityQuickPickItem[] = [];
    const activeCapacities = capacities.filter(capacity => capacity.state === 'Active');
    activeCapacities.forEach(capacity => quickPickItems.push(new CapacityQuickPickItem(capacity.displayName, capacity.id)));
    quickPickItems.sort((a, b) => a.label.localeCompare(b.label));

    // TODO: What is the correct behavior if there are no active capacities?
    let selectedCapacity: CapacityQuickPickItem | undefined = capacities.length > 0 ? quickPickItems[0] : undefined;
    if (quickPickItems.length > 1) {
        selectedCapacity = await vscode.window.showQuickPick(quickPickItems, { title: vscode.l10n.t('Choose Capacity...'), canPickMany: false });
        if (!selectedCapacity) {
            return undefined;
        }
    }

    // Step 3: Create the workspace
    const createActivity = new TelemetryActivity<CoreTelemetryEventNames>('workspace/create', telemetryService);
    return await doFabricAction({ fabricLogger: logger, telemetryActivity: createActivity }, async () => {
        // Only include capacityId if selectedCapacity is defined
        const createOptions: any = selectedCapacity ? { capacityId: selectedCapacity.id } : {};
        const responseCreateWorkspace = await workspaceManager.createWorkspace(workspaceName, createOptions);
        createActivity.addOrUpdateProperties({
            'statusCode': responseCreateWorkspace.status.toString()
        });
        if (responseCreateWorkspace.status === 201) {
            const workspace = responseCreateWorkspace.parsedBody;
            createActivity.addOrUpdateProperties({
                'workspaceId': workspace.id,
                'fabricWorkspaceName': workspace.displayName,
            });
            // return the created workspace
            const newWorkspace: IWorkspace = {
                objectId: workspace.id,
                description: workspace.description,
                type: workspace.type,
                displayName: workspace.displayName,
                capacityId: workspace.capacityId
            };

            return newWorkspace;
        }
        else {
            throw new FabricError(
                formatErrorResponse(vscode.l10n.t('Unable to create workspace "{0}"', workspaceName), responseCreateWorkspace),
                responseCreateWorkspace.parsedBody?.errorCode || 'Error creating workspace',
                { showInUserNotification: 'Information' }
            );
        }
    });
}

class CapacityQuickPickItem implements vscode.QuickPickItem {
    constructor(public label: string, public id: string) {
    }

    description?: string;
    detail?: string;
}
