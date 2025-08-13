# RFC 001: Enhanced Logger with VS Code Log Level Integration

## Problem

During4. Mark `reportExceptionTelemetryAndLog` and `log` as deprecated
5. **🗑️ Clean house:** Remove unused classes `StepProgressLogger`, `OutputMonitor`, `IProgress<T>`, and `StepProgress`
6. **🔄 Replace MockConsoleLogger:** Introduce `TestLogger` for test message capturing
7. Gradually migrate existing calls to new methodsextension debugging, the need to add temporary `console.log` statements and later remove them proved cumbersome. While the current `ILogger` interface has `LogImportance` levels, these are specified at each log call site rather than being controlled by configuration, making it difficult to enable/disable debug logging without code changes. Additionally, `reportExceptionTelemetryAndLog` mixes logging and telemetry concerns, violating separation of concerns.

## Proposal

### 1. Log Level Configuration

Integrate with VS Code's built-in log level system using `workbench.action.setLogLevel` setting and the VS Code LogLevel API.

**New Log Levels:**
- `trace` - Deep debugging (console and output, cannot show output window)
- `debug` - Development debugging (console and output, cannot show output window)
- `info` - Informational messages (console and output)
- `warn` - Warning messages (console and output)
- `error` - Error messages (console and output)

**Intended Use Cases:**
- `trace/debug`: Development debugging (ultra-verbose vs general debuggin), both go to console and output but can't force show output
- `info/warn/error`: User-facing messages that can optionally show the output panel

### 2. Updated ILogger Interface

```typescript
export enum LogLevel {
    trace = 0,
    debug = 1,
    info = 2,  
    warn = 3,
    error = 4
}

export interface ILogger {
    trace(message: string): void;
    debug(message: string): void;
    info(message: string, show?: boolean): void;
    warn(message: string, show?: boolean): void;
    error(message: string, show?: boolean): void;
    show(): void;
    
    // Deprecated methods - use level-specific methods above
    /** @deprecated Use trace(), debug(), info(), warn(), or error() instead */
    log(message: string, importance?: LogImportance, show?: boolean): void;
    
    /** @deprecated Use ITelemetryService separately for better separation of concerns */
    reportExceptionTelemetryAndLog(
        methodName: string,
        eventName: string, 
        exception: unknown,
        telemetryService: any | null,
        properties?: { [key: string]: string }
    ): void;
}
```

### 3. Implementation Details

**Logger Configuration:**
- Read VS Code's log level setting via `vscode.env.logLevel`
- Default to `info` level if not configured
- Debug configurations enable `debug` level minimum
- `trace` level enabled on-demand for deep logging

**Log Level Filtering:**
- Only log methods at or above the configured level will output
- Example: If level is set to `debug`, then `trace()` calls are ignored, but `debug()`, `info()`, `warn()`, and `error()` calls will output
- Example: If level is set to `warn`, then only `warn()` and `error()` calls will output
- This allows enabling/disabling debug logging without code changes

**Console Integration:**
- All log levels write to both console and output channel
- Console output prefixed with timestamp and level
- Only `info`, `warn`, `error` methods can show the output window via `show` parameter
- `trace` and `debug` methods cannot force the output window to appear

**Migration Path:**
- Keep existing `log(message, LogImportance, show?)` method for **full backward compatibility**
- Map `LogImportance.low` → `debug`, `LogImportance.normal` → `info`, `LogImportance.high` → `warn`
- Mark `reportExceptionTelemetryAndLog` as deprecated but **continue to support it**
- **🗑️ Delete unused dead code:** Remove `StepProgressLogger`, `OutputMonitor`, `IProgress<T>`, and `StepProgress` classes (zero usage found)
- **Replace MockConsoleLogger:** Create `TestLogger` class with message capturing for test assertions
- **No breaking changes:** All existing code continues to work unchanged

### 4. Usage Examples

**Current:**
```typescript
logger.log("Processing request", LogImportance.low);
logger.log("Request completed", LogImportance.normal);
logger.reportExceptionTelemetryAndLog("method", "event", error, telemetryService);
```

**New:**
```typescript
logger.debug("Processing request");
logger.info("Request completed");
logger.error("Request failed", true); // show output panel

// Separate concerns
logger.error(`Error in ${methodName}: ${error.message}`);
telemetryService.sendTelemetryErrorEvent("event", properties);
```

### 5. Debug Configuration Integration

Update launch configurations to set appropriate log levels:

```json
{
    "name": "Debug Extension",
    "type": "extensionHost",
    "env": {
        "VSCODE_LOG_LEVEL": "debug"
    }
}
```

## Benefits

