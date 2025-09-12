import * as vscode from 'vscode';
import * as path from 'path';

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
        const parsedPath = path.parse(uri.path);
        if (parsedPath.name && parsedPath.ext && parsedPath.ext.length > 1) {
            // Remove leading dot from ext
            const type = parsedPath.ext.substring(1);
            const displayName = parsedPath.name;
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
