// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { TaskHelperWithTimeout } from './TaskHelperWithTimeout';
import { TelemetryService } from './telemetry/TelemetryService';
import { ILogger } from './logger/Logger';

/**
 * Utility functions that are useful for both core Fabric and satellite extensions.
 */

/**
 * Pauses execution for the specified number of milliseconds.
 * @param msecs - Number of milliseconds to sleep
 * @returns Promise that resolves after the specified delay
 */
export function sleep(msecs: number): Promise<any> {
    return new Promise((resolve) => setTimeout(resolve, msecs));
}

/**
 * Executes a task with a timeout, racing the task against a timer.
 * @param task - The promise to execute
 * @param msecs - Timeout in milliseconds
 * @param timeoutReason - Description of what timed out for error reporting
 * @returns Promise that resolves with the task result or rejects on timeout
 */
export async function doTaskWithTimeout(
    task: Promise<any>,
    msecs: number,
    timeoutReason: string
): Promise<any> {
    const helper = new TaskHelperWithTimeout();
    let result = await helper.wrap(task, msecs, timeoutReason);
    return result;
}

/**
 * Safely parses a JSON string with error logging and telemetry.
 * @param description - Description of what is being parsed for error context
 * @param jsonstring - The JSON string to parse
 * @param logger - Logger instance for error reporting
 * @param telemetryService - Telemetry service for error tracking
 * @returns The parsed JSON object
 * @throws Re-throws the original JSON parse error after logging
 */
export function doJSONParse(description: string, jsonstring: string, logger: ILogger, telemetryService: TelemetryService | null): any {
    try {
        return JSON.parse(jsonstring);
    }
    catch (error) {
        logger?.reportExceptionTelemetryAndLog(description, 'json-parse', error, telemetryService);
        throw error;
    }
}

/**
 * Parses a URI path of the form ".../Name.Type" and returns [displayName, type].
 * If a .platform file exists in the same directory, returns [displayName, type] from the file.
 * Returns undefined if neither method yields valid data.
 */
export async function tryParseLocalProjectData(
    uri: vscode.Uri,
    fileSystem: vscode.FileSystem = vscode.workspace.fs
): Promise<{ displayName: string; type: string } | undefined> {
    try {
        // Read the .platform file if it exists
        const platformUri = vscode.Uri.joinPath(uri, '.platform');
        const platformData = await fileSystem.readFile(platformUri);
        const platformJson = JSON.parse(Buffer.from(platformData).toString('utf8'));
        const displayName = platformJson?.metadata?.displayName;
        const type = platformJson?.metadata?.type;
        if (displayName && type) {
            return { displayName, type };
        }
    }
    catch {
        // Ignore errors and fall back to path parsing
    }

    try {
        // Parse the URI path manually to avoid Node.js 'path' module dependency
        // URI paths use forward slashes regardless of platform
        const uriPath = uri.path;
        const lastSlashIndex = uriPath.lastIndexOf('/');
        const lastSegment = lastSlashIndex >= 0 ? uriPath.substring(lastSlashIndex + 1) : uriPath;
        const lastDotIndex = lastSegment.lastIndexOf('.');

        if (lastDotIndex > 0) {
            const displayName = lastSegment.substring(0, lastDotIndex);
            const type = lastSegment.substring(lastDotIndex + 1);
            if (displayName && type) {
                return { displayName, type };
            }
        }
    }
    catch {
        // If parsing fails, return undefined
    }
    return undefined;
}