1. **Better Developer Experience:** Easy debug logging toggle without code changes
2. **VS Code Integration:** Leverages familiar VS Code log level system
3. **Separation of Concerns:** Removes telemetry coupling from logger
4. **Flexibility:** Different log levels for different scenarios
5. **Performance:** Skip expensive logging operations when disabled
6. **🧹 Code Cleanup:** Removes unused dead code, simplifying the interface
7. **🔄 Backward Compatibility:** Existing code continues to work unchanged

## Migration Strategy

1. Add new methods to `ILogger` interface
2. Update `Logger` implementation with level-based filtering
3. Update debug configurations to enable debug logging
4. Mark `reportExceptionTelemetryAndLog` and `log` as deprecated **but keep them functional**
5. **🗑️ Clean house:** Remove unused classes `StepProgressLogger`, `OutputMonitor`, `IProgress<T>`, and `StepProgress`
6. **🔄 Replace MockConsoleLogger:** Introduce `TestLogger` for test message capturing
7. **Optional migration:** Teams can gradually adopt new methods at their own pace - **no forced migration**

## Future Considerations

### Logger and Telemetry Service Composition

A future RFC could explore composing `ILogger` and `ITelemetryService` for convenience methods while maintaining separation of concerns.

### MockConsoleLogger Replacement

The current `MockConsoleLogger` class serves two purposes in tests:
1. **Message Capturing**: Stores log messages in `logMessagesArray` for test assertions
2. **Console Output**: Writes to console.log for debugging tests
3. **IMessageReporter**: Implements the `report()` method for zip utilities

**Analysis of Test Usage:**
Tests use `MockConsoleLogger` primarily for assertions like:
```typescript
assert(logger.logMessagesArray.some(log => log.includes('expected message')));
assert(logger.logMessagesArray.filter(log => log.includes('error')).length === 2);
logger.logMessagesArray = []; // reset between test phases
```

**Proposed TestLogger Replacement:**
```typescript
export class TestLogger extends Logger implements IMessageReporter {
    public capturedMessages: string[] = [];
    
    constructor(logNameOrOutputChannel: string | OutputChannel) {
        super(logNameOrOutputChannel);
        // Set to trace level to capture everything in tests
        this.level = LogLevel.trace;
    }
    
    // Override all logging methods to add capturing
    trace(message: string): void {
        this.captureMessage('TRACE', message);
        super.trace(message);
    }
    
    debug(message: string): void {
        this.captureMessage('DEBUG', message);
        super.debug(message);
    }
    
    info(message: string, show?: boolean): void {
        this.captureMessage('INFO', message);
        super.info(message, show);
    }
    
    warn(message: string, show?: boolean): void {
        this.captureMessage('WARN', message);
        super.warn(message, show);
    }
    
    error(message: string, show?: boolean): void {
        this.captureMessage('ERROR', message);
        super.error(message, show);
    }
    
    // Override deprecated log method for backward compatibility
    log(message: string, importance?: LogImportance, show?: boolean): void {
        const level = importance === LogImportance.low ? 'DEBUG' : 
                     importance === LogImportance.high ? 'WARN' : 'INFO';
        this.captureMessage(level, message);
        super.log(message, importance, show);
    }
    
    private captureMessage(level: string, message: string): void {
        const formattedMessage = `[${level}] ${message}`;
        this.capturedMessages.push(formattedMessage);
    }
    
    // Test utilities
    clearMessages(): void { this.capturedMessages = []; }
    getMessages(): string[] { return [...this.capturedMessages]; }
    hasMessage(substring: string): boolean { 
        return this.capturedMessages.some(msg => msg.includes(substring)); 
    }
    getMessageCount(substring: string): number {
        return this.capturedMessages.filter(msg => msg.includes(substring)).length;
    }
    
    // IMessageReporter for zip utilities
    report(message: string): void { this.info(message); }
}
```

**Migration Benefits:**
- **🎯 Purpose-built for testing**: Extends regular logger, just adds capturing
- **🔍 Better debugging**: Level-prefixed messages make test debugging easier  
- **♻️ Reuses existing logic**: No duplication of logging behavior
- **🔗 Consistent**: Same logging behavior as production, plus test utilities
- **📊 Rich assertions**: Helper methods for common test patterns
- **� Visible output**: Developers can see log output in VS Code during test runs

**Test Migration Example:**
```typescript
// Before
const logger = new MockConsoleLogger('Test');
logger.logMessagesArray = [];
// ... test code ...
assert(logger.logMessagesArray.some(log => log.includes('expected')));

// After  
const logger = new TestLogger('Test Logger');
logger.clearMessages();
// ... test code ...
assert(logger.hasMessage('expected'));
```
