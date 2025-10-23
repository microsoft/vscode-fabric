// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { FabricEnvironmentSettings, IConfigurationProvider, FABRIC_ENVIRONMENT_SETTINGS_KEY } from '@microsoft/vscode-fabric-util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Test Environment Configuration Utility
 *
 * Provides a centralized way to configure test environments without hardcoding
 * internal environment names or configurations. Supports both environment variables
 * and VS Code settings for flexible test configuration.
 */
export class TestEnvironmentConfig {
    /**
     * Get custom environment configuration from environment variables
     * Used by CI/CD pipelines to inject test environment settings
     */
    static getCustomEnvironmentFromEnv(): FabricEnvironmentSettings | null {
        const environmentName = process.env.FABRIC_TEST_ENVIRONMENT_NAME;
        const clientId = process.env.FABRIC_TEST_CLIENT_ID;
        const sharedUri = process.env.FABRIC_TEST_SHARED_URI;
        const portalUri = process.env.FABRIC_TEST_PORTAL_URI;

        if (!environmentName || !clientId || !sharedUri || !portalUri) {
            return null;
        }

        return {
            env: environmentName,
            clientId: clientId,
            scopes: process.env.FABRIC_TEST_SCOPES?.split(',') || ['https://analysis.windows.net/powerbi/api/.default'],
            sharedUri: sharedUri,
            portalUri: portalUri,
            sessionProvider: process.env.FABRIC_TEST_SESSION_PROVIDER || 'microsoft',
        };
    }

    static getCustomEnvironmentProfilePath(): string {
        return path.join(os.homedir(), '.fabric-environment');
    }

    /**
     * Get custom environment configuration from user profile
     * Reads from ~/.fabric-environment file if it exists
     */
    static getCustomEnvironmentFromProfile(): FabricEnvironmentSettings | null {
        try {
            const profilePath = this.getCustomEnvironmentProfilePath();

            if (!fs.existsSync(profilePath)) {
                return null;
            }

            const profileContent = fs.readFileSync(profilePath, 'utf8');
            const profileConfig = JSON.parse(profileContent);

            // Get the current environment name
            const currentEnv = profileConfig['Fabric.Environment'];
            if (!currentEnv) {
                return null;
            }

            // Find the matching custom environment
            const customEnvironments = profileConfig['Fabric.CustomEnvironments'];
            if (!Array.isArray(customEnvironments)) {
                return null;
            }

            const matchingEnv = customEnvironments.find((env: any) =>
                env.env && env.env.toUpperCase() === currentEnv.toUpperCase()
            );

            if (!matchingEnv) {
                return null;
            }

            // Convert to FabricEnvironmentSettings format
            return {
                env: matchingEnv.env,
                clientId: matchingEnv.clientId,
                scopes: Array.isArray(matchingEnv.scopes) ? matchingEnv.scopes : [matchingEnv.scopes],
                sharedUri: matchingEnv.sharedUri,
                portalUri: matchingEnv.portalUri,
                sessionProvider: matchingEnv.sessionProvider || 'microsoft',
            };
        }
        catch (error) {
            // Silently fail if profile cannot be read or parsed
            return null;
        }
    }

    /**
     * Apply test environment configuration to VS Code configuration provider
     * This sets up both the environment selection and custom environment definition
     */
    static async configureTestEnvironment(configurationProvider: IConfigurationProvider): Promise<FabricEnvironmentSettings | null> {
        let customEnv = this.getCustomEnvironmentFromEnv();
        if (!customEnv) {
            customEnv = this.getCustomEnvironmentFromProfile();
            if (!customEnv) {
                return null;
            }
        }

        // Use the unified EnvironmentSettings configuration structure
        const environmentSettings = {
            current: customEnv.env,
            environments: [customEnv],
        };

        await configurationProvider.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, environmentSettings);

        return customEnv;
    }
}
