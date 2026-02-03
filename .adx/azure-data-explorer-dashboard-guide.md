# Azure Data Explorer Dashboard Development Guide

This guide documents the process of creating and modifying Azure Data Explorer (ADX) dashboards through JSON configuration files, based on lessons learned while building the Core Fabric Extension Health dashboard. Documentation for ADX can be found here: https://learn.microsoft.com/en-us/azure/data-explorer/azure-data-explorer-dashboards

## Table of Contents

- [Dashboard Structure Overview](#dashboard-structure-overview)
- [Critical Schema Requirements](#critical-schema-requirements)
- [Adding a New Tile](#adding-a-new-tile)
- [Adding a New Page](#adding-a-new-page)
- [Adding a New Parameter](#adding-a-new-parameter)
- [Common Pitfalls and Solutions](#common-pitfalls-and-solutions)
- [Query Best Practices](#query-best-practices)
- [Testing Workflow](#testing-workflow)

## Dashboard Structure Overview

An ADX dashboard JSON file has the following top-level structure:

```json
{
  "$schema": "https://dataexplorer.azure.com/static/d/schema/63/dashboard.json",
  "id": "uuid",
  "eTag": "uuid",
  "title": "Dashboard Title",
  "schema_version": 63,
  "pagesNavWidth": 297.7777404785156,
  "tiles": [], // Visual elements on pages
  "baseQueries": [], // Reusable query definitions
  "parameters": [], // User-controllable filters
  "dataSources": [], // Kusto cluster connections
  "pages": [], // Page definitions
  "queries": [] // KQL query definitions
}
```

### Key Relationships

- **Tiles** reference **queries** via `queryRef.queryId`
- **Tiles** belong to **pages** via `pageId`
- **Queries** can reference **baseQueries** via the variable name (e.g., `_events`)
- **Parameters** can be populated by **queries** via `dataSource.queryRef.queryId`
- **Queries** and **baseQueries** reference **dataSources** via `dataSourceId`

## Critical Schema Requirements

### 1. UUID Format (RFC 4122)

**All IDs must be valid UUIDs** in the format: `xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx`

IDs are required for:

- Dashboard `id` and `eTag`
- `tiles[].id`
- `tiles[].pageId`
- `tiles[].queryRef.queryId`
- `baseQueries[].id`
- `baseQueries[].queryId`
- `parameters[].id`
- `parameters[].dataSource.queryRef.queryId`
- `dataSources[].id`
- `pages[].id`
- `queries[].id`
- `queries[].dataSource.dataSourceId`

❌ **Invalid**: `"id": "tile-001"` or `"id": "query-daily-sessions"`

✅ **Valid**: `"id": "a1b2c3d4-e5f6-4789-a0bc-111111111111"`

### 2. Parameter Selection Types

For string parameters, `selectionType` must be one of:

- `"scalar"` - Single selection
- `"array"` - Multiple selection
- `"freetext"` - Free text input

❌ **Invalid**: `"selectionType": "single"`

✅ **Valid**: `"selectionType": "scalar"`

### 3. Query References in Tiles

Tiles reference queries using this exact structure:

```json
"queryRef": {
    "kind": "query",
    "queryId": "uuid-of-query"
}
```

**Not** `"baseQueryId"` - that's only used in different contexts.

## Adding a New Tile

### Step 1: Define the Tile in `tiles[]`

Add a tile object with:

- Unique UUID `id`
- `pageId` matching an existing page
- `layout` coordinates (x, y, width, height)
- `queryRef` pointing to a query
- `visualOptions` specific to the visualization type

```json
{
  "id": "f1a2b3c4-d5e6-4789-f2ab-111111111136",
  "title": "My New Metric",
  "visualType": "card",
  "pageId": "b1c2d3e4-f5a6-4789-b0cd-222222222222",
  "layout": {
    "x": 0,
    "y": 0,
    "width": 4,
    "height": 3
  },
  "queryRef": {
    "kind": "query",
    "queryId": "a1b2c3d4-e5f6-4789-a0bc-111111111137"
  },
  "visualOptions": {
    "crossFilterDisabled": false,
    "drillthroughDisabled": false,
    "crossFilter": [],
    "drillthrough": []
  }
}
```

### Step 2: Create the Query in `queries[]`

Add a query object with:

- Matching UUID `id` from tile's `queryRef.queryId`
- `dataSource` reference
- KQL `text`
- `usedVariables` array listing all parameters/base queries used

```json
{
  "id": "a1b2c3d4-e5f6-4789-a0bc-111111111137",
  "dataSource": {
    "kind": "inline",
    "dataSourceId": "c1d2e3f4-a5b6-4789-c1de-aaaaaaaaaaaa"
  },
  "text": "_events\n| where EventName == \"fabric.vscode-fabric/item/create\"\n| summarize Count = count()",
  "usedVariables": ["_events"]
}
```

### Step 3: Layout Positioning

Dashboard grid typically has:

- Width: ~20-23 units
- X coordinate: 0 to ~20
- Y coordinate: starts at 0, tiles stack vertically

**Tip**: Look at existing tiles on the same page to find available space.

## Adding a New Page

### Step 1: Add Page Definition in `pages[]`

```json
{
  "name": "My New Page",
  "id": "e1f2a3b4-c5d6-4789-e0fa-555555555555"
}
```

### Step 2: Add Tiles with Matching `pageId`

Create tiles with `pageId` matching the new page's `id`:

```json
{
  "id": "tile-uuid",
  "title": "Page Tile",
  "visualType": "line",
  "pageId": "e1f2a3b4-c5d6-4789-e0fa-555555555555", // Matches page ID
  "layout": { "x": 0, "y": 0, "width": 12, "height": 6 },
  "queryRef": { "kind": "query", "queryId": "query-uuid" },
  "visualOptions": {
    /* ... */
  }
}
```

## Adding a New Parameter

### Step 1: Define Parameter in `parameters[]`

```json
{
  "kind": "string",
  "id": "c1d2e3f4-a5b6-4789-c2de-bbbbbbbbbbbb",
  "displayName": "Item Type",
  "description": "",
  "variableName": "_ItemType",
  "selectionType": "scalar",
  "includeAllOption": true,
  "defaultValue": {
    "kind": "all"
  },
  "dataSource": {
    "kind": "query",
    "columns": {
      "value": "ItemType"
    },
    "queryRef": {
      "kind": "query",
      "queryId": "d1e2f3a4-b5c6-4789-d5ef-cccccccccccc"
    },
    "autoReset": true
  },
  "showOnPages": {
    "kind": "all"
  }
}
```

### Step 2: Create Query to Populate Parameter

```json
{
  "id": "d1e2f3a4-b5c6-4789-d5ef-cccccccccccc",
  "dataSource": {
    "kind": "inline",
    "dataSourceId": "datasource-uuid"
  },
  "text": "_events\n| where EventName has \"item/\"\n| extend ItemType = tostring(Properties[\"itemtype\"])\n| where isnotempty(ItemType)\n| distinct ItemType\n| order by ItemType asc",
  "usedVariables": ["_events"]
}
```

### Step 3: Use Parameter in Queries

Reference the parameter in KQL using bracket syntax:

```kusto
| where isempty(['_ItemType']) or ItemType == ['_ItemType']
```

## Common Pitfalls and Solutions

### Problem 1: Card Shows Number Instead of Percentage String

**Symptom**: Success rate card displays `247` instead of `"61.0%"`

**Cause**: Query returns multiple columns; card picks the first numeric column.

**Solution**: Use `| project SuccessRateString` to return only the desired column:

```kusto
_events
| where EventName == "fabric.vscode-fabric/item/create"
| extend State = tobool(Properties["succeeded"])
| summarize Success = countif(State == true), Failed = countif(State == false)
| extend SuccessRate = round((Success * 1.0 / (Success + Failed))*100, 1)
| extend SuccessRateString = strcat(tostring(SuccessRate), "%")
| project SuccessRateString  // ← Only return this column
```

### Problem 2: Import Fails with UUID Format Errors

**Symptom**: Multiple errors like "Needs to follow the UUID format as defined by RFC 4122"

**Cause**: IDs use descriptive strings instead of UUIDs.

**Solution**: Replace all IDs with proper UUID format: `xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx`

### Problem 3: Parameter Selection Type Error

**Symptom**: `"selectionType": "single"` causes validation error

**Cause**: Invalid value for `selectionType`.

**Solution**: Use `"scalar"` for single selection, `"array"` for multiple selection.

### Problem 4: Duplicate Parameters

**Symptom**: Multiple identical parameters in the `parameters[]` array.

**Cause**: Editing errors or merge conflicts.

**Solution**: Remove duplicates, keeping only one definition per `variableName`.

## Query Best Practices

### 1. Always Reference Base Query

Start queries with the base query variable to ensure consistent filtering:

```kusto
_events
| where EventName == "fabric.vscode-fabric/item/create"
| ...
```

### 2. Declare Used Variables

Always list parameters and base queries in `usedVariables`:

```json
"usedVariables": [
    "_events",
    "_ItemType",
    "_startTime",
    "_endTime"
]
```

### 3. Filter Non-Actionable Data

Exclude user cancellations and auth errors:

```kusto
// Exclude cancellations
| extend Message = tostring(Properties["message"])
| where not(Message contains 'Cancel')

// Exclude auth errors
| extend ErrorMessage = tostring(Properties['errormessage'])
| where ErrorMessage != "auth-error"
```

### 4. Handle Optional Parameters

Use `isempty()` to make parameter filtering optional:

```kusto
| where isempty(['_ItemType']) or ItemType == ['_ItemType']
```

### 5. Convert Milliseconds to Seconds for Duration

Make durations human-readable:

```kusto
| extend Duration_ms = todouble(Measures['activitydurationinmilliseconds'])
| summarize P90_seconds = round(percentile(Duration_ms, 90) / 1000, 2)
```

## Visualization-Specific Configuration

### Card Visualizations

For percentage cards with color thresholds:

```json
"visualOptions": {
    "card__aggregationType": "uniqueValues",
    "card__columnToAggregate": "SuccessRateString",
    "card__colorRules": [
        {
            "greaterThan": 95,
            "color": "#009e49"  // Green
        },
        {
            "greaterThan": 90,
            "color": "#f2c80f"  // Yellow
        },
        {
            "greaterThan": 0,
            "color": "#fd625e"  // Red
        }
    ]
}
```

### Line/Timechart Visualizations

```json
"visualOptions": {
    "multipleYAxes": {
        "base": {
            "id": "-1",
            "label": "",
            "columns": [],
            "yAxisMaximumValue": null,
            "yAxisMinimumValue": null,
            "yAxisScale": "linear",
            "horizontalLines": []
        },
        "additional": [],
        "showMultiplePanels": false
    },
    "hideLegend": false,
    "crossFilterDisabled": false,
    "drillthroughDisabled": false,
    "crossFilter": [],
    "drillthrough": []
}
```

### Pie Chart Visualizations

```json
"visualOptions": {
    "pie__labelColumns": [
        "percentage",
        "value"
    ],
    "pie__orderBy": "size",
    "pie__kind": "pie",
    "pie__topNSlices": null
}
```

### Table Visualizations

Minimal configuration required:

```json
"visualOptions": {
    "crossFilterDisabled": false,
    "drillthroughDisabled": false,
    "crossFilter": [],
    "drillthrough": []
}
```

## Testing Workflow

### 1. Test Queries in ADX Web UI First

Before adding to dashboard:

1. Open Azure Data Explorer web UI
2. Connect to your cluster/database
3. Test the KQL query with sample parameters
4. Verify the output format matches expectations
5. Check column names match visualization requirements

### 2. Start Small

When building a new dashboard:

1. Create dashboard with 1 page and 1 tile
2. Import and verify it works
3. Add tiles incrementally
4. Import and test after each addition
5. Fix errors immediately before adding more

### 3. Common Import Errors

After import, check for:

- UUID format errors → Replace with valid UUIDs
- Parameter selection type errors → Use `"scalar"` or `"array"`
- Missing required properties → Check schema documentation
- Duplicate definitions → Remove duplicates

### 4. Validate Incrementally

Don't build the entire dashboard before testing. Add features in this order:

1. Base query + 1 simple tile
2. Parameters (if needed)
3. Additional tiles on same page
4. New pages with tiles
5. Complex visualizations last

## Reference: Complete Minimal Dashboard

Here's a minimal valid dashboard to use as a template:

```json
{
  "$schema": "https://dataexplorer.azure.com/static/d/schema/63/dashboard.json",
  "id": "f1a2b3c4-d5e6-4789-a0bc-def123456789",
  "eTag": "00000000-0000-0000-0000-000000000000",
  "title": "My Dashboard",
  "schema_version": 63,
  "pagesNavWidth": 297.7777404785156,
  "tiles": [
    {
      "id": "a1b2c3d4-e5f6-4789-a0bc-111111111111",
      "title": "Daily Count",
      "visualType": "line",
      "pageId": "b1c2d3e4-f5a6-4789-b0cd-222222222222",
      "layout": {
        "x": 0,
        "y": 0,
        "width": 12,
        "height": 6
      },
      "queryRef": {
        "kind": "query",
        "queryId": "c1d2e3f4-a5b6-4789-c0de-444444444444"
      },
      "visualOptions": {
        "multipleYAxes": {
          "base": {
            "id": "-1",
            "label": "",
            "columns": [],
            "yAxisMaximumValue": null,
            "yAxisMinimumValue": null,
            "yAxisScale": "linear",
            "horizontalLines": []
          },
          "additional": [],
          "showMultiplePanels": false
        },
        "hideLegend": false,
        "crossFilterDisabled": false,
        "drillthroughDisabled": false,
        "crossFilter": [],
        "drillthrough": []
      }
    }
  ],
  "baseQueries": [
    {
      "id": "d1e2f3a4-b5c6-4789-d0ef-555555555555",
      "queryId": "e1f2a3b4-c5d6-4789-e0fa-666666666666",
      "variableName": "_events"
    }
  ],
  "parameters": [
    {
      "kind": "duration",
      "id": "f1a2b3c4-d5e6-4789-f0ab-777777777777",
      "displayName": "Time range",
      "description": "",
      "beginVariableName": "_startTime",
      "endVariableName": "_endTime",
      "defaultValue": {
        "kind": "dynamic",
        "count": 30,
        "unit": "days"
      },
      "showOnPages": {
        "kind": "all"
      }
    }
  ],
  "dataSources": [
    {
      "id": "c1d2e3f4-a5b6-4789-c1de-aaaaaaaaaaaa",
      "name": "mycluster",
      "clusterUri": "https://mycluster.kusto.windows.net/",
      "database": "MyDatabase",
      "kind": "manual-kusto",
      "scopeId": "kusto"
    }
  ],
  "pages": [
    {
      "name": "Overview",
      "id": "b1c2d3e4-f5a6-4789-b0cd-222222222222"
    }
  ],
  "queries": [
    {
      "id": "e1f2a3b4-c5d6-4789-e0fa-666666666666",
      "dataSource": {
        "kind": "inline",
        "dataSourceId": "c1d2e3f4-a5b6-4789-c1de-aaaaaaaaaaaa"
      },
      "text": "MyTable\n| where Timestamp between (['_startTime'] .. ['_endTime'])",
      "usedVariables": ["_startTime", "_endTime"]
    },
    {
      "id": "c1d2e3f4-a5b6-4789-c0de-444444444444",
      "dataSource": {
        "kind": "inline",
        "dataSourceId": "c1d2e3f4-a5b6-4789-c1de-aaaaaaaaaaaa"
      },
      "text": "_events\n| summarize Count = count() by Day = startofday(Timestamp)\n| order by Day asc",
      "usedVariables": ["_events"]
    }
  ]
}
```

## Additional Resources

- [Azure Data Explorer Dashboard Documentation](https://learn.microsoft.com/en-us/azure/data-explorer/azure-data-explorer-dashboards)
- [KQL (Kusto Query Language) Reference](https://learn.microsoft.com/en-us/kusto/query/?view=microsoft-fabric)
- [Dashboard JSON Schema](https://dataexplorer.azure.com/static/d/schema/63/dashboard.json)

## Troubleshooting Checklist

Before importing your dashboard, verify:

- [ ] All IDs are valid UUIDs (RFC 4122 format)
- [ ] All tile `pageId` values match existing page `id` values
- [ ] All tile `queryRef.queryId` values match query `id` values
- [ ] All query `dataSource.dataSourceId` values match data source `id` values
- [ ] All parameter `selectionType` values are `"scalar"`, `"array"`, or `"freetext"`
- [ ] All queries list used variables in `usedVariables` array
- [ ] Base query references use correct variable name (`_events`, not `events`)
- [ ] Card queries use `| project ColumnName` to return single column
- [ ] No duplicate parameter definitions
- [ ] Layout coordinates don't overlap unintentionally
- [ ] KQL queries tested in ADX web UI first

## Summary

Key lessons learned:

1. **UUIDs are mandatory** - No exceptions for any ID field
2. **Test incrementally** - Don't build everything before first import
3. **Project single columns for cards** - Avoid ambiguity in visualization
4. **Use proper selection types** - `"scalar"` not `"single"`
5. **Reference base queries** - Ensures consistent filtering
6. **Test KQL separately first** - Catch query errors before schema errors
