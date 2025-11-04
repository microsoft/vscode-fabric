// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Configuration settings for connecting to different Microsoft Fabric deployment environments.
 *
 * This type defines the complete set of environment-specific parameters needed to authenticate
 * and communicate with Fabric APIs across different deployment stages (development, testing,
 * production). Each environment has its own authentication client ID, API scopes, and endpoint URLs.
 *
 * The settings are used by the FabricEnvironmentProvider to configure the extension's behavior
 * based on the user's selected environment, enabling developers to work against different Fabric
 * deployments without code changes.
 *
 * @example
 * ```typescript
 * const prodSettings: FabricEnvironmentSettings = {
 *   env: 'PROD',
 *   clientId: '02fe4832-64e1-42d2-a605-d14958774a2e',
 *   scopes: ['https://analysis.windows.net/powerbi/api/.default'],
 *   sharedUri: 'https://api.fabric.microsoft.com',
 *   portalUri: 'app.fabric.microsoft.com',
 *   sessionProvider: 'microsoft'
 * };
 * ```
 */
export type FabricEnvironmentSettings = {
    /** The environment identifier, used for logging and environment-specific logic */
    env: string;

    /**
     * Azure AD client ID for authentication to this Fabric environment.
     * Different environments use different client IDs for security isolation.
     */
    clientId: string;

    /**
     * OAuth scopes required for API access in this environment.
     * Typically includes PowerBI API scopes needed for Fabric operations.
     */
    scopes: string[];

    /**
     * Base URI for Fabric API endpoints in this environment.
     * Used as the root URL for all REST API calls to Fabric services.
     */
    sharedUri: string;

    /**
     * Portal URI for the Fabric web interface in this environment.
     * Used for constructing links to the Fabric portal for user navigation.
     */
    portalUri: string;

    /**
     * VS Code authentication session provider to use for this environment.
     * - 'microsoft': Standard Microsoft authentication for external/production environments
     * - 'microsoft-sovereign-cloud': Internal Microsoft authentication for PPE/internal environments
     * @defaultValue 'microsoft'
     */
    sessionProvider?: string;
};

/**
 * Built-in Fabric environment identifier.
 */
export const FABRIC_ENVIRONMENT_PROD = 'PROD';

export const msSessionProvider: string = 'microsoft';
export const msSessionProviderPPE: string = 'microsoft-sovereign-cloud';
