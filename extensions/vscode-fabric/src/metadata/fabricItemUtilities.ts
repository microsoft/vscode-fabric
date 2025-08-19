/* eslint-disable security/detect-object-injection */
import * as vscode from 'vscode';
import { IArtifact } from '@microsoft/vscode-fabric-api';
import { fabricItemMetadata } from './fabricItemMetadata';

export function getDisplayName(artifact: IArtifact | string): string {
    const artifactType: string = getArtifactTypeString(artifact);

    return fabricItemMetadata[artifactType]?.displayName ?? artifactType;
}

export function getDisplayNamePlural(artifact: IArtifact | string): string | undefined {
    const artifactType: string = getArtifactTypeString(artifact);

    return fabricItemMetadata[artifactType]?.displayNamePlural ?? artifactType;
}

export function getArtifactIconPath(baseUri: vscode.Uri, artifact: IArtifact | string): vscode.Uri | { light: vscode.Uri, dark: vscode.Uri } | undefined {
    if (!baseUri) {
        return undefined;
    }

    const artifactType: string = getArtifactTypeString(artifact);

    if (fabricItemMetadata[artifactType]?.iconInformation) {
        if (fabricItemMetadata[artifactType]?.iconInformation?.isThemed) {
            return getThemedArtifactIconPath(baseUri, fabricItemMetadata[artifactType]?.iconInformation?.fileName!);
        }
        else {
            return vscode.Uri.joinPath(baseUri, 'resources', 'artifacts', fabricItemMetadata[artifactType]?.iconInformation?.fileName!);
        }
    }

    return undefined;
}

export function getArtifactDefaultIconPath(baseUri: vscode.Uri): { light: vscode.Uri, dark: vscode.Uri } | undefined {
    return getThemedArtifactIconPath(baseUri, 'document_24.svg');
}

export function getArtifactExtensionId(artifact: IArtifact | string): string | undefined {
    const artifactType: string = getArtifactTypeString(artifact);

    return fabricItemMetadata[artifactType]?.extensionId;
}

export function getArtifactTypeFolder(artifact: IArtifact | string): string {
    const artifactType: string = getArtifactTypeString(artifact);

    const result = fabricItemMetadata[artifactType]?.portalFolder;
    if (result) {
        return result;
    }

    return `${artifactType}s`;
}

export function getSupportsArtifactWithDefinition(artifact: IArtifact | string): boolean {
    const artifactType: string = getArtifactTypeString(artifact);
    return !!fabricItemMetadata[artifactType]?.supportsArtifactWithDefinition;
}

function getThemedArtifactIconPath(baseUri: vscode.Uri, fileName: string): { light: vscode.Uri, dark: vscode.Uri } | undefined {
    if (!baseUri) {
        return undefined;
    }

    return {
        light: vscode.Uri.joinPath(baseUri, 'resources', 'light', 'artifacts', fileName),
        dark: vscode.Uri.joinPath(baseUri, 'resources', 'dark', 'artifacts', fileName)
    };
}

function getArtifactTypeString(artifact: IArtifact | string): string {
    if (typeof artifact === 'string') {
        return artifact as string;
    }

    return (artifact as IArtifact).type;
}

/* eslint-enable security/detect-object-injection */