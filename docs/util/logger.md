# Logger Utility

## Overview

The Logger utility provides structured logging that integrates with VS Code's native log level system. It's available in `@microsoft/vscode-fabric-util` for use in core and satellite extensions.

**Key Features:**

- Respects VS Code's "Output: Set Log Level" command
- Five standard log levels (trace, debug, info, warn, error)
- Optional output pane display control
- Dependency injection ready via `ILogger` interface
- Separation of logging from telemetry concerns

## Quick Start

```typescript
import { ILogger, Logger } from '@microsoft/vscode-fabric-util';

// Create logger (typically via DI container)
const logger = new Logger('Extension Name');

// Log at different levels
logger.info('Operation completed successfully');
logger.debug('Processing 10 items');
logger.warn('Configuration missing, using defaults');
logger.error('API request failed', true); // shows output pane
```

## Log Levels

Five methods correspond to VS Code's native log levels:

| Method | Purpose | Example Use Case |
|--------|---------|------------------|
| `trace(message, show?)` | Very verbose execution details | Function entry/exit, variable states |
| `debug(message, show?)` | Development diagnostics | API payloads, processing steps |
| `info(message, show?)` | Normal operations | Success messages, status updates |
| `warn(message, show?)` | Non-blocking issues | Missing config, performance degradation |
| `error(message, show?)` | Failures | API errors, authentication failures |

### Output Pane Control

The optional `show` parameter controls whether the output pane is displayed:

```typescript
// Critical error - show immediately
logger.error('Authentication failed', true);

// Background warning - don't interrupt user
logger.warn('Cache miss, refetching data', false);

// Show output pane without logging
logger.show();
```

**Guidelines:**

- Use `show: true` for critical errors or user-initiated operation failures
- Omit or use `show: false` for background operations, trace/debug logging

## VS Code Integration

The logger uses `LogOutputChannel` which automatically respects the user's log level preference:

**Command Palette** → "Output: Set Log Level"

| Level | Messages Shown |
|-------|----------------|
| Trace | All messages |
| Debug | debug, info, warn, error |
| Info (default) | info, warn, error |
| Warning | warn, error |
| Error | error only |
| Off | None |

No custom filtering is needed—VS Code handles it natively.

## Dependency Injection

Logger is typically injected via the `ILogger` interface:

```typescript
export class ArtifactService {
    constructor(
        private readonly logger: ILogger,
        private readonly apiClient: FabricApiClient
    ) {}

    async createArtifact(name: string): Promise<void> {
        this.logger.info(`Creating artifact: ${name}`);
        try {
            const result = await this.apiClient.create(name);
            this.logger.debug(`Created with ID: ${result.id}`);
        } catch (error) {
            this.logger.error(`Creation failed: ${error}`, true);
            throw error;
        }
    }
}
```

Register with the DI container per project patterns (see existing service implementations).

## Separation from Telemetry

Logging and telemetry serve different purposes and should be handled independently:

```typescript
try {
    await performOperation();
} catch (error) {
    // Log for developer visibility
    this.logger.error(`Operation failed: ${error}`, true);
    
    // Send telemetry for metrics/monitoring
    this.telemetryService.sendTelemetryErrorEvent('operation-failed', {
        fault: error.message,
        errorMethodName: 'performOperation'
    });
    
    throw error;
}
```

This separation improves testability and allows independent control of each concern. Helpers that combine the usage is fine, but for ILogger, it's just logging.

## Migration from Deprecated Methods

### From `log(message, importance, show?)`

The old `log()` method with `LogImportance` enum is deprecated:

```typescript
// OLD
logger.log('Message', LogImportance.low);
logger.log('Message', LogImportance.normal);
logger.log('Message', LogImportance.high, true);

// NEW
logger.debug('Message');
logger.info('Message');
logger.error('Message', true);
```

### From `reportExceptionTelemetryAndLog()`

This method mixed logging and telemetry concerns:

```typescript
// OLD (mixed concerns)
logger.reportExceptionTelemetryAndLog(
    'methodName',
    'telemetry-event',
    error,
    telemetryService,
    { customProp: 'value' }
);

// NEW (separated)
logger.error(`Error in methodName: ${error}`, true);
telemetryService.sendTelemetryErrorEvent('telemetry-event', {
    fault: error.message,
    errorMethodName: 'methodName',
    customProp: 'value'
});
```

## Testing

For unit and integration tests, use standard mocking techniques appropriate to your test framework. The `ILogger` interface makes it straightforward to provide test doubles.

For tests that need to capture and assert on log messages, `MockConsoleLogger` is available in the util package. It captures every message in-memory and, by default, only emits `warn` and `error` entries to `console.log` to keep test output readable. Pass `{ consoleLogLevel: 'debug' }` (or another level) when you need additional verbosity, and optionally supply `{ consoleWriter: msg => testSink.push(msg) }` to direct console output to a buffer instead of the real console. You can also set the `FABRIC_MOCK_CONSOLE_LOG_LEVEL` environment variable to control the threshold globally when options are not provided (accepted values: `trace`, `debug`, `info`, `warn`, `error`, `off`). See existing test files for usage patterns.

## API Reference

### ILogger Interface

```typescript
interface ILogger {
    trace(message: string, show?: boolean): void;
    debug(message: string, show?: boolean): void;
    info(message: string, show?: boolean): void;
    warn(message: string, show?: boolean): void;
    error(message: string, show?: boolean): void;
    show(): void;
    
    /** @deprecated Use trace/debug/info/warn/error instead */
    log(message: string, importance?: LogImportance, show?: boolean): void;
    
    /** @deprecated Separate telemetry from logging */
    reportExceptionTelemetryAndLog(
        methodName: string,
        eventName: string,
        exception: unknown,
        telemetryService: any,
        properties?: Record<string, string>
    ): void;
}
```

### Logger Class

```typescript
class Logger implements ILogger {
    /**
     * @param logNameOrOutputChannel - Channel name string or existing LogOutputChannel
     */
    constructor(logNameOrOutputChannel: string | LogOutputChannel);
    
    // Implements all ILogger methods
}
```

## Constitutional Alignment

This logger implementation adheres to project constitutional principles:

- **Constructor-Injected Services**: Resolved via DI container, injected through `ILogger` interface
- **Test-First Discipline**: Comprehensive unit test coverage; interface enables test doubles
- **Satellite-Friendly Reuse**: Published in `@microsoft/vscode-fabric-util` with stable contracts
- **VS Code Native UX First**: Uses native `LogOutputChannel` respecting user preferences and settings

## Related Documentation

- **Telemetry Service** - For event tracking and metrics (separate from logging)
- **Error Handling** - `FabricError` and error handling patterns
- **Architecture Overview** (`docs/architecture-overview.md`) - System architecture context
- **Extensibility Overview** (`docs/extensibility-overview.md`) - Satellite extension patterns

## Source Reference

Implementation: `util/src/logger/Logger.ts`  
Tests: `util/test/unit/logger/Logger.unit.test.ts`
