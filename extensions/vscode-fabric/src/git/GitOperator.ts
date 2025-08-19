import * as vscode from 'vscode';
import * as cp from 'child_process';
import { IGitOperator } from '../apis/internal/fabricExtensionInternal';
import { isDirectory } from '../utilities';
import { Lazy, lazyLoad } from '../Lazy';

// The vscode.git extension exports definition
// Downloaded from https://github.com/microsoft/vscode/commits/main/extensions/git/src/api/git.d.ts
import * as gitExtension from '../apis/git';
import { ILogger } from '@microsoft/vscode-fabric-util';

export class GitOperator implements IGitOperator {
    private gitPath: Lazy<string>;

    public constructor(private readonly logger: ILogger) {
        this.gitPath = lazyLoad(() => {
            const ext: gitExtension.GitExtension | undefined = <gitExtension.GitExtension>vscode.extensions.getExtension('vscode.git')?.exports;
            if (ext) {
                const api: gitExtension.API = ext.getAPI(1);
                return api.git.path;
            }
            return 'git';
        });
    }

    public async cloneRepository(url: string, destinationPath: vscode.Uri, branchName?: string): Promise<vscode.Uri | undefined> {
        // Create a folder destination based on the specified path and repository name
        const baseFolderName = decodeURI(url).replace(/[\/]+$/, '').replace(/^.*[\/\\]/, '').replace(/\.git$/, '') || 'repository';
        let folderName = baseFolderName;
        let folderPath = vscode.Uri.joinPath(destinationPath, folderName);

        // Try to find a unique folder for the repository. The clone will fail if the folder already exists
        let count = 1;
        while (count < 20 && await isDirectory(vscode.workspace.fs, folderPath)) {
            folderName = `${baseFolderName}-${count++}`;
            folderPath = vscode.Uri.joinPath(destinationPath, folderName);
        }

        try {
            const args: string[] = ['clone', url, folderPath.fsPath, '--progress' ];
            if (branchName) {
                args.push('-b', branchName);
            }
    
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t('Cloning git repository "{0}"...', url),
                cancellable: true
            }, async (progress, token) => {
                const progressReporter = new GitCloneProgressReporter(progress);
                return this.spawnProcess(this.gitPath(), args, progressReporter, token);
            });

            return folderPath;
        }
        catch (error: any) {
            let message = error?.message ?? vscode.l10n.t('Error cloning \'{0}\'', url);

            // Remove the 'Cloning' message from the error
            message = message.replace(/^Cloning.+$/m, '').trim();
            message = message.replace(/^ERROR:\s+/, '').trim();

            const showLogText = vscode.l10n.t('Show Fabric log');

            // Show a modal dialog displaying the error message and the option to open the Fabric output channel
            const selection = await vscode.window.showErrorMessage(
                `Fabric: ${message}`,
                { modal: true },
                showLogText,
            );
            if (selection === showLogText) {
                this.logger.show();
            }

            return undefined;
        }
    }

    private async spawnProcess(command: string, args: string[], progressReporter: GitCloneProgressReporter, cancellationToken: vscode.CancellationToken): Promise<void> {
        const fullCommandLine: string = `${command} ${args.join(' ')}`;
        this.logger.log(`Executing '${fullCommandLine}'`);
        const child = cp.spawn(command, args);

        const runPromise = new Promise((resolve, reject) => {
            const stderrBuffers: Buffer[] = [];

            child.stdout.on('data', (data: Buffer) => {
                this.logger.log(data.toString('utf-8'));
            });
            child.stderr.on('data', (data: Buffer) => {
                // For some reason, all messages are sent to stderr
                progressReporter.report(data);
                this.logger.log(data.toString('utf-8'));
                stderrBuffers.push(data);
            });
            child.on('close', (code) => {
                if (!code) {
                    code = 0;
                }
                if (code !== 0) {
                    this.logger.log(`Error code: ${code}`);
                    reject(new Error(Buffer.concat(stderrBuffers).toString('utf8')));
                }
                resolve({ code });
            });
            child.on('error', (err) => {
                this.logger.log(`Error: ${err}`);
                reject(err);
            });
        });

        const cancellationPromise = new Promise((_, reject) => {
            cancellationToken.onCancellationRequested(() => {
                try {
                    child.kill();
                }
                catch (err) {
                    this.logger.log(`Failed to kill process: ${err}`);
                }
                reject(new vscode.CancellationError());
            });
        });

        await Promise.race([runPromise, cancellationPromise]);
    }
}

class GitCloneProgressReporter {
    private totalProgress: number = 0;
    private previousProgress: number = 0;

    constructor(private progress: vscode.Progress<{ increment?: number; }>) {
    }

    report(data: Buffer) {
        // Check the message text to get a status update.
        // This code is borrowed from the git extension implementation: https://github.com/microsoft/vscode/blob/main/extensions/git/src/git.ts
        const line: string = data.toString('utf8');
        let match: RegExpExecArray | null = null;

        if (match = /Counting objects:\s*(\d+)%/i.exec(line)) {
            this.totalProgress = Math.floor(parseInt(match[1]) * 0.1);
        }
        else if (match = /Compressing objects:\s*(\d+)%/i.exec(line)) {
            this.totalProgress = 10 + Math.floor(parseInt(match[1]) * 0.1);
        }
        else if (match = /Receiving objects:\s*(\d+)%/i.exec(line)) {
            this.totalProgress = 20 + Math.floor(parseInt(match[1]) * 0.4);
        }
        else if (match = /Resolving deltas:\s*(\d+)%/i.exec(line)) {
            this.totalProgress = 60 + Math.floor(parseInt(match[1]) * 0.4);
        }

        if (this.totalProgress !== this.previousProgress) {
            this.progress?.report({ increment: this.totalProgress - this.previousProgress});
            this.previousProgress = this.totalProgress;
        }
    }
}
