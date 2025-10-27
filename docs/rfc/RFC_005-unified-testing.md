# RFC 005: Unified Testing Strategy with FakeFabricApiClient

## Summary

Replace all Mock* classes with a single `FakeFabricApiClient` that extends the real implementation, intercepting only HTTP communications while preserving all business logic. This provides:

- **Realistic Testing Environment**: Real implementations run "under test" instead of test doubles
- **Simplified Test Maintenance**: Single backdoor for testing eliminates multiple mock implementations
- **Controlled Data Flow**: HTTP interception bypasses authentication without calling `getToken()` from `ITokenAcquisitionService`
- **Satellite Extension Support**: Ship `FakeFabricApiClient` type definitions in `@microsoft/vscode-fabric-api` for satellite extensions

**Migration Scope**: All integration tests in `extensions/tests` directory can migrate to this approach, enabling cleanup of existing mock classes across unit and integration tests.

**Complete Testing Strategy**: This unified approach provides a comprehensive testing framework using three complementary tools:

| Test Type | Purpose | Tools Used | When to Use |
|-----------|---------|------------|-------------|
| **Unit** | Test pure functionality of a class or function | Moq.ts and Sinon only | Isolated logic testing, fast feedback |
| **Integration** | Run extension fully with controlled dependencies | FakeFabricApiClient + FakeTokenService | Feature validation, business logic flows |
| **E2E Integration** | Run full extension against real services | FakeTokenService only (pre-configured tokens) | End-to-end validation with real Fabric APIs |
| **UI Test** | WebDriver-based interaction testing | WebDriver + FakeTokenService (FakeFabricApiClient unavailable) | Critical user journeys, less stable but realistic |

**Key Insight**: Between these two Fake classes (for integration and E2E integration respectively) and Moq.ts/Sinon for unit tests, all testing needs are achievable with minimal maintenance overhead. 


## Background

**Current Problems:**
- **MockApiClient**, **MockArtifactManager**, **MockWorkspaceManager** create parallel implementations
- Maintenance burden: Updates required in multiple places
- Implementation drift: Mocks lag behind real implementations
- Limited coverage: Only happy path scenarios typically implemented
- Reduced fidelity: Tests validate mock behavior, not actual system behavior

## Proposal

### Core Changes
- **Comprehensive Testing Framework**: Three-tier approach using Moq.ts/Sinon (unit), FakeFabricApiClient (integration), and FakeTokenService (E2E)
- **Single Testing Backend for Integration**: Replace all Mock* classes with `FakeFabricApiClient` (extends real `FabricApiClient`)
- **HTTP-Only Interception**: Intercept at pipeline level, preserve all business logic execution
- **Universal Cleanup**: Remove MockApiClient, MockArtifactManager, MockWorkspaceManager across unit and integration tests
- **Satellite Extension Support**: Export `FakeFabricApiClient` types in `@microsoft/vscode-fabric-api` via existing test hook system
- **Retain Essential Mocks**: Keep `MockConsoleLogger` for test output inspection

### Testing Strategy by Type

**Unit Tests**: 
- Pure function/class testing with Moq.ts and Sinon
- No extension runtime, fastest execution
- Isolated dependency mocking

**Integration Tests**:
- Full extension runtime with no mock implementations  
- Only FakeFabricApiClient and FakeTokenService active
- FakeFabricApiClient exposed through existing test hook system
- Real business logic execution with controlled HTTP responses

**E2E Integration Tests**:
- Full extension runtime against real Fabric services
- Only FakeTokenService active (pre-configured tokens from `Get-E2EToken.ps1`)
- No FakeFabricApiClient responses set - falls back to real HTTP calls
- Authentication handled by service principal tokens

**UI Tests**:
- WebDriver-based interaction with extension UI
- Use when realistic user interaction is critical
- Can optionally use FakeFabricApiClient for controlled scenarios
- Less stable but highest fidelity for user journeys

### Migration Scope
**Target**: All integration tests in `extensions/tests` directory
**Benefit**: Single backdoor for testing eliminates maintenance of multiple mock implementations

### Architecture
```typescript
// Before: Complex mock with duplicate logic
MockApiClient.setCallback(complexMockLogic)

// After: Simple HTTP response interception  
FakeFabricApiClient.respondWithJson(200, mockData)
```

**Key Benefits:**
- Real implementation executes (validation, headers, telemetry, error handling)
- Precise control at HTTP boundary only
- No duplicate business logic to maintain

## Migration Strategy

**Phase 1:** Establish test type boundaries
- Unit tests: Migrate to Moq.ts/Sinon, remove extension runtime dependencies
- Integration tests: Migrate to `FakeFabricApiClient.respondWithJson()` in `extensions/tests`
- E2E tests: Configure `FakeTokenService` with `Get-E2EToken.ps1` tokens

**Phase 2:** Universal Mock cleanup
- Remove MockApiClient, MockArtifactManager, MockWorkspaceManager from unit tests
- Remove MockApiClient, MockArtifactManager, MockWorkspaceManager from integration tests
- Preserve MockConsoleLogger for test output inspection

**Phase 3:** Satellite extension support  
- Export `FakeFabricApiClient` types in `@microsoft/vscode-fabric-api`
- Leverage existing test hook system for cross-extension access
- Document usage patterns for satellite extensions

