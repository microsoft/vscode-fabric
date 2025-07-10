/* eslint-disable security/detect-object-injection */
import * as vscode from 'vscode';
import { IArtifact } from '@fabric/vscode-fabric-api';

interface IFabricItemMetadata {
    displayName?: string;
    iconInformation?: { fileName: string, isThemed?: boolean };
    displayNamePlural?: string;
    portalFolder?: string;
    extensionId?: string;
}

// Many of these icons were copied from the PowerBIClients repo: https://dev.azure.com/powerbi/PowerBIClients/_git/PowerBIClients?path=/trident/libs/ux-angular/src/icons/svgs/artifact-monochrome&version=GBmaster&_a=contents
// The exceptions:
//   - AppDev icons (graph_ql_32 and function_set_32)
//      - Came from a hand-off from Seung Yang
//      - Converted to light/dark by changing 'fill="black"' to 'fill="white"' in the .svg files
// The other icons are themed by adding 'fill="white"' into the .svg files 
const fabricItemMetadata: Partial<Record<string, IFabricItemMetadata>> = {
    /* eslint-disable @typescript-eslint/naming-convention*/
    'UserDataFunction': {
        displayName: vscode.l10n.t('User data functions'),
        displayNamePlural: vscode.l10n.t('User data functions'),
        iconInformation: { fileName: 'function_set_32.svg', isThemed: true },
        portalFolder: 'userdatafunctions',
        extensionId: 'fabric.vscode-fabric-functions',
    },
    'GraphQLApi': {
        displayName: vscode.l10n.t('GraphQL API'),
        displayNamePlural: vscode.l10n.t('GraphQL API'),
        iconInformation: { fileName: 'graph_ql_32.svg', isThemed: true },
        portalFolder: 'graphql',
    },
    'SQLDatabase': {
        displayName: vscode.l10n.t('SQL Database'),
        displayNamePlural: vscode.l10n.t('SQL Databases'),
        iconInformation: { fileName: 'sql_database_24.svg', isThemed: true },
        portalFolder: 'sqldatabases',
    },

    'AISkill': {
        displayName: vscode.l10n.t('AI Skill'),
        displayNamePlural: vscode.l10n.t('AI Skills'),
        iconInformation: { fileName: 'ai_skill_24.svg', isThemed: true },
        portalFolder: 'aiskills',
    },
    'AppFrontEnd': {
        displayName: vscode.l10n.t('AppFrontEnd'),
        displayNamePlural: vscode.l10n.t('AppFrontEnds'),
        iconInformation: { fileName: 'sql_database_24.svg', isThemed: true },
    },
    'DataExploration': {
        displayName: vscode.l10n.t('Exploration'),
        displayNamePlural: vscode.l10n.t('Explorations'),
        iconInformation: { fileName: 'exploration_24.svg', isThemed: true },
    },
    'DataPipeline': {
        displayName: vscode.l10n.t('Data pipeline'),
        displayNamePlural: vscode.l10n.t('Data pipelines'),
        iconInformation: { fileName: 'pipeline_24.svg', isThemed: true },
        portalFolder: 'pipelines',
    },
    'Environment': {
        displayName: vscode.l10n.t('Environment'),
        displayNamePlural: vscode.l10n.t('Environments'),
        iconInformation: { fileName: 'environment_24.svg', isThemed: true },
        portalFolder: 'sparkenvironments',
    },
    'Eventhouse': {
        displayName: vscode.l10n.t('Eventhouse'),
        displayNamePlural: vscode.l10n.t('Eventhouses'),
        iconInformation: { fileName: 'event_house_32.svg', isThemed: true },
        portalFolder: 'eventhouses',
    },
    'Eventstream': {
        displayName: vscode.l10n.t('Eventstream'),
        displayNamePlural: vscode.l10n.t('Eventstreams'),
        iconInformation: { fileName: 'eventstream_24.svg', isThemed: true },
        portalFolder: 'eventstreams',
    },
    'ExternalFunctions': {
        displayName: vscode.l10n.t('Trident Function'),
        displayNamePlural: vscode.l10n.t('Trident Functions'),
        iconInformation: { fileName: 'sql_database_24.svg', isThemed: true },
    },
    'HLSCohort': {
        displayName: vscode.l10n.t('Cohort Builder'),
        displayNamePlural: vscode.l10n.t('Cohort Builders'),
        iconInformation: { fileName: 'cohort_32.svg', isThemed: true },
        portalFolder: 'hlscohorts',
    },
    'Homeone': {
        displayName: vscode.l10n.t('Homeone'),
        displayNamePlural: vscode.l10n.t('Homeones'),
        iconInformation: { fileName: 'pipeline_24.svg', isThemed: true },
        portalFolder: 'homeones',
    },
    'KustoDashboard': {
        displayName: vscode.l10n.t('Real-Time Dashboard'),
        displayNamePlural: vscode.l10n.t('Dashboards'),
        iconInformation: { fileName: 'real_time_dashboard_24.svg', isThemed: true },
        portalFolder: 'kustodashboards',
    },
    'KQLDashboard': {
        displayName: vscode.l10n.t('Real-Time Dashboard'),
        displayNamePlural: vscode.l10n.t('Real-Time Dashboards'),
        iconInformation: { fileName: 'real_time_dashboard_24.svg', isThemed: true },
        portalFolder: 'kustodashboards',
    },
    'KQLDatabase': {
        displayName: vscode.l10n.t('KQL Database'),
        displayNamePlural: vscode.l10n.t('Databases'),
        iconInformation: { fileName: 'kql_database_24.svg', isThemed: true },
        portalFolder: 'databases',
    },
    'KQLQueryset': {
        displayName: vscode.l10n.t('KQL Queryset'),
        displayNamePlural: vscode.l10n.t('KQL Querysets'),
        iconInformation: { fileName: 'kql_queryset_24.svg', isThemed: true },
        portalFolder: 'queryworkbenches',
    },
    'Lakehouse': {
        displayName: vscode.l10n.t('Lakehouse'),
        displayNamePlural: vscode.l10n.t('Lakehouses'),
        iconInformation: { fileName: 'lakehouse_24.svg', isThemed: true },
        portalFolder: 'lakehouses',
    },
    'MicroBatchPipeline': {
        displayName: vscode.l10n.t('Change Data Capture'),
        displayNamePlural: vscode.l10n.t('Change Data Captures'),
        iconInformation: { fileName: 'pipeline_24.svg', isThemed: true },
        portalFolder: 'microbatchpipelines',
    },
    'MirroredWarehouse': {
        displayName: vscode.l10n.t('SQL analytics endpoint'),
        displayNamePlural: vscode.l10n.t('SQL analytics endpoints'),
        iconInformation: { fileName: 'data_warehouse_24.svg', isThemed: true },
        portalFolder: 'mountedwarehouses',
    },
    'MLExperiment': {
        displayName: vscode.l10n.t('Experiment'),
        displayNamePlural: vscode.l10n.t('Experiments'),
        iconInformation: { fileName: 'experiments_24.svg', isThemed: true },
        portalFolder: 'mlexperiments',
    },
    'MLModel': {
        displayName: vscode.l10n.t('ML model'),
        displayNamePlural: vscode.l10n.t('ML models'),
        iconInformation: { fileName: 'model_24.svg', isThemed: true },
        portalFolder: 'mlmodels',
    },
    'Notebook': {
        displayName: vscode.l10n.t('Notebook'),
        displayNamePlural: vscode.l10n.t('Notebooks'),
        iconInformation: { fileName: 'notebook_24.svg', isThemed: true },
        portalFolder: 'synapsenotebooks',
    },
    'Reflex': {
        displayName: vscode.l10n.t('Reflex'),
        displayNamePlural: vscode.l10n.t('Reflexes'),
        iconInformation: { fileName: 'reflex_24.svg', isThemed: true },
        portalFolder: 'reflexes',
    },
    'RetailDataManager': {
        displayName: vscode.l10n.t('Retail Data Manager (Preview)'),
        displayNamePlural: vscode.l10n.t('Retail Data Managers'),
        iconInformation: { fileName: 'retail_data_manager_24.svg', isThemed: true },
        portalFolder: 'retail-data-manager',
    },
    'SemanticModel': {
        displayName: vscode.l10n.t('Semantic model'),
        displayNamePlural: vscode.l10n.t('Semantic models'),
        iconInformation: { fileName: 'semantic_model_32.svg', isThemed: true },
        portalFolder: 'datasets',
    },
    'SparkJobDefinition': {
        displayName: vscode.l10n.t('Spark Job Definition'),
        displayNamePlural: vscode.l10n.t('Spark job definitions'),
        iconInformation: { fileName: 'spark_job_definition_24.svg', isThemed: true },
        portalFolder: 'sparkjobdefinitions',
    },
    'SQLDbNative': {
        displayName: vscode.l10n.t('SQL Database'),
        displayNamePlural: vscode.l10n.t('SQL Databases'),
        iconInformation: { fileName: 'sql_database_24.svg', isThemed: true },
        portalFolder: 'sqldatabases',
    },
    'SQLEndpoint': {
        displayName: vscode.l10n.t('SQL analytics endpoint'),
        displayNamePlural: vscode.l10n.t('SQL analytics endpoints'),
        iconInformation: { fileName: 'data_warehouse_24.svg', isThemed: true },
        portalFolder: 'lakewarehouses',
    },
    'TestArtifact': {
        displayName: 'Test Artifact',
        displayNamePlural: 'test artifacts',
        iconInformation: { fileName: 'notebook_24.svg', isThemed: true },
    },
    'Warehouse': {
        displayName: vscode.l10n.t('Warehouse'),
        displayNamePlural: vscode.l10n.t('Warehouses'),
        iconInformation: { fileName: 'data_warehouse_24.svg', isThemed: true },
        portalFolder: 'datawarehouses',
    },
    'WebApiService': {
        displayName: vscode.l10n.t('WebApiService'),
        displayNamePlural: vscode.l10n.t('WebApiServices'),
        iconInformation: { fileName: 'sql_database_24.svg', isThemed: true },
    },

    'Dashboard': {
        displayName: vscode.l10n.t('Dashboard'),
        displayNamePlural: vscode.l10n.t('Dashboards'),
        iconInformation: { fileName: 'dashboard_24.svg', isThemed: true },
        portalFolder: 'dashboards',
    },
    'Datamart': {
        displayName: vscode.l10n.t('Datamart'),
        displayNamePlural: vscode.l10n.t('Datamarts'),
        iconInformation: { fileName: 'datamart_24.svg', isThemed: true },
        portalFolder: 'datamarts',
    },
    'OrgApp': {
        displayName: vscode.l10n.t('App'),
        displayNamePlural: vscode.l10n.t('Apps'),
        iconInformation: { fileName: 'apps_24.svg', isThemed: true },
        portalFolder: 'orgapps',
    },
    'PaginatedReport': {
        displayName: vscode.l10n.t('Paginated Report'),
        displayNamePlural: vscode.l10n.t('Paginated Reports'),
        iconInformation: { fileName: 'paginated_report_24.svg', isThemed: true },
        portalFolder: 'rdlreports',
    },
    'Report': {
        displayName: vscode.l10n.t('Report'),
        displayNamePlural: vscode.l10n.t('Reports'),
        iconInformation: { fileName: 'report_24.svg', isThemed: true },
        portalFolder: 'reports',
    },

    'ApacheAirflowProject': {
        displayName: vscode.l10n.t('Apache Airflow project (Preview)'),
        displayNamePlural: vscode.l10n.t('Apache Airflow projects'),
    },
    'DigitalOperationsOperationalInsight': {
        displayName: vscode.l10n.t('PAL'),
        displayNamePlural: vscode.l10n.t('PALs'),
    },
    'HealthDataManager': {
        displayName: vscode.l10n.t('Healthcare solution (Preview)'),
        displayNamePlural: vscode.l10n.t('Healthcare solutions (Preview)'),
    },
    'KustoEventHouse': {
        displayName: vscode.l10n.t('Event House'),
        displayNamePlural: vscode.l10n.t('Event Houses'),
        portalFolder: 'eventhouses',
    },
    'KustoEventHubDataConnection': {
        displayName: vscode.l10n.t('Real-Time Analytics Data stream'),
        displayNamePlural: vscode.l10n.t('Real-Time Analytics Data streams'),
    },
    'MicrosoftSupplyChainCenter': {
        displayName: vscode.l10n.t('Supply Chain Center'),
        displayNamePlural: vscode.l10n.t('Supply Chain Centers'),
    },
    'MountedDataFactory': {
        displayName: vscode.l10n.t('Data Factory (Azure mount)'),
        displayNamePlural: vscode.l10n.t('Data Factories (Azure mount)'),
    },
    'monitorMounting': {
        displayName: vscode.l10n.t('Monitor mounting'),
        displayNamePlural: vscode.l10n.t('Mirrored databases'),
    },
    'PgSQLDbNative': {
        displayName: vscode.l10n.t('PostgreSQL Database'),
        displayNamePlural: vscode.l10n.t('PostgreSQL Databases')
    },
    'SustainabilityDataManager': {
        displayName: vscode.l10n.t('Sustainability Data Manager (Preview)'),
        displayNamePlural: vscode.l10n.t('Sustainability Data Managers'),
    },

    /* eslint-enable @typescript-eslint/naming-convention*/
};

