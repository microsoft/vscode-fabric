// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SqlArtifactType } from './AbstractDatabaseTreeNode';

export interface SqlDatabaseApiResponse {
  description: string;
  displayName: string;
  folderId: string;
  id: string;
  properties: SqlDatabaseProperties;
  tags: ItemTag[];
  type: SqlArtifactType;
  workspaceId: string;
}

export interface SqlDatabaseProperties {
  connectionString: string;
  databaseName: string;
  serverFqdn: string;
}

export interface ItemTag {
    displayName: string;
    id: string;
}

export interface SqlEndpontGetConnectionStringResponse {
  connectionString: string;
}
