# Core Fabric Extension Health Dashboard

## Overview

This dashboard provides actionable health metrics for the Core VS Code Fabric extension (`fabric.vscode-fabric`), excluding non-actionable data such as user cancellations and authentication errors.

## Parameters

### Time Range

- **Default**: Last 30 days
- **Purpose**: Filter all data to a specific time period

### Core Extension Version

- **Type**: Multi-select
- **Default**: All versions
- **Purpose**: Filter metrics by specific extension version(s) to compare releases or isolate issues

### Item Type

- **Type**: Single-select
- **Default**: All types
- **Purpose**: Filter item-related operations (create/open) by specific Fabric item types (e.g., Notebook, Lakehouse, Warehouse, etc.)

## Page 1: Overview

### Daily Active Sessions

- **Visual Type**: Line chart
- **Purpose**: Track daily unique VS Code sessions using the Core Fabric extension
- **Metric**: Count of distinct `VSCodeSessionId` per day
- **Use Case**: Monitor overall extension adoption and usage trends over time

### Item Create Success Rate

- **Visual Type**: Card with color thresholds
- **Purpose**: Monitor reliability of item creation operations
- **Metric**: Percentage of successful item create operations (excluding user cancellations)
- **Color Coding**:
  - 🟢 Green (>95%): Healthy
  - 🟡 Yellow (90-95%): Warning
  - 🔴 Red (<90%): Critical
- **Filters Applied**:
  - Excludes operations where user cancelled (message contains 'Cancel')
  - Respects Item Type parameter filter
- **Event**: `fabric.vscode-fabric/item/create`

### Workspace Create Success Rate

- **Visual Type**: Card with color thresholds
- **Purpose**: Monitor reliability of workspace creation operations
- **Metric**: Percentage of successful workspace create operations (excluding user cancellations)
- **Color Coding**:
  - 🟢 Green (>95%): Healthy
  - 🟡 Yellow (90-95%): Warning
  - 🔴 Red (<90%): Critical
- **Filters Applied**: Excludes operations where user cancelled (message contains 'Cancel')
- **Event**: `fabric.vscode-fabric/workspace/create`

### Item Open Success Rate

- **Visual Type**: Card with color thresholds
- **Purpose**: Monitor reliability of item open operations
- **Metric**: Percentage of successful item open operations (excluding user cancellations)
- **Color Coding**:
  - 🟢 Green (>95%): Healthy
  - 🟡 Yellow (90-95%): Warning
  - 🔴 Red (<90%): Critical
- **Filters Applied**:
  - Excludes operations where user cancelled (message contains 'Cancel')
  - Respects Item Type parameter filter
- **Event**: `fabric.vscode-fabric/item/open`

### Sessions by OS

- **Visual Type**: Pie chart
- **Purpose**: Understand the distribution of users across different operating systems
- **Metric**: Count of unique sessions grouped by Platform (Windows, macOS, Linux)
- **Use Case**: Identify platform-specific issues or prioritize platform support

## Page 2: Errors

### Error Trend (Excluding Cancellations)

- **Visual Type**: Column chart
- **Purpose**: Track daily error counts to identify spikes or trends
- **Metric**: Count of errors per day
- **Filters Applied**:
  - Excludes authentication errors (`errormessage != "auth-error"`)
  - Excludes user cancellations (message does not contain 'Cancel')
- **Event**: Events ending with `extension/error`
- **Use Case**: Detect error rate increases that may indicate regressions or issues

### Top Errors by Fault

- **Visual Type**: Table (top 50)
- **Purpose**: Identify the most common error types for prioritization
- **Metric**: Count of errors grouped by fault/error message
- **Columns**: Fault (non-localized message or fault name), Error Count
- **Filters Applied**:
  - Excludes authentication errors
  - Excludes user cancellations
- **Data Source**: Uses `nonlocalizedmessage` property (for aggregatable errors) or falls back to `fault` property
- **Use Case**: Prioritize bug fixes based on error frequency

