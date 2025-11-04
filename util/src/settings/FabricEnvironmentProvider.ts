// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ILogger } from '../logger/Logger';
import { IConfigurationProvider } from './ConfigurationProvider';
import { FABRIC_ENVIRONMENT_PROD, FabricEnvironmentSettings, msSessionProvider } from './FabricEnvironment';
import * as vscode from 'vscode';

/**
 * Interface for managing Fabric environment configuration and change notifications.
 *
 * Provides access to the current Fabric environment settings and notifies when
 * the environment configuration changes through VS Code settings.
 */
export interface IFabricEnvironmentProvider {
    /**
     * Gets the current Fabric environment settings.
     * @returns The environment settings for the currently configured environment
     */
    getCurrent(): FabricEnvironmentSettings;

    /**
     * Switches to the specified environment if it exists in the configuration.
     * @param environmentName The name of the environment to switch to
     * @returns Promise<boolean> indicating if the current environment is the specified value upon
     */
    switchToEnvironment(environmentName: string): Promise<boolean>;

    /**
     * Event that fires when the Fabric environment configuration changes.
     */
    onDidEnvironmentChange: vscode.Event<void>;
}

export const FABRIC_ENVIRONMENT_SETTINGS_KEY = 'EnvironmentSettings';
export const FABRIC_ENVIRONMENT_DEFAULT_VALUE = 'PROD';

export class FabricEnvironmentProvider implements IFabricEnvironmentProvider {
    private disposables: vscode.Disposable[] = [];

    constructor(
        private configService: IConfigurationProvider,
        private logger: ILogger
    ) {
        // Add a listener to the configuration provider to log when the environment changes
        this.disposables.push(this.configService.onDidConfigurationChange((key: string) => {
            if (key === FABRIC_ENVIRONMENT_SETTINGS_KEY) {
                this.onDidEnvironmentChangeEmitter.fire();
            }
        }));
    }

    getCurrent(): FabricEnvironmentSettings {
        const defaultConfig = {
            current: FABRIC_ENVIRONMENT_DEFAULT_VALUE,
            environments: [],
        };

        const envConfig = this.configService.get(FABRIC_ENVIRONMENT_SETTINGS_KEY, defaultConfig);
        const currentEnvKey = envConfig.current?.toUpperCase() || FABRIC_ENVIRONMENT_DEFAULT_VALUE;

        // If requesting PROD, return the built-in PROD environment from code
        if (currentEnvKey === FABRIC_ENVIRONMENT_PROD) {
            return FABRIC_ENVIRONMENTS.PROD;
        }

        // Ensure environments is an array before processing
        if (Array.isArray(envConfig.environments)) {
            // Look for custom environment in the configuration array
            const customEnvironment = envConfig.environments
                .find((env: any) => typeof env.env === 'string' && env.env.toUpperCase() === currentEnvKey);

            if (customEnvironment && this.isValidCustomEnvironment(customEnvironment)) {
                return customEnvironment;
            }
        }

        // Custom environment not found or invalid - silently fallback to PROD
        return FABRIC_ENVIRONMENTS.PROD;
    }

    private isValidCustomEnvironment(env: any): env is FabricEnvironmentSettings {
        // Apply default sessionProvider if missing or invalid
        if (!env.sessionProvider || typeof env.sessionProvider !== 'string') {
            env.sessionProvider = msSessionProvider;
        }

        return env &&
               typeof env.env === 'string' &&
               typeof env.clientId === 'string' &&
               Array.isArray(env.scopes) &&
               typeof env.sharedUri === 'string' &&
               typeof env.portalUri === 'string' &&
               typeof env.sessionProvider === 'string';
    }

    /**
     * Switches to the specified environment if it exists in the configuration.
     * @param environmentName The case-insensitivename of the environment to switch to
     * @returns Promise<boolean> indicating success or failure
     */
    async switchToEnvironment(environmentName: string): Promise<boolean> {
        const defaultConfig = {
            current: FABRIC_ENVIRONMENT_DEFAULT_VALUE,
            environments: [],
        };

        const envConfig = this.configService.get(FABRIC_ENVIRONMENT_SETTINGS_KEY, defaultConfig);
        const targetEnvKey = environmentName.toUpperCase();
        const currentEnvKey = envConfig.current?.toUpperCase() || FABRIC_ENVIRONMENT_DEFAULT_VALUE;

        // Early return if already in the target environment
        if (currentEnvKey === targetEnvKey) {
            return true;
        }

        // Validate target environment (custom environments need validation, PROD is always valid)
        if (targetEnvKey !== FABRIC_ENVIRONMENT_PROD) {
            // Ensure environments is an array before processing
            if (!Array.isArray(envConfig.environments)) {
                this.logger?.warn(`Cannot switch to environment '${environmentName}': not found or invalid`);
                return false;
            }

            // Check if the target custom environment exists in configuration array
            const targetEnv = envConfig.environments
                .find((env: any) => typeof env.env === 'string' && env.env.toUpperCase() === targetEnvKey);

            if (!targetEnv || !this.isValidCustomEnvironment(targetEnv)) {
                this.logger?.warn(`Cannot switch to environment '${environmentName}': not found or invalid`);
                return false;
            }
        }

        // Update configuration with new current environment
        const newConfig = { ...envConfig, current: targetEnvKey };
        await this.configService.update(FABRIC_ENVIRONMENT_SETTINGS_KEY, newConfig);

        this.logger?.info(`Switched to environment: ${targetEnvKey}`);
        return true;
    }

    public dispose(): void {
        if (this.disposables) {
            this.disposables.forEach(item => item.dispose());
        }
        this.disposables = [];
    }

    private readonly onDidEnvironmentChangeEmitter = new vscode.EventEmitter<void>();
    readonly onDidEnvironmentChange = this.onDidEnvironmentChangeEmitter.event;
}

const vsCodeFabricClientIdPROD = '02fe4832-64e1-42d2-a605-d14958774a2e';
const theScopesPROD = ['https://analysis.windows.net/powerbi/api/.default'];
const FABRIC_ENVIRONMENTS: { [key: string]: FabricEnvironmentSettings } = {
    [FABRIC_ENVIRONMENT_PROD]: {
        env: FABRIC_ENVIRONMENT_PROD,
        clientId: vsCodeFabricClientIdPROD,
        scopes: theScopesPROD,
        sharedUri: 'https://api.fabric.microsoft.com',
        portalUri: 'app.fabric.microsoft.com',
        sessionProvider: msSessionProvider,
    },
};