export function getDisplayName(artifact: IArtifact | string): string {
    const artifactType: string = getArtifactTypeString(artifact);

    let result = fabricItemMetadata[artifactType]?.displayName;
    if (result) {
        return result;
    }

    return artifactType;
}

export function getDisplayNamePlural(artifact: IArtifact | string): string | undefined {
    const artifactType: string = getArtifactTypeString(artifact);

    return fabricItemMetadata[artifactType]?.displayNamePlural;
}

export function getArtifactIconPath(baseUri: vscode.Uri, artifact: IArtifact | string): vscode.Uri | { light: vscode.Uri, dark: vscode.Uri } | undefined {
    if (!baseUri) {
        return undefined;
    }

    const artifactType: string = getArtifactTypeString(artifact);

    if (fabricItemMetadata[artifactType]?.iconInformation) {
        if (fabricItemMetadata[artifactType]?.iconInformation?.isThemed) {
            return getThemedArtifactIconPath(baseUri, fabricItemMetadata[artifactType]?.iconInformation?.fileName!);
        }
        else {
            return vscode.Uri.joinPath(baseUri, 'resources', 'artifacts', fabricItemMetadata[artifactType]?.iconInformation?.fileName!);
        }
    }

    return undefined;
}

export function getArtifactDefaultIconPath(baseUri: vscode.Uri): { light: vscode.Uri, dark: vscode.Uri } | undefined {
    return getThemedArtifactIconPath(baseUri, 'document_24.svg');
}

export function getArtifactExtensionId(artifact: IArtifact | string): string | undefined {
    const artifactType: string = getArtifactTypeString(artifact);

    return fabricItemMetadata[artifactType]?.extensionId;
}

function getThemedArtifactIconPath(baseUri: vscode.Uri, fileName: string): { light: vscode.Uri, dark: vscode.Uri } | undefined {
    if (!baseUri) {
        return undefined;
    }

    return {
        light: vscode.Uri.joinPath(baseUri, 'resources', 'light', 'artifacts', fileName),
        dark: vscode.Uri.joinPath(baseUri, 'resources', 'dark', 'artifacts', fileName)
    };
}

export function getArtifactTypeFolder(artifact: IArtifact | string): string {
    const artifactType: string = getArtifactTypeString(artifact);

    const result = fabricItemMetadata[artifactType]?.portalFolder;
    if (result) {
        return result;
    }

    return `${artifactType}s`;
}

function getArtifactTypeString(artifact: IArtifact | string): string {
    if (typeof artifact === 'string') {
        return artifact as string;
    }

    return (artifact as IArtifact).type;
}

