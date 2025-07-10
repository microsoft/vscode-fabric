import * as vscode from 'vscode';
import * as path from 'path';
import { IWorkspace } from '@fabric/vscode-fabric-api';
import { IGitOperator } from '../apis/internal/fabricExtensionInternal';

const selectFolderText = vscode.l10n.t('Select the working directory for Fabric workspace');
export async function showQuickPickForLocalFolder(
    folderPath: vscode.Uri, 
    currentWorkspace: IWorkspace,
    gitOperator: IGitOperator
): Promise<vscode.Uri | undefined> {
    const quickPickItems: SelectFolderQuickPickItem[] = [];

    if (SourceControlQuickPickItem.shouldShow(currentWorkspace)) {
        quickPickItems.push(new SourceControlQuickPickItem(currentWorkspace, gitOperator));
    }
    quickPickItems.push(new FolderQuickPickItem(folderPath));
    quickPickItems.push(new BrowseFolderQuickPickItem());

    let result: SelectFolderQuickPickItem | undefined = quickPickItems[0];
    if (quickPickItems.length > 1) {
        result = await vscode.window.showQuickPick(quickPickItems, { placeHolder: selectFolderText });
    }

    if (result) {
        return await result.onSelected();
    }
    return undefined;
}

abstract class SelectFolderQuickPickItem implements vscode.QuickPickItem {
    constructor(public label: string) {
    }

    abstract onSelected(): Promise<vscode.Uri | undefined>;
}

class FolderQuickPickItem extends SelectFolderQuickPickItem {
    constructor(private fullPath: vscode.Uri) {
        const parsedPath = path.parse(fullPath.path);
        const folder: string = parsedPath.base;
        super(folder);
        this.description = this.fullPath.fsPath;
    }

    public description?: string;

    async onSelected(): Promise<vscode.Uri | undefined> {
        return this.fullPath;
    }
}

class BrowseFolderQuickPickItem extends SelectFolderQuickPickItem {
    constructor() {
        super(vscode.l10n.t('Browse...'));
        this.iconPath = new vscode.ThemeIcon('folder');
    }

    async onSelected(): Promise<vscode.Uri | undefined> {
        const uri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: vscode.l10n.t('Select Folder'),
            title: selectFolderText
        });

        if (uri && uri.length > 0) {
            return uri[0];
        }
    }

    iconPath: vscode.ThemeIcon;
}

class SourceControlQuickPickItem extends SelectFolderQuickPickItem {
    constructor(private workspace: IWorkspace, private gitOperator: IGitOperator) {
        super(vscode.l10n.t('Clone the workspace...'));
        this.iconPath = new vscode.ThemeIcon('source-control');
    }

    async onSelected(): Promise<vscode.Uri | undefined> {
        const uri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: vscode.l10n.t('Select as Repository Destination'),
            title: `Choose a folder to clone ${this.workspace.displayName} into`,
        });

        if (uri && uri.length > 0) {
            const destinationDirectory: vscode.Uri | undefined = await this.gitOperator.cloneRepository(this.workspace.sourceControlInformation!.repository!, uri[0], this.workspace.sourceControlInformation!.branchName);

            if (destinationDirectory) {
                let uriFullPath = destinationDirectory;
                if (this.workspace.sourceControlInformation?.directoryName) {
                    uriFullPath = vscode.Uri.joinPath(uriFullPath, this.workspace.sourceControlInformation.directoryName);
                }
                return uriFullPath;
            }
        }

        return undefined;
    }

    iconPath: vscode.ThemeIcon;

    public static shouldShow(workspace: IWorkspace): boolean {
        return workspace.sourceControlInformation?.repository !== undefined;
    }
}
