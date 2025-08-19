import * as vscode from 'vscode';
import { fabricWorkspaceSettingsVersion, IFabricArtifactSettings, IFabricWorkspaceSettings, IFabricExtensionsSettingStorage, ILocalFolderSettingsAdapter, IFabricExtensionSettings } from './definitions';
import { mkdir } from 'fs';
import { FabricEnvironmentName, IConfigurationProvider, IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';

export const settingsFabricWorkspace = 'settingsFabricWorkspace';

export class FabricExtensionsSettingStorage implements IFabricExtensionsSettingStorage {
    public readonly settings: IFabricExtensionSettings;

    constructor(private record: vscode.Memento, protected fabricEnvironmentProvider: IFabricEnvironmentProvider, protected config: IConfigurationProvider) {
        this.settings = {
            version: fabricWorkspaceSettingsVersion,
            workspaces: new Array<IFabricWorkspaceSettings>(),
            artifacts: new Array<IFabricArtifactSettings>(),
        };
    }

    public async load(): Promise<boolean> {
        const storedSettings: IFabricExtensionSettings | undefined = this.record.get(settingsFabricWorkspace);
        if (storedSettings) {
            if (storedSettings.version === fabricWorkspaceSettingsVersion) {
                this.settings.loginState = storedSettings.loginState;
                this.settings.displayStyle = storedSettings.displayStyle;
                this.settings.currentTenant = storedSettings.currentTenant;

                // shallow copy the arrays
                this.settings.artifacts = storedSettings.artifacts?.slice();
                this.settings.workspaces = storedSettings.workspaces.slice();

                return true;
            }
            else {
                await this.record.update(settingsFabricWorkspace, undefined);
            }
        }
        return false;
    }

    get defaultWorkspacesPath(): string | undefined {
        let value: string | undefined = this.config.get('DefaultWorkspaceFolder',  '');
        try {
            if (value && value.length > 0) { // attempt to create the folder if it doesn't exist. Also validates value is a valid path
                // eslint-disable-next-line security/detect-non-literal-fs-filename
                mkdir(value, { recursive: true }, (err) => {
                    if (err) {
                        console.error(err);
                        value = undefined;
                    }
                });
            }
        }
        catch (error) {
            value = undefined;
        }
        return value;
    }

    get mostRecentWorkspace(): string | undefined {
        return this.settings.workspaces.filter(
            (entry) => entry.fabricEnv === this.fabricEnvironmentProvider.getCurrent().env &&
                entry.tenantId === this.settings.currentTenant?.tenantId
        ).pop()?.workspaceId;
    }
    set mostRecentWorkspace(value: string | undefined) {
        if (value) {
            let dataToAdd: IFabricWorkspaceSettings = {
                workspaceId: value,
                tenantId: this.settings.currentTenant?.tenantId,
                fabricEnv: this.fabricEnvironmentProvider.getCurrent().env,
            };

            // Search for this specific workspace
            const lastIndex = this.settings.workspaces.findIndex((element) => element.workspaceId === value &&
                element.fabricEnv === this.fabricEnvironmentProvider.getCurrent().env &&
                element.tenantId === this.settings.currentTenant?.tenantId);

            if (lastIndex !== -1) {
                // If already the last item, no need to shift things around
                if (lastIndex === this.settings.workspaces.length - 1) {
                    return;
                }

                // Remove the last element using splice
                dataToAdd = this.settings.workspaces.splice(lastIndex, 1)[0];
            }

            // Make sure this element is at the end of the array
            this.settings.workspaces.push(dataToAdd);
        }
    }

    public async save(): Promise<void> {
        // mac:     ~/Library/Application Support/Code - Insiders/User/globalStorage/state.vscdb
        // windows: "C:\Users\<username>\AppData\Roaming\Code - Insiders\User\globalStorage\state.vscdb"
        await this.record.update(settingsFabricWorkspace, this.settings);
    }
}