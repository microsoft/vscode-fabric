<!-- markdownlint-disable MD033 MD041 -->

<div align="center">
 <img src="./extension/resources/fabric.png" alt="Microsoft Fabric Logo" width="180" />

  <br/>

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/microsoft/vscode-fabric/blob/main/LICENSE.txt)
[![VS Code Extension Version](https://img.shields.io/visual-studio-marketplace/v/fabric.vscode-fabric?label=ext)](https://marketplace.visualstudio.com/items?itemName=fabric.vscode-fabric)
[![API Package Version](https://img.shields.io/npm/v/@microsoft/vscode-fabric-api.svg?label=api)](https://www.npmjs.com/package/@microsoft/vscode-fabric-api)
[![Util Package Version](https://img.shields.io/npm/v/@microsoft/vscode-fabric-util.svg?label=util)](https://www.npmjs.com/package/@microsoft/vscode-fabric-util)

 <h1>Microsoft Fabric extension for VS Code</h1>
</div>

This repository is the home for the *Microsoft Fabric extension for VS Code and it's extensibility model*.

The Fabric extension serves as a "core" platform that is extensible by "satellite" extensions that can contribute functionality for specific item types. Learn more [architechture overview](/docs//architecture-overview.md) and [extensibility overview](/docs/extensibility-overview.md).

## Overview

The repository is a mono repo that contains primarily the following:

- [`extension`](/extension/README.md): The VS Code extension that surfaces Fabric experiences, ships on the Marketplace, and hosts shared core services and views.
- [`api`](/api/README.md): An npm package (`@microsoft/vscode-fabric-api`) that provides typed contracts for extending the core extension.
- [`util`](/util/README.md): An npm package (`@microsoft/vscode-fabric-util`) of reusable helpers consumed by the extension and satellite packages to keep implementations consistent.

## Feedback

Have an idea, question, or bug report? [Open a new issue](https://github.com/microsoft/vscode-fabric/issues/new/choose) and select the template that best fits your scenario.

## Contributing

This project welcomes contributions. To contribute, see these documents:

- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security](./SECURITY.md)
- [Contributing](./CONTRIBUTING.md)

## Trademarks

This project may contain trademarks or logos for projects, products, or services.
Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

Any use of third-party trademarks or logos are subject to those third-party's policies.

## License

[MIT](LICENSE.txt)
