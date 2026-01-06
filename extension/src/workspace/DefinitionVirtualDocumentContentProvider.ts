// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { DefinitionFileSystemProvider } from './DefinitionFileSystemProvider';

/**
 * Provides read-only text document content for definition files.
 * Uses the fabric-definition-virtual:// URI scheme.
 * Content is sourced from the DefinitionFileSystemProvider's cache.
 */
export class DefinitionVirtualDocumentContentProvider implements vscode.TextDocumentContentProvider {
    public static readonly scheme = 'fabric-definition-virtual';

    private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    constructor(private readonly fileSystemProvider: DefinitionFileSystemProvider) { }

    /**
     * Provides the content for a readonly definition file.
     * Converts the fabric-definition-virtual:// URI to fabric-definition:// to read from the cache.
     */
    provideTextDocumentContent(uri: vscode.Uri): string {
        // Convert readonly URI to regular definition URI to access the cached content
        const editableUri = uri.with({ scheme: 'fabric-definition' });

        try {
            const content = this.fileSystemProvider.readFile(editableUri);
            return new TextDecoder().decode(content);
        }
        catch (error) {
            return `// Error loading definition file: ${error}`;
        }
    }

    /**
    * Creates a readonly URI for a definition file.
    * @param workspaceId The workspace ID
    * @param artifactId The artifact ID
    * @param fileName The file name/path
    * @returns A URI with the fabric-definition-virtual scheme
    */
    static createUri(workspaceId: string, artifactId: string, fileName: string): vscode.Uri {
        return vscode.Uri.from({
            scheme: DefinitionVirtualDocumentContentProvider.scheme,
            path: `/${workspaceId}/${artifactId}/${fileName}`,
        });
    }

    /**
    * Notifies that a document has changed and should be refreshed.
    */
    refresh(uri: vscode.Uri): void {
        this._onDidChange.fire(uri);
    }
}
