// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

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

    // Normalize to POSIX-style separators for cross-platform/web compatibility.
    const normalizedInput = partPath.replace(/\\/g, '/');

    // Block absolute paths (POSIX and Windows drive format).
    if (normalizedInput.startsWith('/') || /^[A-Za-z]:/.test(normalizedInput)) {
        throw new Error(`Unsafe file path detected: ${partPath}`);
    }

    // Remove leading './' segments and normalize duplicate separators.
    const trimmed = normalizedInput.replace(/^(\.\/)+/, '').replace(/\/+/g, '/');
    const segments = trimmed.split('/').filter(segment => segment.length > 0);

    // Block traversal after normalization.
    if (segments.some(segment => segment === '..')) {
        throw new Error(`Unsafe file path detected: ${partPath}`);
    }

    const fileUri = vscode.Uri.joinPath(destination, ...segments);

    // Ensure fileUri is within destination (root or subdirectory)
    const destinationPath = destination.path.endsWith('/') ? destination.path : `${destination.path}/`;
    if (fileUri.path !== destination.path && !fileUri.path.startsWith(destinationPath)) {
        throw new Error(`Unsafe file path detected: ${partPath}`);
    }

    return fileUri;
}
