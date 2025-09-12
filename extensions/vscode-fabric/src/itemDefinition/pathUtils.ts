import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Joins a relative item definition path to a destination URI and ensures the result is within the destination directory or its subdirectories.
 * Throws an Error if the resulting URI is outside the destination directory, is absolute, or uses traversal.
 * @param partPath The relative path from the item definition.
 * @param destination The target directory URI.
 * @returns The joined file URI.
 * @throws Error if the path is unsafe or outside the destination.
 */
export function getItemDefinitionPathUri(partPath: string, destination: vscode.Uri): vscode.Uri {
    if (!partPath) {
        throw new Error('Missing file path');
    }
    // Strictly block absolute paths and traversal
    if (path.isAbsolute(partPath) ||
        partPath.startsWith('..') ||
        partPath.includes('../') ||
        partPath.includes('..\\')) {
        throw new Error(`Unsafe file path detected: ${partPath}`);
    }
    // Normalize and remove leading './'
    const normalized = path.normalize(partPath).replace(/^(\.\/|\.\\)+/, '');
    const fileUri = vscode.Uri.joinPath(destination, normalized);

    // Ensure fileUri is within destination (root or subdirectory)
    const destPath = destination.fsPath.endsWith(path.sep) ? destination.fsPath : destination.fsPath + path.sep;
    if (!fileUri.fsPath.startsWith(destPath)) {
        throw new Error(`Unsafe file path detected: ${partPath}`);
    }
    return fileUri;
}
