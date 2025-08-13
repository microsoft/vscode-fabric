# VS Code Fabric Integration API
Provides typings and utilities for the  VS Code Fabric Integration API. This API is used to integrate "satellite" Fabric extensions into a view provided by the Fabric "core" extension for VS Code.

The API is still under development, so not many details will be provided at this time. 

## Overview
The Fabric extension for VS Code contributes the Fabric workspace view. This view allows users to browse and work with supported items in Fabric. 

The Fabric extension provides small generic features for all Workspace item types. Users can then install Fabric satellite extensions to enable rich, item-specific experiences.

The Fabric extension exposes an API which enables any number of satellite extensions to contribute UI and functionality to the Fabric workspace view.

## Capabilities
The Fabric for VS Code extension provides functionality to enable a user to interact with their Fabric workspace through VS Code. This includes but is not limited to:

 - Logging in to Microsoft Fabric
 - Selecting a Workspace for development
 - View, manage, and develop Microsoft Fabric items from VS Code

## API Overview
The core and satellite extensions work together to provide a rich user experience for developing a Fabric workspace. The Fabric extension implements core functionality, exposed as a set of services to be consumed by a satellite extension. These services are exposed by the core extension when it is activated.

Each satellite extension will register with the core extension and provide item-specific implementation of functionality. The core extension will then show this functionality to the user. Generally speaking, the enhanced functionality extension points are opt-in: if the satellite extension doesn't need to provide some functionality, it can simply choose to not implement that extension point.

APIs are still under active development, but here is a brief synopsis of how a satellite extension should consume and implement extension APIs.
### Architecture Graphic
![Extension architecture graphic](./media/ArchOverview_25.png)

### Getting Started
During activation, satellite extensions can retrieve the `IFabricExtensionServiceCollection` from the core extension, id `fabric.vscode-fabric`: 

``` ts
import * as fabricExt from '@fabric/vscode-fabric-api';

export function activate(context: vscode.ExtensionContext) {
    const fabricExtensionManager: fabricExt.IFabricExtensionManager = <fabricExt.IFabricExtensionManager>vscode.extensions.getExtension('fabric.vscode-fabric')!.exports;
```
Once the Extension Manager has been successfully received, the satellite extension should register with the core extension, declaring the types of items it provides functionality for:

``` ts
        const artifactHandlers: fabricExt.IArtifactHandler[] = [
            new handlers.SynapseNotebookArtifactHandler()
        ];

        const treeNodeProviders: fabricExt.IFabricTreeNodeProvider[] = [
            new nodeProviders.SynapseNotebookTreeNodeProvider(),
        ];

        const localProjectTreeNodeProviders: fabricExt.ILocalProjectTreeNodeProvider[] = [
            new nodeProviders.SynapseNotebookLocalProjectTreeNodeProvider(),
        ];

        const fabricExtensionServices: fabricExt.IFabricExtensionServiceCollection = fabricExtensionServices.extensionManager.addExtension(
            {
                'identity': context.extension.id,
                'apiVersion': fabricExt.apiVersion,
                'artifactTypes': ['SynapseNotebook'],
                'artifactHandlers': artifactHandlers,
                'treeNodeProviders': treeNodeProviders,
                'localProjectTreeNodeProviders': localProjectTreeNodeProviders,
            }
        );

```
The satellite extension now has access to all of the services exposed by the core extension via the `IFabricExtensionServiceCollection` interface.

The interfaces the client should consume and implement are defined in the`@fabric/vscode-fabric-api` package. [View the vscode-fabric-api source folder](../packages/api/)

### Extension dependencies
Satellite extensions must declare the core Fabric  extension as an extension dependency in their extension manifest `package.json` file. 

``` json
  "extensionDependencies": [
      "fabric.vscode-fabric"
  ]
```
