# @microsoft/vscode-fabric-util

Utilities for interacting with Microsoft Fabric and VS Code Fabric extensions.

## Overview

This package provides utility functions and helpers for building extensions and integrations with Microsoft Fabric in Visual Studio Code. It is designed to be used alongside the core API package to simplify common tasks and promote code reuse across Fabric-related projects.

## Features

- Utility functions for telemetry, error handling, logging, and more
- Helpers for working with URIs, file systems, and configuration
- TypeScript type definitions for strong typing and IntelliSense
- Designed for use by both core and satellite Fabric extensions

## Installation

```sh
npm install @microsoft/vscode-fabric-util
```

## Usage

Import the utilities in your extension or application:

```ts
import { TelemetryService, FabricError } from '@microsoft/vscode-fabric-util';
// ...other imports as needed
```

Refer to the documentation and code comments for details on available utilities and usage patterns.

## Documentation

- [Extensibility Overview](https://github.com/microsoft/vscode-fabric-pr/blob/main/docs/extensibility-overview.md)
- [Architecture Overview](https://github.com/microsoft/vscode-fabric-pr/blob/main/docs/architecture-overview.md)

## License

[MIT](LICENSE)
