# Fabric Command Architecture

This document describes the new command architecture for the VS Code Fabric extension that provides a standardized way to create, register, and manage commands with consistent error handling, telemetry, and dependency injection.

## Architecture Overview

The new command architecture consists of three main components:

1. **IFabricCommandManager** - Interface defining the command manager contract
2. **FabricCommandManager** - Implementation that handles command registration and dependency injection
3. **FabricCommand** - Abstract base class for all commands with built-in error handling and telemetry

## Benefits

### 🔧 **Centralized Dependency Management**

Commands get all their dependencies through the command manager instead of parameter passing, making them easier to test and maintain.

### 📊 **Consistent Error Handling & Telemetry**

All commands automatically get proper error handling, telemetry tracking, and progress indication through the base class.

### 🎯 **Type Safety**

Each command is strongly typed with its specific telemetry event name, ensuring compile-time safety.

### 🧪 **Enhanced Testability**

Commands can be easily unit tested by mocking the command manager interface.

### 🔄 **Progressive Migration**

Existing commands can be migrated one at a time without breaking existing functionality.

## How It Works

### Dependency Injection

The `FabricCommandManager` is registered as a singleton in the DI container and receives all necessary dependencies through constructor injection:

```typescript
// All dependencies are injected automatically by the DI framework
constructor(
    public readonly logger: ILogger,
    public readonly telemetryService: TelemetryService | null,
    public readonly extensionContext: vscode.ExtensionContext,
    public readonly fabricEnvironmentProvider: IFabricEnvironmentProvider,
    public readonly workspaceManager: IWorkspaceManager,
    public readonly artifactManager: IArtifactManagerInternal,
    // ... other dependencies
) {}
```

### Command Registration

Commands are registered automatically during the command manager initialization:

```typescript
private async createAndRegisterCommands(): Promise<void> {
    const createArtifactCommand = new CreateArtifactCommand(this);
    this.registerCommand(createArtifactCommand);
}
```

### Error Handling & Telemetry

The base `FabricCommand` class automatically wraps command execution with:

- `withErrorHandling` for top-level error management
- `doFabricAction` for FabricError processing and telemetry
- `TelemetryActivity` for tracking success/failure/cancellation
- Progress indication in the VS Code UI

## Creating a New Command

### 1. Create the Command Class

```typescript
import { TelemetryActivity } from "@microsoft/vscode-fabric-util";
import { CoreTelemetryEventNames } from "../TelemetryEventNames";
import { FabricCommand } from "./FabricCommand";
import { IFabricCommandManager } from "./IFabricCommandManager";
import { commandNames } from "../constants";

export class MyNewCommand extends FabricCommand<"item/create"> {
  public readonly commandName = commandNames.myNewCommand;
  public readonly telemetryEventName = "item/create" as const;

  constructor(commandManager: IFabricCommandManager) {
    super(commandManager);
  }

  protected async executeInternal(
    telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
    ...args: any[]
  ): Promise<any> {
    // Your command logic here

    // Access dependencies through this.commandManager
    const logger = this.commandManager.logger;
    const workspaceManager = this.commandManager.workspaceManager;

    // Add telemetry properties
    telemetryActivity.addOrUpdateProperties({
      customProperty: "value",
    });

    // Your implementation...
  }
}
```

### 2. Register the Command

Add the command to the `createAndRegisterCommands` method in `FabricCommandManager.ts`:

```typescript
private async createAndRegisterCommands(): Promise<void> {
    const myNewCommand = new MyNewCommand(this);
    this.registerCommand(myNewCommand);
}
```

### 3. Add Command Name Constant

Add the command name to `constants.ts`:

```typescript
export namespace commandNames {
  // ... existing commands
  export const myNewCommand = "vscode-fabric.myNewCommand";
}
```

## Available Dependencies

Through `this.commandManager`, commands have access to:

- `logger: ILogger` - For logging messages
- `telemetryService: TelemetryService | null` - For telemetry tracking
- `extensionContext: vscode.ExtensionContext` - VS Code extension context
- `fabricEnvironmentProvider: IFabricEnvironmentProvider` - Current Fabric environment
- `workspaceManager: IWorkspaceManager` - Workspace operations
- `artifactManager: IArtifactManagerInternal` - Artifact operations
- `capacityManager: ICapacityManager` - Capacity management
- `dataProvider: FabricWorkspaceDataProvider` - Tree view data provider
- `workspaceFilterManager: IWorkspaceFilterManager` - Workspace filtering
- `extensionManager: IFabricExtensionManagerInternal` - Extension management

## Helper Methods

The base `FabricCommand` class provides several helper methods:

### `addArtifactTelemetryProperties`

Automatically adds common artifact telemetry properties:

```typescript
protected addArtifactTelemetryProperties(
    activity: TelemetryActivity<CoreTelemetryEventNames>,
    artifact: any
): void {
    activity.addOrUpdateProperties({
        endpoint: this.commandManager.fabricEnvironmentProvider.getCurrent().sharedUri,
        workspaceId: artifact.workspaceId,
        artifactId: artifact.id,
        fabricArtifactName: artifact.displayName,
        itemType: artifact.type,
    });
}
```

### `getProgressLocation`

Override to customize where progress is shown:

```typescript
protected getProgressLocation(): vscode.ProgressLocation | { viewId: string } {
    return { viewId: fabricViewWorkspace }; // Default
    // or return vscode.ProgressLocation.Notification;
    // or return undefined; // No progress indication
}
```

## Examples

### Simple Command

```typescript
export class MySimpleCommand extends FabricCommand<"workspace/load-items"> {
  public readonly commandName = commandNames.mySimpleCommand;
  public readonly telemetryEventName = "workspace/load-items" as const;

  protected async executeInternal(telemetryActivity, ...args): Promise<void> {
    this.commandManager.logger.log("Command executed");
    // Command logic here
  }
}
```

### Complex Command (With Authentication Check)

```typescript
export class CreateArtifactCommand extends FabricCommand<"item/create"> {
  protected async executeInternal(telemetryActivity, ...args): Promise<any> {
    // Check authentication
    if (!(await this.commandManager.workspaceManager.isConnected())) {
      void showSignInPrompt();
      return;
    }

    // Add telemetry
    this.addArtifactTelemetryProperties(telemetryActivity, artifact);

    // Implementation...
  }
}
```

## Migration Guide

To migrate an existing command:

1. **Create** a new command class extending `FabricCommand`
2. **Move** the command logic to `executeInternal`
3. **Replace** parameter dependencies with `this.commandManager` access
4. **Remove** manual error handling (it's automatic now)
5. **Update** telemetry calls to use the provided `telemetryActivity`
6. **Register** the command in `FabricCommandManager`
7. **Test** the command functionality

## Testing

Commands can be easily unit tested by mocking the `IFabricCommandManager`:

```typescript
const mockCommandManager = {
  logger: mockLogger,
  workspaceManager: mockWorkspaceManager,
  // ... other mocked dependencies
} as IFabricCommandManager;

const command = new MyCommand(mockCommandManager);
await command.execute();
```

## Architecture Files

- **`IFabricCommandManager.ts`** - Interface definitions
- **`FabricCommandManager.ts`** - Command manager implementation
- **`FabricCommand.ts`** - Abstract base class for commands
- **`README.md`** - This architecture documentation