## Page 3: Operations

### Item Update Success Rate

- **Visual Type**: Card with color thresholds
- **Purpose**: Monitor reliability of item update/save operations
- **Metric**: Percentage of successful item update operations (excluding user cancellations)
- **Color Coding**: 🟢 Green (>95%), 🟡 Yellow (90-95%), 🔴 Red (<90%)
- **Filters Applied**: Excludes cancellations, respects Item Type filter
- **Event**: `fabric.vscode-fabric/item/update`

### Item Delete Success Rate

- **Visual Type**: Card with color thresholds
- **Purpose**: Monitor reliability of item deletion operations
- **Metric**: Percentage of successful item delete operations (excluding user cancellations)
- **Color Coding**: 🟢 Green (>95%), 🟡 Yellow (90-95%), 🔴 Red (<90%)
- **Filters Applied**: Excludes cancellations, respects Item Type filter
- **Event**: `fabric.vscode-fabric/item/delete`

### Workspace Open Success Rate

- **Visual Type**: Card with color thresholds
- **Purpose**: Monitor reliability of workspace open operations
- **Metric**: Percentage of successful workspace open operations (excluding user cancellations)
- **Color Coding**: 🟢 Green (>95%), 🟡 Yellow (90-95%), 🔴 Red (<90%)
- **Filters Applied**: Excludes cancellations
- **Event**: `fabric.vscode-fabric/workspace/open`

### Load Items Success Rate

- **Visual Type**: Card with color thresholds
- **Purpose**: Monitor reliability of workspace item listing operations
- **Metric**: Percentage of successful load-items operations (excluding user cancellations)
- **Color Coding**: 🟢 Green (>95%), 🟡 Yellow (90-95%), 🔴 Red (<90%)
- **Filters Applied**: Excludes cancellations
- **Event**: `fabric.vscode-fabric/workspace/load-items`
- **Use Case**: Detect issues with workspace item enumeration that could impact user experience

### Item Create by Type

- **Visual Type**: Column chart
- **Purpose**: Show distribution of item creation activity across different item types
- **Metric**: Count of item create operations grouped by item type
- **Event**: `fabric.vscode-fabric/item/create`
- **Use Case**: Understand which item types are most commonly created, identify popular features

### Item Open by Type

- **Visual Type**: Column chart
- **Purpose**: Show distribution of item open activity across different item types
- **Metric**: Count of item open operations grouped by item type
- **Event**: `fabric.vscode-fabric/item/open`
- **Use Case**: Understand which item types are most commonly accessed, identify popular workflows

## Page 4: Performance

### Operation Duration P90 (seconds)

- **Visual Type**: Table
- **Purpose**: Identify slow operations that may impact user experience
- **Metrics**:
  - P50 (median): 50th percentile duration in seconds
  - P90: 90th percentile duration in seconds
  - P95: 95th percentile duration in seconds
  - Count: Number of operations
- **Operations Tracked**:
  - `item/create`, `item/open`, `item/update`
  - `workspace/create`, `workspace/open`, `workspace/load-items`
- **Sorting**: Ordered by P90 (slowest operations first)
- **Use Case**: Prioritize performance optimization efforts on slowest operations

### Item Create Duration Trend (P90)

- **Visual Type**: Line chart
- **Purpose**: Track performance trends for item creation over time
- **Metric**: P90 duration in seconds per day
- **Event**: `fabric.vscode-fabric/item/create`
- **Use Case**: Detect performance regressions or improvements in item creation workflow

### Load Items Duration by Item Count

- **Visual Type**: Line chart
- **Purpose**: Understand how workspace item count impacts load-items performance
- **Metrics**:
  - P50 and P90 duration in seconds
  - Grouped by item count buckets (bins of 10 items)
