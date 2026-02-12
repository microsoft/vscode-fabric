# API Compatibility Guidelines

## Workflow Interface Changes

### Background

The workflow interfaces (`IGetArtifactDefinitionWorkflow`, `IUpdateArtifactDefinitionWorkflow`, `ICreateArtifactWithDefinitionWorkflow`) are implemented by satellite extensions and consumed by the core extension. Changes to these interfaces must maintain backward compatibility.

### Folder Parameter - Backward Compatible Change

**Change Made:**
The `folder` parameter in workflow methods was changed to be optional (`folder?: vscode.Uri`) to support scenarios where a folder may not be available (e.g., remote view operations).

**Why This Is Backward Compatible:**

1. **Interface Definition (API):**
   ```typescript
   // New interface (backward compatible)
   onBeforeGetDefinition?(artifact: IArtifact, folder?: vscode.Uri, options?: IApiClientRequestOptions): Promise<IApiClientRequestOptions>;
   ```

2. **Existing Satellite Implementation:**
   ```typescript
   // Old implementation - still works!
   async onBeforeGetDefinition(artifact: IArtifact, folder: vscode.Uri, options: IApiClientRequestOptions): Promise<IApiClientRequestOptions> {
       // Implementation assuming folder is always provided
   }
   ```

3. **New Satellite Implementation:**
   ```typescript
   // New implementation - can handle undefined
   async onBeforeGetDefinition(artifact: IArtifact, folder?: vscode.Uri, options?: IApiClientRequestOptions): Promise<IApiClientRequestOptions> {
       // Implementation that handles folder being undefined
       if (!folder) {
           // Handle remote view scenario
       }
   }
   ```

## Runtime Compatibility Verification

### Question: Will there be runtime errors when mixing old and new API versions?

**Answer: No, there will be NO runtime errors in either direction.**

### Scenario 1: Old Core + New Satellite ❌ (Not Possible)

This scenario cannot occur because:
- The **core extension packages the API** (`@microsoft/vscode-fabric-api`)
- Satellites consume the API package published by the core
- If core hasn't been updated, satellites won't have the new API definitions
- Therefore, this scenario is prevented by the packaging model

### Scenario 2: New Core + Old Satellite ✅ (Fully Compatible)

**This is the critical scenario and it WORKS WITHOUT ERRORS.**

**Runtime Behavior:**
```typescript
// Core (NEW) - calls satellite with optional parameters
const artifactHandler = this.getArtifactHandler(artifact);
if (artifactHandler?.getDefinitionWorkflow?.onBeforeGetDefinition) {
    // Core passes: artifact, folder (may be undefined), apiRequestOptions (always defined)
    apiRequestOptions = await artifactHandler.getDefinitionWorkflow.onBeforeGetDefinition(
        artifact, 
        folder,           // May be undefined
        apiRequestOptions // Always defined
    );
}

// Satellite (OLD) - implements with required parameters
async onBeforeGetDefinition(
    artifact: IArtifact, 
    folder: vscode.Uri,              // Required parameter
    options: IApiClientRequestOptions // Required parameter
): Promise<IApiClientRequestOptions> {
    // When core passes undefined for folder:
    // - JavaScript ignores the type mismatch at runtime
    // - folder will be undefined inside this function
    // - If code uses folder without checking, it may throw
    
    // To be safe, old implementations should check:
    if (!folder) {
        // Handle gracefully or throw meaningful error
    }
}
```

**Why No Runtime Errors:**

1. **TypeScript Compatibility:**
   - TypeScript allows a function with required parameters to satisfy an interface with optional parameters
   - This is compile-time compatibility

2. **JavaScript Runtime:**
   - JavaScript doesn't enforce types at runtime
   - Passing `undefined` to a parameter expecting `vscode.Uri` is allowed
   - The parameter will simply be `undefined` inside the function

3. **Defensive Coding:**
   - The core implementations in this repo include validation:
     ```typescript
     if (!options) {
         throw new Error('options parameter is required');
     }
     ```
   - This catches misuse early with clear error messages

**Key Point:** The old satellite implementation will receive `undefined` when the core passes it. If the old implementation doesn't check for `undefined`, it could throw when trying to use the folder. However:
- This is **not an API compatibility error**
- This is a **logical error** in the satellite code for not handling optional parameters
- The core always passed `folder` before, so existing satellites likely never handled undefined anyway