**Phase 4:** Comprehensive test coverage
- Implement error scenarios using single testing backend per test type
- Establish UI test patterns with WebDriver + optional fakes
- Create nightly E2E test suite against configured test environment

## Testing Scenarios

### Unit Testing (Moq.ts/Sinon)
```typescript
// Pure function testing - no extension runtime
const mockService = Mock.ofType<IWorkspaceService>()
mockService.setup(x => x.getWorkspace(It.isAny())).returns(Promise.resolve(mockWorkspace))

const result = await workspaceValidator.validate(mockService.object, workspaceId)
```

### Integration Testing (FakeFabricApiClient)
```typescript
// Full extension runtime with controlled HTTP responses
fakeFabricApiClient.respondWithJson(200, { workspaces: [...] })
fakeFabricApiClient.respondWithJson(401, { error: "Unauthorized" })
fakeFabricApiClient.respondWithText(503, 'Service unavailable')
fakeFabricApiClient.throwOnSend(new Error("Timeout"))

// Dynamic responses based on request inspection
fakeFabricApiClient.respondWith((request) => {
  if (request.url.includes('/admin/')) {
    return { status: 403, headers: {...}, bodyAsText: '{"error": "Forbidden"}', request }
  }
  return { status: 200, headers: {...}, bodyAsText: '{"result": "success"}', request }
})

// Real business logic executes, only HTTP is intercepted
const workspaces = await workspaceManager.listWorkspaces()
```

### E2E Integration Testing (Real Services)
```typescript
// No fake responses set - falls back to real HTTP calls
// FakeTokenService provides pre-configured tokens from Get-E2EToken.ps1
const workspaces = await workspaceManager.listWorkspaces() // Real service endpoint
```

### UI Testing (WebDriver + Optional FakeTokenService)
```typescript
// WebDriver interaction with optional controlled responses
await fakeFabricApiClient.respondWithJson(200, { deployments: [...] })
await driver.findElement(By.id('deploy-button')).click()
await driver.wait(until.elementTextContains(statusElement, 'Deployed'))
```

**Authentication Strategy**: 
- **Offline**: No `getToken()` calls needed - HTTP interception bypasses authentication
- **E2E**: `FakeTokenAcquisitionService` uses tokens from `Get-E2EToken.ps1` script

**Characteristics by Test Type:**
- **Unit**: Fastest execution, pure logic validation, no I/O
- **Integration**: Fast execution with controlled dependencies, real business logic
- **E2E**: Real service integration against configured test environment, expected flakiness, slower execution
- **UI**: Highest fidelity for user journeys, least stable, use sparingly for critical flows

This provides comprehensive test coverage: fast unit tests for logic validation, fast integration tests for development velocity, E2E validation for production confidence, and UI tests for critical user experience validation.

## Migration Example: LibraryTreeSitter Test

### Before: Complex Mock Callback (45+ lines)
```typescript
// Multiple imports and complex setup
import { MockApiClient, IApiClientRequestOptions, ... } from '...'

let fabricApiClientCallback = async (req) => {
  // URL construction, header manipulation, method switching
  let baseUrl = req.url ?? 'https://api.fabric.test' + req.pathTemplate
  let curHeaders = { 'Authorization': 'mock token' }
  
  switch (req.method) {
    case 'GET': /* complex response construction */ break
    case 'POST': /* more complex logic */ break
  }
  
  // Pipeline and response object assembly (20+ more lines)
  return complexResponseObject
}

fabricApiClient.setCallBack(fabricApiClientCallback)
```

### After: Simple HTTP Interception (20 lines)
```typescript
// Import from API package for satellite extensions
import { IFakeFabricApiClient } from '@fabric/vscode-fabric-api'

// Access through test hooks from core extension
const fakeFabricApiClient = core.testHooks['fakeFabricApiClient'] as IFakeFabricApiClient;

fakeFabricApiClient.respondWith(async (request) => {
  if (request.method === 'GET') {
    return { status: 200, headers: {...}, bodyAsText: JSON.stringify(mockData), request }
  }
  return { status: 400, ... }
})
```

**Results:** 56% code reduction, simplified logic, real implementation preserved, proper type safety

## Alternatives Considered

- **Status Quo**: High maintenance, implementation drift
- **Sinon.js**: Complex setup, mocks too much business logic  
- **Pure Unit Testing**: Misses integration issues

## Success Metrics

- **Complete Testing Framework**: Four test types (Unit, Integration, E2E Integration, UI) with appropriate tools for each
- **Unified Integration Backend**: Single backdoor (`FakeFabricApiClient`) replaces all Mock* classes in integration tests
- **Clean Unit Testing**: Pure Moq.ts/Sinon usage without extension runtime dependencies
- **Code Reduction**: Remove ~1000 lines of duplicate mock implementations across all test types
- **Real Implementation Testing**: Business logic, validation, telemetry, and error handling execute normally in integration tests
- **Satellite Extension Support**: `@microsoft/vscode-fabric-api` exports enable consistent testing across extensions via test hook system
- **Authentication Simplification**: HTTP interception eliminates `getToken()` calls in offline tests, service principal tokens for E2E

## Future Considerations

**Test Hook System Considerations:**
The existing test hook system provides the foundation for `FakeFabricApiClient` exposure to satellite extensions. While the test hook system itself is debatable as its own topic, it currently serves as the mechanism for cross-extension test coordination and is be leveraged for this strategy.
