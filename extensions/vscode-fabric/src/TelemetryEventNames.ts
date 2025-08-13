import { ApiResultPropertyNames, ArtifactManagerResultPropertyNames, ArtifactPropertyNames, ResultPropertyNames, WorkspacePropertyNames } from '@fabric/vscode-fabric-util';

/* eslint-disable @typescript-eslint/naming-convention */
export type CoreTelemetryEventNames = {

	// workspace manager
	'workspace/create': { properties: WorkspacePropertyNames | ApiResultPropertyNames; measurements: never }
	'workspace/open': { properties: ApiResultPropertyNames; measurements: never }
	'workspace/load-items': { properties: ResultPropertyNames | 'itemCount' | 'displayStyle'; measurements: never }

	// artifact manager
	'item/create': { properties: ArtifactManagerResultPropertyNames; measurements: never },
	'item/read': { properties: ArtifactManagerResultPropertyNames; measurements: never },
	'item/update': { properties: ArtifactManagerResultPropertyNames; measurements: never },
	'item/delete': { properties: ArtifactManagerResultPropertyNames; measurements: never },
	'item/export': { properties: ArtifactManagerResultPropertyNames; measurements: never },
	'item/import': { properties: ArtifactManagerResultPropertyNames; measurements: never },
	'item/open': { properties: ResultPropertyNames | ArtifactPropertyNames; measurements: never },
	'item/open/portal': { properties: ArtifactPropertyNames; measurements: never },

	// tenant management
	'tenant/switch': { properties: ResultPropertyNames; measurements: never }

	// tree view
	'tree/installExtension': { properties: 'extensionId' | 'alreadyInstalled' | 'installedAfterOneMinute'; measurements: never }
};