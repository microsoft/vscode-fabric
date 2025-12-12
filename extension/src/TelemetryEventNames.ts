// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ApiResultPropertyNames, ArtifactManagerResultPropertyNames, ArtifactPropertyNames, ResultPropertyNames, WorkspacePropertyNames } from '@microsoft/vscode-fabric-util';

/* eslint-disable @typescript-eslint/naming-convention */
export type CoreTelemetryEventNames = {

	// workspace management
	'workspace/create': { properties: WorkspacePropertyNames | ApiResultPropertyNames; measurements: never }
	'workspace/open': { properties: ApiResultPropertyNames; measurements: never }
	'workspace/load-items': { properties: ResultPropertyNames | 'itemCount' | 'displayStyle'; measurements: never }
	'workspace/filter': { properties: ResultPropertyNames | 'totalWorkspaces' | 'selectedWorkspaces' | 'filterAction'; measurements: never }

	// artifact management
	'item/create': { properties: ArtifactManagerResultPropertyNames; measurements: never },
	'item/read': { properties: ArtifactManagerResultPropertyNames; measurements: never },
	'item/update': { properties: ArtifactManagerResultPropertyNames; measurements: never },
	'item/delete': { properties: ArtifactManagerResultPropertyNames; measurements: never },
	'item/export': { properties: ArtifactManagerResultPropertyNames; measurements: never },
	'item/import': { properties: ArtifactManagerResultPropertyNames | 'targetDetermination'; measurements: never },
	'item/open': { properties: ResultPropertyNames | ArtifactPropertyNames; measurements: never },
	'item/open/portal': { properties: ArtifactPropertyNames; measurements: never },
	'item/localFolder/open': { properties: ArtifactPropertyNames | 'actionTaken'; measurements: never },
	'item/localFolder/change': { properties: ArtifactPropertyNames | 'actionTaken'; measurements: never },

	// tenant management
	'tenant/switch': { properties: ResultPropertyNames; measurements: never }

	// tree view
	'tree/installExtension': { properties: 'extensionId' | 'alreadyInstalled' | 'installedAfterOneMinute'; measurements: never }

	// sign up flow
	'fabric/signUpCompleted': { properties: ResultPropertyNames | 'targetEnvironment' | 'uriQuery'; measurements: never }
	'fabric/signUpSuccessful': { properties: ResultPropertyNames; measurements: never }
	'fabric/signUpFailed': { properties: ResultPropertyNames; measurements: never }
	'fabric/signUpError': { properties: ResultPropertyNames; measurements: never }
};
