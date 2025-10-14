// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

/**
 * Test utility functions for extension activation and management
 */

/**
 * Activates the core Fabric extension and returns its exports
 * @returns Promise resolving to the core extension's exported API
 * @throws Error if the extension cannot be found or activated
 */
export async function activateCore(): Promise<any> {
    const extensionId = 'fabric.vscode-fabric';
    const extension = vscode.extensions.getExtension(extensionId);

    if (extension) {
        await extension.activate();
        const exports = extension.exports;
        console.log(exports);

        return exports;
    }
    else {
        throw new Error('Failed to activate core extension');
    }
}

/**
 * Activates the UDF (User Defined Functions) extension and returns its exports
 * @deprecated Move to functions extension
 * @returns Promise resolving to the UDF extension's exported API
 * @throws Error if the extension cannot be found or activated
 */
export async function activateUdf(): Promise<any> {
    const extensionId = 'fabric.vscode-fabric-functions';
    const extension = vscode.extensions.getExtension(extensionId);

    if (extension) {
        await extension.activate();
        const exports = extension.exports;
        console.log(exports);

        return exports;
    }
    else {
        throw new Error('Failed to activate UDF extension');
    }
}
