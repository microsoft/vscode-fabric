import * as vscode from 'vscode';
import { FabricTreeNode } from '@microsoft/vscode-fabric-api';

export class InstallExtensionTreeNode extends FabricTreeNode {
    constructor(context: vscode.ExtensionContext, public extensionId: string) {
        super(context, vscode.l10n.t('Install extension to enable additional features...'), vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('extensions');
        this.command = {
            command: 'vscode-fabric.installExtension',
            title: '',
            arguments: [extensionId],
        };
    }
}
