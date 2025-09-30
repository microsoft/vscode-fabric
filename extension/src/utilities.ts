// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IApiClientResponse, IApiClientRequestOptions, IFabricApiClient } from '@microsoft/vscode-fabric-api';
import { sleep, FabricError, TelemetryActivity, ILogger, LogImportance } from '@microsoft/vscode-fabric-util';

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

// Allow tests to override the sleep implementation without stubbing global setTimeout (which can interfere with VS Code's scheduler)
let lroSleepImpl: (ms: number) => Promise<any> = sleep;
// eslint-disable-next-line @typescript-eslint/naming-convention
export function __setLroSleep(impl: (ms: number) => Promise<any>): void {
    lroSleepImpl = impl;
}

export async function handleLongRunningOperation(apiClient: IFabricApiClient, response: IApiClientResponse, logger?: ILogger): Promise<IApiClientResponse> {
    const trace = (message: string): void => {
        logger?.log(`[Fabric LRO2] ${message}`, LogImportance.normal);
    };

    // Preserve the original 202 response for fallback scenarios.
    const originalResponse: IApiClientResponse = response;

    if (response.status !== 202) {
        trace(`Initial response status ${response.status} is not 202; returning without polling.`);
        return response;
    }

    let location: string | undefined = response.headers?.get('location') || undefined;
    const operationId: string | undefined = response.headers?.get('x-ms-operation-id') || undefined;
    if (!location || !operationId) {
        trace('Missing required headers (location and/or x-ms-operation-id); returning original response.');
        return response;
    }

    trace(`Starting poll loop. location='${location}', operationId='${operationId}'.`);

    // Poll strategy: start fast (400ms) and exponential backoff up to a modest ceiling (10s) to reduce load.
    let waitMs: number = 400;
    const maxWaitMs: number = 10_000;
    const maxIterations: number = 600; // ~ >10 min worst case
    let iteration: number = 0;
    let lastSuccessfulPoll: IApiClientResponse = response;

    while (true) { // eslint-disable-line no-constant-condition
        iteration++;
        if (iteration > maxIterations) {
            trace(`Max iterations (${maxIterations}) reached; returning last successful poll (status ${lastSuccessfulPoll.status}).`);
            return lastSuccessfulPoll;
        }

        trace(`Iteration ${iteration}: sleeping ${waitMs}ms before polling '${location}'.`);
        await lroSleepImpl(waitMs);

        const pollRequest: IApiClientRequestOptions = { method: 'GET', url: location };
        let pollResponse: IApiClientResponse;
        try {
            pollResponse = await apiClient.sendRequest(pollRequest);
        }
        catch (e) {
            trace(`Iteration ${iteration}: poll failed with error ${(e as Error).message}; returning original 202 response.`);
            return originalResponse;
        }

        lastSuccessfulPoll = pollResponse;
        const operationStatus: string | undefined = pollResponse.parsedBody?.status;
        trace(`Iteration ${iteration}: httpStatus=${pollResponse.status}, opStatus='${operationStatus ?? 'n/a'}'.`);

        // Always adopt Location from the latest poll response if present.
        const latestLocation: string | undefined = pollResponse.headers?.get('location') || undefined;
        if (latestLocation && latestLocation !== location) {
            trace(`Iteration ${iteration}: Location header updated -> '${latestLocation}'.`);
            location = latestLocation;
        }

        // Terminal states handled separately for clearer logic.
        if (operationStatus === 'Failed') {
            // Simplified: assume error details are present under parsedBody.error
            const err = pollResponse.parsedBody?.error ?? {};
            const failedErrorCode: string | undefined = typeof err.errorCode === 'string' ? err.errorCode : undefined;
            const failedMessage: string | undefined = typeof err.message === 'string' ? err.message : undefined;
            trace(`Iteration ${iteration}: Failure details errorCode='${failedErrorCode ?? 'n/a'}' message='${failedMessage ?? 'n/a'}'.`);
            trace(`Iteration ${iteration}: Terminal status 'Failed'. Throwing FabricError.`);
            throw new FabricError(
                failedMessage ? `LRO failed: ${failedMessage}` : 'Long running operation failed',
                failedErrorCode ? `lrofailed/${failedErrorCode}` : 'lrofailed/unknown',
                { showInUserNotification: 'Error', showInFabricLog: true }
            );
        }

        if (operationStatus === 'Succeeded') {
            trace(`Iteration ${iteration}: Terminal status 'Succeeded'. Performing final fetch to latest location '${location}'.`);
            if (!location) {
                trace(`Iteration ${iteration}: No location available for final fetch; returning poll response.`);
                return pollResponse;
            }
            const finalRequest: IApiClientRequestOptions = { method: 'GET', url: location };
            const finalResponse = await apiClient.sendRequest(finalRequest);
            trace(`Iteration ${iteration}: Final fetch status ${finalResponse.status}; returning final response.`);
            return finalResponse;
        }

        // Backoff for next iteration.
        waitMs = Math.min(waitMs * 2, maxWaitMs);
    }
}
