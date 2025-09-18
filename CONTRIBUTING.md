# Contributing

This project welcomes contributions and suggestions. Most contributions require you to
agree to a Contributor License Agreement (CLA) declaring that you have the right to,
and actually do, grant us the rights to use your contribution. For details, visit
https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need
to provide a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the
instructions provided by the bot. You will only need to do this once across all repositories using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/)
or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Quickstart

Check out the [vsc-extension-quickstart](extensions/vscode-fabric/vsc-extension-quickstart.md) guide for general VS Code extension tips.

## Optional: Dev Container

See https://containers.dev/ for an overview of devcontainers which allow seamless development inside a docker container. This project is configured with a devcontainer for a consistent and easy-to-use development environment.

### Prerequisites

- [VS Code](https://code.visualstudio.com/)
- [Docker](https://www.docker.com/) (Docker Desktop or CE)
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### Getting Started

1.  Once the prerequisites are installed, open the repository in VS Code.
2.  A notification will appear, prompting you to reopen the project in a dev container. Click "Reopen in Container".
3.  The dev container will build, and all necessary dependencies will be installed automatically. This may take a few minutes on the first run.

Once the container is ready, the workspace will be fully configured for development, including all recommended extensions and settings.

Open the [.vscode/vscode-fabric.code-workspace](./.vscode/vscode-fabric.code-workspace) file using the "Open Workspace from File..." command.

# Repository Structure

The repository is structured as a monorepo, using the npm [workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces) feature. The workspace is divided into 2 primary areas:

- **extensions** - the core and satellite extensions owned by the Trident App Dev team
- **packages** - libraries which can be consumed by partner-owned satellite extensions

See [architecture overview](./doc/ArchitectureOverview.md) for more details.

# Development Loop: Command-line

Run the following commands from the repository root to build and test the projects:

```
npm install
npm run compile
npm run package
npm run test
```

These are the same commands run by the [build pipeline](pipelines/azure-pipelines.yml): [pipelines/azure-pipelines.yml](./pipelines/azure-pipelines.yml).

# Development Loop: VS Code

Use VS Code for an optimal experience. Install the workspace recommended extensions.

## Using the workspace

The [.vscode/vscode-fabric.code-workspace](./.vscode/vscode-fabric.code-workspace) file defines a [multi-root workspace](https://code.visualstudio.com/docs/editor/workspaces#_multiroot-workspaces) for the repository.

This workspace contains several types of folders. The icons are defined as:

- 🌳- The repository root
- 📦- VS Code Fabric extension
- 🚀- Shared libraries

## Using individual folders

It is also possible to use single-folder workspaces in the repository. Discovery and execution of tests is better in the single-folder workspaces.

## Debugging

Each workspace defines a debugging experience. When using the multi-folder workspace, the preferred task for running all extensions is "Run Extensions (🌳Root)".

## Testing

There are 2 types of tests defined in the repository: unit tests and integrated tests which launch VS Code. Both types of tests use the Mocha test framework, and installing the Mocha Test Explorer extension is encouraged.

### Tests fail when trying to install VS Code

Tests occasionally fail when there is a newer version of VS Code available. Shutdown VS Code and try again.

## Code formatting

Source code can be formatted using the `npm run lint` command.

Additionally, you can format all TypeScript files with consistent spacing and remove trailing whitespace using:

```
npm run format
```

To check formatting issues without modifying files, use:

```
npm run format:check
```

Running the format script before submitting a PR is recommended to minimize whitespace differences in the code review.

# TODO

The developer experience still has a few gaps. The following changes should be considered:

- Use project references to fix build order
