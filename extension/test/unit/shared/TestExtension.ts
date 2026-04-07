// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { testApiVersion } from '../../../src/extensionManager/MockFabricExtensionManager';
import { IArtifactHandler, IFabricExtension, IFabricTreeNodeProvider, ILocalProjectTreeNodeProvider, ArtifactTreeNodeProvider, LocalProjectTreeNode } from '@microsoft/vscode-fabric-api';
import * as vscode from 'vscode';

export const satelliteExtensionIds = [
    'fabric-test.vscode-fabric-test-extension1',
    'fabric-test.vscode-fabric-test-extension2',
    'fabric-test.vscode-fabric-test-extension3',
];

/**
 * A test-only LocalProjectTreeNodeProvider that derives display name from the folder path
 * without hitting the filesystem (unlike the util version which reads .platform files).
 */
class TestLocalProjectTreeNodeProvider implements ILocalProjectTreeNodeProvider {
    constructor(private context: vscode.ExtensionContext, public artifactType: string) {}

    async createLocalProjectTreeNode(localPath: vscode.Uri): Promise<LocalProjectTreeNode | undefined> {
        const pathSegments = localPath.path.split('/');
        const lastSegment = pathSegments[pathSegments.length - 1] || '';
        const lastDotIndex = lastSegment.lastIndexOf('.');
        const displayName = lastDotIndex > 0 ? lastSegment.substring(0, lastDotIndex) : lastSegment;
        return new LocalProjectTreeNode(this.context, displayName, localPath);
    }
}

export class TestExtension implements IFabricExtension {
    static create(identity: string = satelliteExtensionIds[0], artifactTypes: string[] = ['test'], addContributions: boolean = false, apiVersion: string = testApiVersion): TestExtension {
        const extension = new TestExtension(identity, artifactTypes, apiVersion);
        if (addContributions) {
            artifactTypes.forEach(artifactType => {
                extension.artifactHandlers = [{ artifactType: artifactType }];
                extension.treeNodeProviders = [new ArtifactTreeNodeProvider(null!, artifactType)];
                extension.localProjectTreeNodeProviders = [new TestLocalProjectTreeNodeProvider(null!, artifactType)];
            });
        }

        return extension;
    }

    private constructor(public identity: string, public artifactTypes: string[], public apiVersion: string) { }

    public artifactHandlers?: IArtifactHandler[];
    public treeNodeProviders?: IFabricTreeNodeProvider[];
    public localProjectTreeNodeProviders?: ILocalProjectTreeNodeProvider[];
}
