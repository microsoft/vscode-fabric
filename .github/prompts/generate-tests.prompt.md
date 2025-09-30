# Scaffold Mocha Test File

This prompt helps you scaffold a new Mocha test file for the Fabric VSCode extensions.

## Instructions

To create a new test file, provide:
1. The component being tested (e.g., "TreeView", "WorkspaceManager")
2. The test type ("unit" or "integration")
3. The source file path being tested (e.g., "/extension/src/workspace/treeView.ts")

## File Location and Naming

Tests should follow this structure:
- Unit tests: `/extension/src/test/unit/{module-path}/{component}.unit.test.ts`
- Integration tests: `/extension/src/test/integration/{module-path}/{component}.integration.test.ts`

Where:
- `{module-path}` mirrors the source folder structure (e.g., "workspace")
- `{component}` is the specific component being tested (e.g., "treeView")

## Test File Template

The basic structure should include:

```typescript
import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
// If using sinon for stubbing, spying, or faking timers, include this import
import * as sinon from 'sinon';
// Import the module being tested
import { ClassUnderTest } from '../../../path/to/module';
// Import any interfaces/types needed
import { ISomeInterface } from '@microsoft/vscode-fabric-api';
import { SomeUtility } from '@microsoft/vscode-fabric-util';

describe('TestSuiteName', function() {
    // Declare mocks
    let mockDependency1: Mock<IDependency1>;
    let mockDependency2: Mock<IDependency2>;
    let classUnderTest: ClassUnderTest;
    
    // Runs once before all tests in the block
    before(function() {
        // Setup operations that need to happen once before all tests
        // e.g., create shared resources, initialize test environment
    });
    
    // Runs before each test
    beforeEach(function() {
        // Initialize mocks for each test
        mockDependency1 = new Mock<IDependency1>();
        mockDependency2 = new Mock<IDependency2>();
        
        // Setup common mock behaviors
        mockDependency1.setup(instance => instance.someMethod(It.IsAny())).returns(someValue);
        
        // Initialize class under test with mocks
        classUnderTest = new ClassUnderTest(mockDependency1.object(), mockDependency2.object());
    });
    
    // Runs after each test
    afterEach(function() {
        // Clean up after each test
        // e.g., reset specific states, clean temporary data
        // If using sinon stubs/spies, restore them: sinon.restore();
    });
    
    // Runs once after all tests in the block
    after(function() {
        // Teardown operations after all tests complete
        // e.g., clean up shared resources, reset environment
    });
    
    it('should do something specific', function() {
        // Arrange
        // Additional mock setup specific to this test
        
        // Act
        const result = classUnderTest.methodBeingTested();
        
        // Assert
        assert.equal(result, expectedValue, 'Message explaining the assertion');
        mockDependency1.verify(instance => instance.someMethod(It.IsAny()), Times.Once());
    });
    
    // Add more test cases...
});
```

## Notes on Testing Approach

- Do NOT use arrow functions for Mocha methods (describe, it, before, after, beforeEach, afterEach) 
  as they prevent access to the Mocha context
- Always use `assert` from Node.js for assertions rather than Jest-style expect statements
- Use `moq.ts` for mocking dependencies rather than Jest mocks
- Avoid using sinon unless absolutely necessary - Moq.ts is the preferred mocking framework
- When using sinon for stubbing, spying, or faking timers (only if Moq.ts cannot handle the scenario), always include the import: `import * as sinon from 'sinon';`
- Follow the "Arrange-Act-Assert" pattern in test cases
- Use descriptive test names that explain what functionality is being tested
- Add verification of mock expectations with `mock.verify(...)` where appropriate
- Include all four lifecycle hooks (before, beforeEach, afterEach, after) in test files, even if some are empty

## Example Test Case

Given a source file `/extension/src/services/connectionManager.ts` with a `ConnectionManager` class, create a unit test at `/extension/src/test/unit/services/connectionManager.unit.test.ts`:

```typescript
import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { ConnectionManager } from '../../../services/connectionManager';
import { IConnection, ICredentialStore } from '@microsoft/vscode-fabric-api';
import { LoggingService } from '@microsoft/vscode-fabric-util';

describe('ConnectionManager', function() {
    let credentialStoreMock: Mock<ICredentialStore>;
    let loggingServiceMock: Mock<LoggingService>;
    
    beforeEach(function() {
        credentialStoreMock = new Mock<ICredentialStore>();
        loggingServiceMock = new Mock<LoggingService>();
        
        loggingServiceMock.setup(instance => instance.logInfo(It.IsAny())).returns(undefined);
    });
    
    afterEach(function() {
        // Restore any sinon stubs/spies/mocks
        sinon.restore();
    });
    
    it('should create a new connection successfully', async function() {
        // Arrange
        credentialStoreMock.setup(instance => instance.storeCredential(It.IsAny(), It.IsAny())).returns(Promise.resolve(true));
        const connectionManager = new ConnectionManager(credentialStoreMock.object(), loggingServiceMock.object());
        
        // Act
        const result = await connectionManager.createConnection('server1', 'user1', 'password1');
        
        // Assert
        assert.equal(result.isConnected, true, 'Connection should be successful');
        credentialStoreMock.verify(instance => instance.storeCredential(It.IsAny(), It.IsAny()), Times.Once());
    });
});
```
