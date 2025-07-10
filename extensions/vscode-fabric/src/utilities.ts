import * as vscode from 'vscode';
import { IApiClientResponse, IApiClientRequestOptions, IFabricApiClient } from '@fabric/vscode-fabric-api';
import { sleep, FabricError, TelemetryActivity } from '@fabric/vscode-fabric-util';

/**
 * Checks whether or not the given URI is a directory. Symbolic links to directories will not be considered directories
 * @param fs The file system to use for checking the URI
 * @param uri The URI to check
 * @param defaultValue The value to return if the URI cannot be checked (e.g., if it does not exist). Defaults to false
 * @returns True if the URI is a directory, false otherwise
 */
export async function isDirectory(fs: vscode.FileSystem, uri: vscode.Uri, defaultValue: boolean = false): Promise<boolean> {
    try {
        const stat = await fs.stat(uri);
        return stat.type === vscode.FileType.Directory;
    }
    catch (error) {
        return defaultValue;
    }
}

/**
 * Checks if the specified URI is contained within the workspace folders.
 * The check is recursive
 * @param uri The URI to check
 * @returns True if the URI is contained in the workspace folders, false otherwise
 */
export function workspaceContainsDirectory(uri: vscode.Uri): boolean {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return false;
    }

    for (const folder of vscode.workspace.workspaceFolders) {
        if (folder.uri.fsPath === uri.fsPath) {
            return true;
        }
        // Check if the folder is a parent of the URI
        if (uri.fsPath.startsWith(folder.uri.fsPath + vscode.Uri.file('/').fsPath)) {
            return true;
        }
    }
    return false;
}

/**
 * Checks if the response indicates a successful operation. 
 * The expectation is that any status code in the range of 200-299 is considered successful
 * @param response The response to check
 */
export function succeeded(response: IApiClientResponse): boolean {
    return response.status >= 200 && response.status < 300;
}

/**
 * Generates a formatted message for the given error code and message
 * @param operation The operation that was attempted
 * @param response The result of a failed API call
 */
export function formatErrorResponse(operation: string, response: IApiClientResponse): string {
    const msg =
        response.parsedBody?.message ??
        response.parsedBody?.errorCode ??
        response.status;
    // Only include status in the message if it's not already the fallback
    const formattedMsg = typeof msg === 'number'
        ? `${operation} (${msg})`
        : `${operation} (${response.status}): ${msg}`;
    return formattedMsg;
}

/**
 * Handles error responses for artifact creation operations.
 * Shows appropriate error messages with learn more links based on error codes.
 * @param response The failed API response
 * @param artifactDisplayName The display name of the artifact that failed to create
 * @param artifactType The type of artifact that failed to create
 * @param activity The telemetry activity to update with error properties
 * @throws FabricError with appropriate configuration for user notifications
 */
export async function handleArtifactCreationErrorAndThrow(
    response: IApiClientResponse,
    artifactDisplayName: string,
    artifactType: string,
    activity: TelemetryActivity<any>
): Promise<void> {
    activity.addOrUpdateProperties({
        'requestId': response.parsedBody?.requestId,
        'errorCode': response.parsedBody?.errorCode,
    });
    let urlLearnMore: vscode.Uri | undefined = undefined;
    
    if (response.status >= 400 && response.status < 500) { //400 == bad request. Show user error message and learn more link
        switch (response.parsedBody?.errorCode) {
            case 'UnsupportedCapacitySKU':
            case 'CapacityNotActive':
            case 'WorkspaceHasNoCapacityAssigned':
                urlLearnMore = vscode.Uri.parse('https://aka.ms/SupportedCapacitySkus');
                break;
            case 'FeatureNotAvailable':
            case 'UnknownError': // internally FabricArtifactCreationRestrictedException surfaces as UnknownError: see bug Bug 1685840: Telemetry UDF Creation Unknown Error in PROD  An unexpected error occurred while processing the request
                urlLearnMore = vscode.Uri.parse('https://aka.ms/fabric/vscode-docs'); // currently points to create UDF, not any Fabric type
                break;
            case 'ItemDisplayNameAlreadyInUse':
            case 'ItemDisplayNameNotAvailableYet':
            default:
                break;
        }
        
        if (urlLearnMore) {
            const learnMoreAction = vscode.l10n.t('Learn more');
            const errorMessage = vscode.l10n.t('Failed to create "{0}": {1}', artifactDisplayName, response.parsedBody?.errorCode);
            void vscode.window.showErrorMessage( // don't wait for the message to be dismissed
                errorMessage,
                // { modal: true },
                learnMoreAction
            ).then(async (selection) => {
                if (selection === learnMoreAction) {
                    await vscode.env.openExternal(urlLearnMore!);
                }
            });
        }
    }
    
    throw new FabricError(
        `Create Artifact '${artifactDisplayName}' failed: ${response.status} ${response.response?.bodyAsText}`,
        `Create Artifact failed ${artifactType} ${response.status} ${response.parsedBody?.errorCode ?? ''}`,
        { showInUserNotification: !urlLearnMore ? 'Error' : 'None', showInFabricLog: true }
    );
}

/**
 * Handles a long running operation (LRO) by polling the status of the operation until it completes.
 * If the initial response indicates that the operation is still in progress (HTTP 202),
 * it will poll the provided location URL until the operation is either succeeded or failed.
 * @param apiClient The Fabric API client to use for sending requests
 * @param response The first response from the long running operation
 * @returns The final response from the API after the operation completes
 */
export async function handleLongRunningOperation(apiClient: IFabricApiClient, response: IApiClientResponse): Promise<IApiClientResponse> {
    if (response.status === 202) {
        const location = response.headers?.get('location');
        const retryAfterSeconds: number = parseInt(response.headers?.get('retry-after') ?? '0');
        const operationId = response.headers?.get('x-ms-operation-id');

        if (location && operationId) {
            let request: IApiClientRequestOptions = {
                method: 'GET',
                url: location,
            };

            // Observation: the operation is often ready faster than the header would indicate. Lets poll 5x more frequently
            const sleepDurationSeconds = Math.max(Math.floor(retryAfterSeconds / 5), 1);
            
            // Poll for the operation to complete
            do {
                if (sleepDurationSeconds > 0) {
                    await sleep(sleepDurationSeconds * 1000);
                }
                response = await apiClient.sendRequest(request);

            } while (response.parsedBody?.status !== 'Succeeded' && response.parsedBody?.status !== 'Failed');

            // Send another request to get the actual result
            request = {
                method: 'GET',
                url: `${location}/result`,
            };
            response = await apiClient.sendRequest(request);
        }
    }

    return response;
}