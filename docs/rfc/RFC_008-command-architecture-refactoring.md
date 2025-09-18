# RFC 008: Command Architecture Refactoring

## Summary

Refactor the VS Code Fabric extension command system from function-based registration to a class-based architecture using `FabricCommand` and `FabricCommandManager`. This change standardizes command creation, improves dependency injection, provides consistent error handling and telemetry, and enhances testability across all extension commands.

## Background

The current command implementation in the VS Code Fabric extension suffers from several architectural limitations:

### Current State Problems
- **Inconsistent Registration**: Commands are registered across multiple files (`artifactManager/commands.ts`, `workspace/commands.ts`, `localProject/commands.ts`) with varying patterns
- **Parameter Dependency Passing**: Commands receive dependencies through function parameters, making them difficult to test and maintain
- **Inconsistent Error Handling**: Each command implements its own error handling and telemetry patterns
- **Scattered Telemetry**: Telemetry tracking is inconsistent across commands with manual event creation
- **Poor Testability**: Functions with multiple parameters are difficult to mock and test in isolation

### Architecture Analysis
Current command registration pattern:
```typescript
// Multiple registration files with inconsistent patterns
export function registerArtifactManagerCommands(context: vscode.ExtensionContext, /* many parameters */) {
    vscode.commands.registerCommand('command.name', async (...args) => {
        // Manual error handling
        // Manual telemetry
        // Implementation logic
    });
}
```

This approach leads to:
- Code duplication across command registration functions
- Difficulty in centralized command management
- Inconsistent dependency access patterns
- Manual error handling implementation for each command

## Proposal

Implement a centralized command architecture with three core components:

### 1. IFabricCommandManager Interface
Defines the contract for command management with all extension dependencies as readonly properties:

```typescript
export interface IFabricCommandManager {
    readonly logger: ILogger;
    readonly telemetryService: TelemetryService | null;
    readonly extensionContext: vscode.ExtensionContext;
    readonly fabricEnvironmentProvider: IFabricEnvironmentProvider;
    readonly workspaceManager: IWorkspaceManager;
    readonly artifactManager: IArtifactManagerInternal;
    readonly capacityManager: ICapacityManager;
    readonly dataProvider: FabricWorkspaceDataProvider;
    readonly workspaceFilterManager: IWorkspaceFilterManager;
    readonly extensionManager: IFabricExtensionManagerInternal;

    registerCommand(command: IFabricCommand): vscode.Disposable;
    unregisterCommand(commandName: string): void;
}
```

### 2. FabricCommandManager Implementation
Singleton service with constructor-based dependency injection that automatically registers all commands:

```typescript
export class FabricCommandManager implements IFabricCommandManager {
    constructor(
        public readonly logger: ILogger,
        public readonly telemetryService: TelemetryService | null,
        // ... all other dependencies injected by DI framework
    ) {}

    public async initialize(): Promise<void> {
        await this.createAndRegisterCommands();
    }

    private async createAndRegisterCommands(): Promise<void> {
        const refreshCommand = new RefreshArtifactViewCommand(this);
        this.registerCommand(refreshCommand);
        // ... register all commands
    }
}
```

### 3. FabricCommand Base Class
Abstract base class providing standardized command execution with automatic error handling, telemetry, and progress indication:

```typescript
export abstract class FabricCommand<T extends CoreTelemetryEventNames> implements IFabricCommand {
    constructor(protected readonly commandManager: IFabricCommandManager) {}

    public async execute(...args: any[]): Promise<any> {
        return withErrorHandling(async () => {
            return doFabricAction(
                this.telemetryEventName,
                async (telemetryActivity) => {
                    return this.executeInternal(telemetryActivity, ...args);
                },
                this.getProgressLocation()
            );
        });
    }

    protected abstract executeInternal(
        telemetryActivity: TelemetryActivity<CoreTelemetryEventNames>,
        ...args: any[]
    ): Promise<any>;
}
```

## Implementation

### Dependencies
- **wessberg/DI Framework**: For constructor-based dependency injection
- **FabricError System**: Integration with existing `doFabricAction` patterns
- **TelemetryActivity**: Automatic telemetry tracking with success/failure/cancellation
- **VS Code Extension API**: Command registration and progress indication

### Integration Points
1. **DI Container Registration**: Register `FabricCommandManager` as singleton in `extension.ts`
2. **Command Migration**: Progressive migration of existing commands to new architecture
3. **Telemetry Integration**: Leverage existing `CoreTelemetryEventNames` and `TelemetryActivity`
4. **Error Handling**: Use existing `withErrorHandling` and `doFabricAction` patterns

### File Structure
```
src/commands/
├── IFabricCommandManager.ts      # Interface definitions
├── FabricCommandManager.ts       # Manager implementation
├── FabricCommand.ts              # Abstract base class
├── RefreshArtifactViewCommand.ts # Simple command example
└── README.md                     # Architecture documentation
```

