import * as vscode from 'vscode';
import * as path from 'path';

export function tryParseArtifactType(uri: vscode.Uri): string | undefined {
    const parsedPath = path.parse(uri.path);
    if (parsedPath.ext && parsedPath.ext.length > 1) {
        return parsedPath.ext.substring(1);
    }
}