- **Event**: `fabric.vscode-fabric/workspace/load-items`
- **Filters**: Only includes workspaces with ≤200 items
- **Use Case**: Identify performance scaling issues, understand when pagination or optimization is needed

## Data Filtering Philosophy

## Page 5: Open in VS Code

### Open in VS Code events

- **Visual Type**: Timechart
- **Purpose**: Track the volume of 'Open in VS Code' requests over time
- **Metric**: Count of `handle-uri` events per day
- **Event**: `fabric.vscode-fabric/handle-uri`

### Open in VS Code reliability (Timechart)

- **Visual Type**: Timechart
- **Purpose**: Track the success rate of 'Open in VS Code' requests over time
- **Metric**: Percentage of successful operations per day
- **Filters Applied**:
  - Excludes 'Not signed in' errors
- **Event**: `fabric.vscode-fabric/handle-uri`

### Open in VS Code reliability (Card)

- **Visual Type**: Card
- **Purpose**: Overall success rate of 'Open in VS Code' requests
- **Metric**: Percentage of successful operations
- **Filters Applied**:
  - Excludes 'Not signed in' errors
  - Excludes user cancellations
- **Event**: `fabric.vscode-fabric/handle-uri`

### Open in VS Code errors

- **Visual Type**: Table
- **Purpose**: List failed 'Open in VS Code' requests for debugging
- **Columns**: ClientTimestamp, TargetEnvironment, Message, Callstack, UriQuery, VSCodeSessionId, Duration_seconds
- **Filters Applied**:
  - Shows only failed operations (`succeeded == false`)

### Open URL Errors

- **Visual Type**: Table
- **Purpose**: Aggregate top error messages for 'Open in VS Code'
- **Metric**: Count and percentage of each error message
- **Filters Applied**:
  - Excludes user cancellations
  - Shows only failed operations

### What's Included

- Production and development extension modes (excludes test mode)
- All Core extension telemetry (`ExtensionName == "fabric.vscode-fabric"`)
- Successful and failed operations (for success rate calculation)

### What's Excluded (Non-Actionable)

- **User Cancellations**: Operations where the user explicitly cancelled (detected via message containing 'Cancel' or `isCanceledError` flag)
- **Authentication Errors**: Auth-related failures that are typically transient or user environment issues
- **Test Mode**: Extension running in test/UI test mode (`ExtensionMode == 3`)

## Known Issues & Troubleshooting

### Issue: Card Shows Number Instead of Percentage

**Symptom**: Success rate cards show a large number (e.g., 247) instead of a percentage string (e.g., "95.3%")

**Root Cause**: The query correctly calculates `SuccessRateString` (e.g., "95.3%"), but the card visualization may be aggregating incorrectly or displaying the wrong column.

**Fix Options**:

1. Verify the card's `card__columnToAggregate` is set to `"SuccessRateString"` (not `"SuccessRate"`)
2. Ensure `card__aggregationType` is set to `"uniqueValues"`
3. If the query returns multiple rows, the card may be summing values - ensure the query returns a single row
4. Check if the query needs `| take 1` or `| summarize` to return a single result

**Current Query Structure**:

```kusto
| summarize Success = countif(State == true), Failed = countif(State == false)
| extend SuccessRate = round((Success * 1.0 / (Success + Failed))*100, 1)
| extend SuccessRateString = strcat(tostring(SuccessRate), "%")
```

This should return a single row with `SuccessRateString` column containing the percentage as a string.

## Maintenance

### Adding New Tiles

- Use proper UUID format for all IDs (RFC 4122 compliant)
- Reference the base query `_events` for consistent filtering
- Apply cancellation filtering: `| where not(Message contains 'Cancel')`
- Apply auth error filtering: `| where ErrorMessage != "auth-error"`

### Modifying Queries

- Test queries in Azure Data Explorer before updating the dashboard
- Ensure `usedVariables` array includes all parameters referenced in the query
- Use `isempty(['_Parameter'])` checks for optional parameter filtering
