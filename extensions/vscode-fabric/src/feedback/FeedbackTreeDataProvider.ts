import * as vscode from 'vscode';
import { commandNames } from '../constants';

export class FeedbackTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    constructor(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.commands.registerCommand(commandNames.viewIssues, async () => {
            void vscode.env.openExternal('https://aka.ms/fabric/vscode/issues' as unknown as vscode.Uri);
        }));
        context.subscriptions.push(vscode.commands.registerCommand(commandNames.reportIssue, async () => {
            void vscode.env.openExternal('https://aka.ms/fabric/vscode/issues/new' as unknown as vscode.Uri);
        }));
    }

    onDidChangeTreeData?: vscode.Event<void | vscode.TreeItem | vscode.TreeItem[] | null | undefined> | undefined;
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }
    getChildren(element?: vscode.TreeItem | undefined): vscode.ProviderResult<vscode.TreeItem[]> {
        if (element) {
            throw new Error('Unexpected Feedback child node!');
        }

        let helpItems: vscode.TreeItem[] = [];

        let reportItem = new vscode.TreeItem(vscode.l10n.t('Report issue...'), vscode.TreeItemCollapsibleState.None);
        reportItem.command = { command: 'vscode-fabric.reportIssue', title: vscode.l10n.t('Report issue...') };
        reportItem.tooltip = new vscode.MarkdownString(vscode.l10n.t('Report a bug or feature request: describe the issue and the environment (OS, extension versions)'));
        reportItem.iconPath = new vscode.ThemeIcon('bug');
        helpItems.push(reportItem);

        let viewItem = new vscode.TreeItem(vscode.l10n.t('View known issues...'), vscode.TreeItemCollapsibleState.None);
        viewItem.command = { command: 'vscode-fabric.viewIssues', title: vscode.l10n.t('View known issues...') };
        viewItem.tooltip = new vscode.MarkdownString(vscode.l10n.t('View known bugs and feature requests'));
        viewItem.iconPath = new vscode.ThemeIcon('issues');
        helpItems.push(viewItem);

        return helpItems;
    }
}

class ViewIssuesQuickPickItem implements vscode.QuickPickItem {
    constructor(public label: string, public link: string) { }
}
