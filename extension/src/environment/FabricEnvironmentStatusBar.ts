// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import {
    FABRIC_ENVIRONMENT_DEFAULT_VALUE,
    FABRIC_ENVIRONMENT_PROD,
    FABRIC_ENVIRONMENT_SETTINGS_KEY,
    FabricEnvironmentSettings,
    IConfigurationProvider,
    IFabricEnvironmentProvider,
} from '@microsoft/vscode-fabric-util';

import { commandNames } from '../constants';

type FabricEnvironmentConfiguration = {
    current?: string;
    environments?: FabricEnvironmentSettings[];
};

type EnvironmentOption = {
    readonly key: string;
    readonly label: string;
};

type EnvironmentQuickPickItem = vscode.QuickPickItem & { environmentKey: string };

export class FabricEnvironmentStatusBar implements vscode.Disposable {
    private readonly statusBarItem: vscode.StatusBarItem;
    private readonly disposables: vscode.Disposable[] = [];
    private environmentOptions: EnvironmentOption[] = [];

    constructor(
        private readonly configurationProvider: IConfigurationProvider,
        private readonly environmentProvider: IFabricEnvironmentProvider
    ) {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.name = vscode.l10n.t('Fabric Environment');
        this.statusBarItem.command = commandNames.selectEnvironment;
    }

    async initialize(context: vscode.ExtensionContext): Promise<void> {
        this.disposables.push(vscode.commands.registerCommand(commandNames.selectEnvironment, async () => {
            await this.showEnvironmentPicker();
        }));

        this.disposables.push(this.environmentProvider.onDidEnvironmentChange(() => {
            this.refresh();
        }));

        this.disposables.push(this.configurationProvider.onDidConfigurationChange((key: string) => {
            if (key === FABRIC_ENVIRONMENT_SETTINGS_KEY) {
                this.refresh();
            }
        }));

        context.subscriptions.push(this.statusBarItem);
        this.disposables.forEach(disposable => context.subscriptions.push(disposable));

        this.refresh();
    }

    dispose(): void {
        this.statusBarItem.dispose();
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
    }

    private refresh(): void {
        this.environmentOptions = this.computeEnvironmentOptions();
        if (this.environmentOptions.length <= 1) {
            this.statusBarItem.hide();
            return;
        }

        const currentEnvironment = this.environmentProvider.getCurrent()?.env ?? FABRIC_ENVIRONMENT_PROD;
        this.statusBarItem.text = `$(globe) Fabric: ${currentEnvironment}`;
        this.statusBarItem.tooltip = vscode.l10n.t('Fabric environment: {0}. Click to switch.', currentEnvironment);
        this.statusBarItem.show();
    }

    private computeEnvironmentOptions(): EnvironmentOption[] {
        const defaultConfig: FabricEnvironmentConfiguration = {
            current: FABRIC_ENVIRONMENT_DEFAULT_VALUE,
            environments: [],
        };

        const envConfig = this.configurationProvider.get<FabricEnvironmentConfiguration>(FABRIC_ENVIRONMENT_SETTINGS_KEY, defaultConfig);
        const seen = new Set<string>();
        const options: EnvironmentOption[] = [];

        const pushOption = (label: string) => {
            const trimmed = label.trim();
            if (!trimmed) {
                return;
            }
            const key = trimmed.toUpperCase();
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            options.push({ key, label: trimmed });
        };

        pushOption(FABRIC_ENVIRONMENT_PROD);

        if (Array.isArray(envConfig?.environments)) {
            for (const candidate of envConfig.environments) {
                const label = this.tryResolveEnvironmentName(candidate);
                if (label) {
                    pushOption(label);
                }
            }
        }

        return options;
    }

    private tryResolveEnvironmentName(candidate: unknown): string | undefined {
        if (!candidate || typeof candidate !== 'object') {
            return undefined;
        }

        const env = candidate as Partial<FabricEnvironmentSettings>;
        if (typeof env.env !== 'string' || !env.env.trim()) {
            return undefined;
        }

        if (typeof env.clientId !== 'string' || !env.clientId.trim()) {
            return undefined;
        }

        if (!Array.isArray(env.scopes)) {
            return undefined;
        }

        if (typeof env.sharedUri !== 'string' || !env.sharedUri.trim()) {
            return undefined;
        }

        if (typeof env.portalUri !== 'string' || !env.portalUri.trim()) {
            return undefined;
        }

        return env.env;
    }

    private async showEnvironmentPicker(): Promise<void> {
        if (this.environmentOptions.length <= 1) {
            await vscode.window.showInformationMessage(vscode.l10n.t('No alternate Fabric environments are configured.'));
            return;
        }

        const currentEnvironment = this.environmentProvider.getCurrent()?.env ?? FABRIC_ENVIRONMENT_PROD;
        const currentKey = currentEnvironment.toUpperCase();

        const quickPickItems: EnvironmentQuickPickItem[] = this.environmentOptions.map(option => ({
            label: option.label,
            description: option.key === currentKey ? vscode.l10n.t('Current') : undefined,
            alwaysShow: option.key === currentKey,
            environmentKey: option.key,
        }));

        const selection = await vscode.window.showQuickPick(quickPickItems, {
            title: vscode.l10n.t('Fabric environment'),
            placeHolder: vscode.l10n.t('Select a Fabric environment'),
            ignoreFocusOut: true,
        });

        if (!selection) {
            return;
        }

        if (selection.environmentKey === currentKey) {
            return;
        }

        const target = this.environmentOptions.find(option => option.key === selection.environmentKey);
        if (!target) {
            return;
        }

        const switched = await this.environmentProvider.switchToEnvironment(target.label);
        if (!switched) {
            await vscode.window.showWarningMessage(vscode.l10n.t('Unable to switch to Fabric environment {0}. Verify your settings and try again.', target.label));
            return;
        }

        this.refresh();

        const reloadAction = vscode.l10n.t('Reload Window');
        const dismissAction = vscode.l10n.t('Not now');
        const message = vscode.l10n.t('Fabric environment changed to {0}. Reload to apply this change.', target.label);
        const response = await vscode.window.showInformationMessage(message, reloadAction, dismissAction);
        if (response === reloadAction) {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    }
}
