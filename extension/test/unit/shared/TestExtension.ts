// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { testApiVersion } from '../../../src/extensionManager/MockFabricExtensionManager';
import { IArtifactHandler, IFabricExtension, IFabricTreeNodeProvider, ILocalProjectTreeNodeProvider, ArtifactTreeNodeProvider, LocalProjectTreeNodeProvider } from '@microsoft/vscode-fabric-api';

export const satelliteExtensionIds = [
    'fabric-test.vscode-fabric-test-extension1',
    'fabric-test.vscode-fabric-test-extension2',
    'fabric-test.vscode-fabric-test-extension3',
];

export class TestExtension implements IFabricExtension {
    static create(identity: string = satelliteExtensionIds[0], artifactTypes: string[] = ['test'], addContributions: boolean = false, apiVersion: string = testApiVersion): TestExtension {
        const extension = new TestExtension(identity, artifactTypes, apiVersion);
        if (addContributions) {
            artifactTypes.forEach(artifactType => {
                extension.artifactHandlers = [{ artifactType: artifactType }];
                extension.treeNodeProviders = [new ArtifactTreeNodeProvider(null!, artifactType)];
                extension.localProjectTreeNodeProviders = [new LocalProjectTreeNodeProvider(null!, artifactType)];
            });
        }

        return extension;
    }

    private constructor(public identity: string, public artifactTypes: string[], public apiVersion: string) { }

    public artifactHandlers?: IArtifactHandler[];
    public treeNodeProviders?: IFabricTreeNodeProvider[];
    public localProjectTreeNodeProviders?: ILocalProjectTreeNodeProvider[];
}
