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
   - Old implementations can continue to ignore optional parameters

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
}
```

### Summary

When modifying public API interfaces:
1. Consider the impact on existing satellite extensions
2. Use optional parameters (`?`) for backward compatibility
3. Avoid union types with undefined (`| undefined`) when changing existing required parameters
4. Test that existing implementations continue to work
5. Document the change and migration path
