// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Telemetry event names for the SQL satellite extension
 */
export type SqlSatelliteTelemetryEventNames = {
    'item/open/sql-ext': { properties: 'workspaceId' | 'artifactId' | 'itemType' | 'fabricArtifactName' | 'endpoint' | 'result'; measurements: never };
    'item/copy/connection-string': { properties: 'workspaceId' | 'artifactId' | 'itemType' | 'fabricArtifactName' | 'endpoint' | 'result'; measurements: never };
};
