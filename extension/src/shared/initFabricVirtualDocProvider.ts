// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { Schema } from '@microsoft/vscode-fabric-api';

/**
 * Initializes the Fabric virtual document provider for displaying JSON content.
 * This provider handles the `fabricVirtualDoc` scheme and formats JSON content for display.
 */
export function initFabricVirtualDocProvider(context: vscode.ExtensionContext): void {
    const provider = new class implements vscode.TextDocumentContentProvider {
        provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
            const content = new URLSearchParams(uri.query).get('content') ?? '';
            let result = '';
            try {
                const jsconContent = JSON.parse(content);
                if (jsconContent.payloadContentType === 'InlineJson' && jsconContent.workloadPayload) { // expand stringified json
                    const jsPayload = JSON.parse(jsconContent.workloadPayload);
                    jsconContent.workloadPayload = jsPayload;
                }
                // Format all of the content and set indents & spacing to 2
                result += JSON.stringify(jsconContent, null, 2);
            }
            catch (error) {
                result = JSON.stringify(error);
            }
            return result;
        }
    };
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(Schema.fabricVirtualDoc, provider)
    );
}
