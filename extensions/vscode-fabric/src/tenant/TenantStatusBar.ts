import * as vscode from 'vscode';
import { IFabricExtensionsSettingStorage } from '../settings/definitions';

/**
 * Displays the current tenant in the VS Code status bar.
 * Shown only when the user has switched away from their home tenant.
 */
export class TenantStatusBar implements vscode.Disposable {
    private readonly item: vscode.StatusBarItem;

    constructor(private readonly storage: IFabricExtensionsSettingStorage) {
        this.item = vscode.window.createStatusBarItem();
        this.item.command = 'vscode-fabric.switchTenant';

        this.refresh();
    }

    /** Refreshes the status-bar visibility/text based on current settings. */
    public refresh(): void {
        const tenant = this.storage.settings.currentTenant;
        if (tenant?.displayName) {
            this.item.text = `$(organization) Fabric: ${tenant.displayName}`;
            this.item.show();
        }
        else {
            this.item.hide();
        }
    }

    dispose(): void {
        this.item.dispose();
    }
}
