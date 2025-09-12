# Getting started

Check out the [vsc-extension-quickstart](extensions/vscode-fabric/vsc-extension-quickstart.md) guide for general VS Code extension tips.

## Optional: Dev Container
 
 See https://containers.dev/ for an overview of devcontainers which allow seamless development inside a docker container

Prerequisites:

- [VS Code](https://code.visualstudio.com/)
- [Docker](https://www.docker.com/) (Docker Desktop or CE)
- [VSCode Remote extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- [A Personal Access Token](https://powerbi.visualstudio.com/_usersSettings/tokens) with Read and Write permissions for Packaging and Drop

1. Once the extension is installed, upon opening the repo in VS Code a notification window will prompt to re-open in a devcontainer (or use the command palette).

    **Note:** Open the Root of the repository instead of the `.code-workspace` file. The workspace file will be automatically loaded when the container is ready.  

    ![Re-Open In Container](resources/contributing/container/reopen_container.png)


1. Wait for the container to build
1. Enter in your ADO personal access token when prompted

    ![Paste in PAT](resources/contributing/container/pat.png)

Necessary Extensions will be automatically installed and the multi-root workspace will be opened.


**KNOWN ISSUES / TODO**

1. Test explorers don't work. Use workaround:

You can run and debug all tests via the Run amd Debug launch configurations

![Run all extension tests](resources/contributing/container/run_tests.png)  

View the results in the Debug Console

![View test results](resources/contributing/container/test_results.png)

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
 - 📦- VS Code extensions
 - 🧪- Tests
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
 - Get Mocha explorer to find all tests in the multi-folder workspace
