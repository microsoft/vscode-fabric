# RFC 006: VS Code UI Bypass for Integration Tests

## Summary

Provide a `VSCodeUIBypass` utility class that uses Sinon to stub VS Code UI APIs (`showInputBox`, `showQuickPick`) within the extension host process for integration and E2E tests. This enables automated testing of user workflows without manual interaction.

## Proposal

### Core Component

- **`VSCodeUIBypass` class**: Sinon-based stubbing utility for VS Code UI APIs (`showInputBox`, `showQuickPick`, `showWarningMessage` to begin with)
- **TEST_HOOKS integration**: Expose via test hooks to ensure correct vscode module context
- **Extension host execution**: Stubs must run within extension process, not test runner process

### Key Design Requirements

- **Correct vscode module**: Dynamic resolution ensures extension host's vscode module is stubbed
- **Sequential response configuration**: Pre-configure responses for multiple UI interactions
- **Call verification**: Track interaction counts and arguments for test assertions
- **Clean restoration**: Reliable cleanup of stubs after test execution

### Architecture

```typescript
// Extension provides VSCodeUIBypass through test hooks
testHooks['vscodeUIBypass'] = new VSCodeUIBypass();

// Test accesses and configures UI responses
const uiBypass = core.testHooks['vscodeUIBypass'];
uiBypass.install();
uiBypass.setInputBoxResponse('Test Workspace Name');
uiBypass.setQuickPickResponse({ label: 'Test Capacity', id: 'cap-123' });
uiBypass.setWarningMessageResponse('Continue');

// Execute command - UI interactions are bypassed
await vscode.commands.executeCommand('vscode-fabric.createWorkspace');
```

## Implementation

### Dependencies

- **Sinon**: Stubbing library for replacing vscode.window APIs
- **TEST_HOOKS pattern**: Existing mechanism for test-time service exposure

### Integration Points

- **Extension registration**: Add VSCodeUIBypass to test hooks during extension activation
- **Package dependencies**: Add `sinon` and `@types/sinon` to util package
- **Test utilities**: Export class from `@microsoft/vscode-fabric-util` for test imports
- **Command improvements**: Enhanced return types for commands to support better test assertions
- **Extended environment support**: Test hooks enabled in Development mode for debugging

### Usage Pattern

```typescript
beforeEach(async () => {
    core = await activateCore();
    uiBypass = core.testHooks['vscodeUIBypass'];
    uiBypass.install();
});

afterEach(() => {
    uiBypass.restore();
});
```

## Alternatives Considered

- **Direct stubbing**: Fails because test process has different vscode module than extension host
- **Mock implementations**: Complex to maintain and doesn't test actual UI integration points
- **Test automation tools**: WebDriver-based UI automation is slower and less reliable

## Limitations

- **WebView interactions**: Does not work for custom WebView components - use UI tests instead
- **Complex UI flows**: Supports `showInputBox`, `showQuickPick`, and `showWarningMessage` - expand as needed for other UI APIs
- **Extension host only**: Requires TEST_HOOKS pattern for cross-process access