### Scenario 3: New Core + New Satellite ✅ (Optimal)

Both components understand optional parameters:

```typescript
// Core (NEW)
apiRequestOptions = await handler.onBeforeGetDefinition(artifact, folder, apiRequestOptions);
// Passes folder as undefined for remote view scenarios

// Satellite (NEW)
async onBeforeGetDefinition(artifact: IArtifact, folder?: vscode.Uri, options?: IApiClientRequestOptions) {
    if (!folder) {
        // Properly handle remote view scenario
    }
    // Use folder...
}
```

**Perfect compatibility, no issues.**

### Migration Path for Satellite Extensions

If a satellite extension wants to support both old and new core versions:

```typescript
async onBeforeGetDefinition(
    artifact: IArtifact, 
    folder?: vscode.Uri,              // Use optional to match new interface
    options?: IApiClientRequestOptions
): Promise<IApiClientRequestOptions> {
    // Validate required parameters
    if (!options) {
        throw new Error('options parameter is required');
    }
    
    // Handle optional folder
    if (folder) {
        // Use folder for local scenarios
    } else {
        // Handle remote view scenario
    }
    
    return options;
}
```

**Key Points:**

- Using `folder?: vscode.Uri` (optional parameter) is backward compatible because:
  - Implementations can choose to ignore the optional parameter
  - TypeScript allows a required parameter to match an optional one in an interface
  - Satellite extensions don't need to be updated to work with the new interface

- **NOT backward compatible** would be:
  - `folder: vscode.Uri | undefined` - This REQUIRES implementations to accept undefined
  - This would break existing satellites that only accept `vscode.Uri`

### Best Practices

1. **Adding Optional Parameters:**
   - ✅ Use `parameter?: Type` to add new optional parameters
   - ❌ Avoid `parameter: Type | undefined` for existing required parameters

2. **Making Required Parameters Optional:**
   - ✅ Change `parameter: Type` to `parameter?: Type`
   - ❌ Avoid `parameter: Type | undefined`

3. **Handling Optional Parameters in Core:**
   - Always pass the parameter (even if undefined) to maintain consistency
   - Let satellite implementations decide how to handle undefined values

4. **Handling Optional Parameters in Satellites:**
   - New implementations should handle undefined values appropriately
   - Old implementations can continue to ignore optional parameters (but should add defensive checks)

### Example: Avoiding Breaking Changes

**Breaking Change (❌ Don't do this):**
```typescript
// Interface change
onBeforeGetDefinition?(artifact: IArtifact, folder: vscode.Uri | undefined, options: IApiClientRequestOptions): Promise<...>;

// Existing satellite implementation breaks!
async onBeforeGetDefinition(artifact: IArtifact, folder: vscode.Uri, options: IApiClientRequestOptions): Promise<...> {
    // This no longer matches the interface signature
    // TypeScript error: folder type is too restrictive
}
```

**Backward Compatible Change (✅ Do this):**
```typescript
// Interface change
onBeforeGetDefinition?(artifact: IArtifact, folder?: vscode.Uri, options?: IApiClientRequestOptions): Promise<...>;

// Existing satellite implementation still works!
async onBeforeGetDefinition(artifact: IArtifact, folder: vscode.Uri, options: IApiClientRequestOptions): Promise<...> {
    // This still matches the interface
    // TypeScript is happy because required params can match optional params
    
    // Runtime: folder could be undefined when called by new core
    // Add defensive check if not already present:
    if (!folder) {
        throw new Error('folder parameter is required for this operation');
    }
}
```

### Summary

**To directly answer: "If core is using the old API and a satellite is using the new API, there will be no runtime errors?"**

**Answer: This scenario (old core + new satellite) cannot occur due to the packaging model.** The core publishes the API package that satellites consume.

**The actual scenario is: "New core + old satellite"**

**Answer: There will be NO runtime errors from the API change itself.** 

- TypeScript compatibility ensures the code compiles
- JavaScript runtime handles undefined parameters gracefully
- Old satellite may throw if it uses `folder` without checking for undefined
- This is a logical error in the satellite, not an API compatibility error
- Core implementations include validation to catch issues early

When modifying public API interfaces:
1. Consider the impact on existing satellite extensions
2. Use optional parameters (`?`) for backward compatibility
3. Avoid union types with undefined (`| undefined`) when changing existing required parameters
4. Add defensive coding in implementations
5. Document the change and migration path