## Data Flow

### Command Registration Flow
```
Extension Activation
    ↓
DI Container Setup
    ↓
FabricCommandManager Creation (with all dependencies injected)
    ↓
Command Manager Initialize
    ↓
Create Command Instances (each receives command manager reference)
    ↓
Register Commands with VS Code
```

### Command Execution Flow
```
VS Code Command Invocation
    ↓
FabricCommand.execute()
    ↓
withErrorHandling() wrapper
    ↓
doFabricAction() with telemetry and progress
    ↓
executeInternal() - command-specific logic
    ↓
Access dependencies via this.commandManager
    ↓
Automatic telemetry and error handling
```

## Rollout Plan

### Phase 1: Infrastructure Setup ✅ (Completed)
- Create interface and base class definitions
- Implement `FabricCommandManager` with DI integration
- Register manager in extension activation
- Create example commands for validation

### Phase 2: Progressive Migration
- **Start Simple**: Migrate basic commands like refresh operations first
- **Reference Examples**: Use `RefreshArtifactViewCommand` as template
- **Complex Commands**: Gradually migrate commands with external dependencies
- **Validation**: Ensure each migrated command maintains existing functionality

### Phase 3: Cleanup
- Remove old command registration functions
- Delete unused command files
- Update documentation and examples

## Testing Strategy

### Unit Testing Benefits
- **Mockable Dependencies**: Easy to mock `IFabricCommandManager` interface
- **Isolated Testing**: Commands can be tested independently of VS Code APIs
- **Dependency Injection**: All dependencies can be mocked for thorough testing

### Test Example
```typescript
const mockCommandManager = {
    logger: mockLogger,
    workspaceManager: mockWorkspaceManager,
    dataProvider: mockDataProvider,
    // ... other mocked dependencies
} as IFabricCommandManager;

const command = new RefreshArtifactViewCommand(mockCommandManager);
await command.execute();

// Verify expected interactions with mocked dependencies
```

### Integration Testing
- Commands integrate seamlessly with existing DI container
- Error handling patterns maintained with `FabricError` system
- Telemetry events tracked consistently across all commands

## Success Metrics

### Measurable Outcomes
- **Reduced Code Duplication**: Eliminate redundant command registration patterns
- **Consistent Error Handling**: All commands use standardized error management
- **Improved Test Coverage**: Commands can be easily unit tested with mocked dependencies
- **Faster Development**: New commands follow consistent creation pattern

### Performance Impact
- **Minimal Runtime Overhead**: Architecture uses existing patterns and DI framework
- **Memory Efficiency**: Single command manager instance with shared dependencies
- **Compilation Success**: All changes maintain existing build process (verified with webpack compilation)

## Alternatives Considered

### 1. Service Locator Pattern
**Approach**: Commands access dependencies through `commandManager.get<IService>()`
**Rejected Because**: 
- Less type-safe than constructor injection
- Harder to track dependencies at compile time
- Goes against established DI patterns in the codebase

### 2. Function-Based with Improved Registration
**Approach**: Keep functions but centralize registration logic
**Rejected Because**:
- Doesn't solve testability issues
- Still requires parameter passing for dependencies
- Doesn't provide consistent error handling architecture

### 3. Static Command Classes
**Approach**: Commands as static classes with global dependency access
**Rejected Because**:
- Poor testability with global state
- Doesn't integrate with existing DI framework
- Makes dependency tracking difficult

## Risks & Mitigations

### Risk: Breaking Existing Commands During Migration
**Mitigation**: Progressive migration approach with validation at each step

### Risk: Performance Regression
**Mitigation**: Architecture leverages existing patterns and DI framework with minimal overhead

### Risk: Developer Adoption
**Mitigation**: Comprehensive documentation, clear examples, and migration templates provided

### Risk: Complex Command Migration Complexity
**Mitigation**: Template approach for complex commands with external dependencies

## Architecture Benefits

### For Development
- **Standardized Creation**: All commands follow consistent pattern
- **Enhanced Debugging**: Centralized error handling and logging
- **Type Safety**: Strong typing for command contracts and telemetry
- **IDE Support**: Better IntelliSense with interface-based dependencies

### For Maintenance
- **Single Responsibility**: Clear separation between command logic and infrastructure
- **Consistent Patterns**: Error handling, telemetry, and progress indication standardized
- **Easy Extension**: Adding new commands requires minimal boilerplate
- **Dependency Management**: All service dependencies managed centrally

### For Testing
- **Mock-Friendly**: Interface-based dependencies easily mocked
- **Isolated Units**: Commands can be tested independently
- **Consistent Testing**: All commands follow same testing patterns
- **Better Coverage**: Easier to achieve comprehensive test coverage

This architecture refactoring provides a solid foundation for maintainable, testable, and consistent command implementation across the VS Code Fabric extension while preserving all existing functionality.
