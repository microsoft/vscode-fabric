# @microsoft/vscode-fabric-api

APIs for interacting with Microsoft Fabric and VS Code Fabric extensions.

## Overview

This package provides TypeScript/JavaScript APIs for building extensions and integrations with Microsoft Fabric in Visual Studio Code. It defines public contracts and interfaces for extension authors and consumers, enabling safe and consistent interaction with Fabric services and extension points.

## Features

- Public API contracts for Microsoft Fabric VS Code extensions
- TypeScript type definitions for strong typing and IntelliSense
- Designed for use by both core and satellite Fabric extensions
- No implementation logic—contracts only

## Installation

```sh
npm install @microsoft/vscode-fabric-api
```

## Usage

Import the API contracts in your extension or application:

```ts
import { IFabricExtensionManager } from '@microsoft/vscode-fabric-api';
// ...other imports as needed
```

Refer to the documentation and code comments for details on available interfaces and usage patterns.

## Documentation

- [Extensibility Overview](https://github.com/microsoft/vscode-fabric-pr/blob/main/docs/extensibility-overview.md)
- [Architecture Overview](https://github.com/microsoft/vscode-fabric-pr/blob/main/docs/architecture-overview.md)

## License

[MIT](LICENSE)
