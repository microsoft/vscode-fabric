// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifact } from '@microsoft/vscode-fabric-api';
import { IFabricEnvironmentProvider, TelemetryService } from '@microsoft/vscode-fabric-util';

type CopyCommandId = 'scaffold' | 'dataApp' | 'changeDirectory' | 'startDevelopment' | 'publish';

type WebviewMessage =
    | { command: 'copyPrompt' }
    | { command: 'copyToClipboard'; commandId: CopyCommandId };

export class AppBackendWebviewPanel {
    private static panels: Map<string, vscode.WebviewPanel> = new Map();

    public static show(
        artifact: IArtifact,
        fabricEnvironmentProvider?: IFabricEnvironmentProvider,
        telemetryService?: TelemetryService
    ): void {
        const panelKey = `${artifact.workspaceId}:${artifact.id}`;

        const existingPanel = AppBackendWebviewPanel.panels.get(panelKey);
        if (existingPanel) {
            existingPanel.reveal(vscode.ViewColumn.One);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'appBackendGettingStarted',
            `${artifact.displayName} - Getting Started`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
            }
        );

        AppBackendWebviewPanel.panels.set(panelKey, panel);
        panel.onDidDispose(() => {
            AppBackendWebviewPanel.panels.delete(panelKey);
        });

        const baseApiUrl = AppBackendWebviewPanel.getBaseApiUrl(fabricEnvironmentProvider);
        const commands = AppBackendWebviewPanel.getCommands(artifact, baseApiUrl);
        panel.webview.html = AppBackendWebviewPanel.getHtmlContent(panel.webview, artifact, commands);

        panel.webview.onDidReceiveMessage(async (message) => {
            if (!AppBackendWebviewPanel.isWebviewMessage(message)) {
                return;
            }

            if (message.command === 'copyToClipboard') {
                telemetryService?.sendTelemetryEvent('appBackend/getStarted/copyCommand', {
                    itemType: artifact.type,
                    commandId: message.commandId,
                });
                await vscode.env.clipboard.writeText(commands[message.commandId]);
                vscode.window.showInformationMessage(vscode.l10n.t('Copied to clipboard'));
            }
            else if (message.command === 'copyPrompt') {
                telemetryService?.sendTelemetryEvent('appBackend/getStarted/copyPrompt', {
                    itemType: artifact.type,
                });
                const prompt = AppBackendWebviewPanel.getAiPrompt(artifact, baseApiUrl);
                await vscode.env.clipboard.writeText(prompt);
                vscode.window.showInformationMessage(vscode.l10n.t('AI prompt copied to clipboard'));
            }
        });
    }

    private static isWebviewMessage(message: unknown): message is WebviewMessage {
        if (!message || typeof message !== 'object' || !('command' in message)) {
            return false;
        }

        if (message.command === 'copyPrompt') {
            return true;
        }

        return message.command === 'copyToClipboard'
            && 'commandId' in message
            && AppBackendWebviewPanel.isCopyCommandId(message.commandId);
    }

    private static isCopyCommandId(value: unknown): value is CopyCommandId {
        return typeof value === 'string'
            && ['scaffold', 'dataApp', 'changeDirectory', 'startDevelopment', 'publish'].includes(value);
    }

    private static getBaseApiUrl(fabricEnvironmentProvider?: IFabricEnvironmentProvider): string {
        try {
            const env = fabricEnvironmentProvider?.getCurrent();
            return env?.sharedUri ?? 'https://api.fabric.microsoft.com';
        }
        catch {
            return 'https://api.fabric.microsoft.com';
        }
    }

    private static getAiPrompt(artifact: IArtifact, baseApiUrl: string): string {
        return `I want to build and deploy a Fabric App Backend named "${artifact.displayName}" in workspace "${artifact.workspaceId}".

Setup:
  npm create @microsoft/rayfin@latest -- "${artifact.displayName}" --workspace "${artifact.workspaceId}" --base-api-url ${baseApiUrl}

Development:
  cd ${artifact.displayName}
  npm run dev

Deploy:
  npx rayfin up

Help me build this App Backend.`;
    }

    private static getCommands(artifact: IArtifact, baseApiUrl: string): Record<CopyCommandId, string> {
        return {
            scaffold: `npm create @microsoft/rayfin@latest -- "${artifact.displayName}" --workspace "${artifact.workspaceId}" --base-api-url ${baseApiUrl}`,
            dataApp: `npm create @microsoft/rayfin@latest -- "${artifact.displayName}" --template dataapp --workspace "${artifact.workspaceId}" --base-api-url ${baseApiUrl}`,
            changeDirectory: `cd ${artifact.displayName}`,
            startDevelopment: 'npm run dev',
            publish: 'npx rayfin up',
        };
    }

    private static getHtmlContent(
        webview: vscode.Webview,
        artifact: IArtifact,
        commands: Record<CopyCommandId, string>
    ): string {
        const nonce = getNonce();

        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Getting Started - ${escapeHtml(artifact.displayName)}</title>
    <style nonce="${nonce}">
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            padding: 24px 32px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            line-height: 1.6;
            max-width: 800px;
        }

        h1 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 24px;
            color: var(--vscode-foreground);
        }

        .info-banner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background-color: var(--vscode-editorInfo-background, rgba(0, 122, 204, 0.1));
            border: 1px solid var(--vscode-editorInfo-foreground, #007acc);
            border-radius: 4px;
            padding: 10px 16px;
            margin-bottom: 32px;
        }

        .info-banner .info-text {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .info-banner .info-icon {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background-color: var(--vscode-editorInfo-foreground, #007acc);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: bold;
            flex-shrink: 0;
        }

        .copy-prompt-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            border: 1px solid var(--vscode-button-border, var(--vscode-foreground));
            border-radius: 4px;
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 13px;
            white-space: nowrap;
        }

        .copy-prompt-btn:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }

        .step {
            margin-bottom: 28px;
        }

        .step-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }

        .step-number {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background-color: var(--vscode-editorInfo-foreground, #2e7d32);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 600;
            flex-shrink: 0;
        }

        .step-title {
            font-size: 16px;
            font-weight: 600;
        }

        .step-description {
            margin-left: 40px;
            margin-bottom: 8px;
            color: var(--vscode-descriptionForeground);
        }

        .code-block {
            position: relative;
            margin-left: 40px;
            margin-top: 8px;
            margin-bottom: 8px;
        }

        .code-block pre {
            background-color: var(--vscode-textCodeBlock-background, #1e1e1e);
            border: 1px solid var(--vscode-widget-border, #333);
            border-radius: 4px;
            padding: 12px 44px 12px 16px;
            margin: 0;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family, 'Cascadia Code', 'Fira Code', Consolas, monospace);
            font-size: 13px;
            line-height: 1.5;
            color: var(--vscode-editor-foreground);
        }

        .copy-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            width: 28px;
            height: 28px;
            border: none;
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.7;
        }

        .copy-btn:hover {
            opacity: 1;
            background-color: var(--vscode-toolbar-hoverBackground);
        }

        .copy-btn svg {
            width: 16px;
            height: 16px;
        }

        .template-note {
            margin-left: 40px;
            margin-top: 12px;
            padding: 10px 14px;
            background-color: var(--vscode-editorWidget-background, rgba(50, 50, 50, 0.5));
            border-left: 3px solid var(--vscode-editorInfo-foreground, #007acc);
            border-radius: 2px;
            font-size: 13px;
        }

        .template-note strong {
            color: var(--vscode-foreground);
        }

        .feature-list {
            margin-left: 40px;
            padding-left: 20px;
            color: var(--vscode-descriptionForeground);
        }

        .feature-list li {
            margin-bottom: 4px;
        }
    </style>
</head>
<body>
    <h1>Getting Started</h1>

    <div class="info-banner">
        <div class="info-text">
            <div class="info-icon">i</div>
            <span>Using an AI coding agent? Skip the steps below.</span>
        </div>
        <button class="copy-prompt-btn" data-action="copyPrompt">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 4h1V3H4v1zm0 3h1V6H4v1zm0 3h1V9H4v1zm7-6h1V3h-1v1zm0
                    3h1V6h-1v1zm-3 6h1v-1H8v1zm-4 0h1v-1H4v1zm8-9V1H2v12h2v2h10V4h-2zM3
                    12V2h8v2H5v8H3zm9 2H6V5h6v9z"/>
            </svg>
            Copy prompt
        </button>
    </div>

    <div class="step">
        <div class="step-header">
            <div class="step-number">1</div>
            <div class="step-title">Open a terminal</div>
        </div>
        <div class="step-description">Open a terminal and navigate to the folder where you want to create your project</div>
    </div>

    <div class="step">
        <div class="step-header">
            <div class="step-number">2</div>
            <div class="step-title">Set up your project</div>
        </div>
        <div class="step-description">Run this command to scaffold your project</div>
        <div class="code-block">
            <pre><code>${escapeHtml(commands.scaffold)}</code></pre>
            <button class="copy-btn" data-command-id="scaffold" title="Copy to clipboard">
                <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 4h1V3H4v1zm0 3h1V6H4v1zm0 3h1V9H4v1zm7-6h1V3h-1v1zm0 3h1V6h-1v1zm-3 6h1v-1H8v1zm-4 0h1v-1H4v1zm8-9V1H2v12h2v2h10V4h-2zM3 12V2h8v2H5v8H3zm9 2H6V5h6v9z"/></svg>
            </button>
        </div>
        <div class="template-note">
            <strong>Want to connect to a semantic model?</strong> Use the <code>dataapp</code> template instead:
        </div>
        <div class="code-block">
            <pre><code>${escapeHtml(commands.dataApp)}</code></pre>
            <button class="copy-btn" data-command-id="dataApp" title="Copy to clipboard">
                <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 4h1V3H4v1zm0 3h1V6H4v1zm0 3h1V9H4v1zm7-6h1V3h-1v1zm0 3h1V6h-1v1zm-3 6h1v-1H8v1zm-4 0h1v-1H4v1zm8-9V1H2v12h2v2h10V4h-2zM3 12V2h8v2H5v8H3zm9 2H6V5h6v9z"/></svg>
            </button>
        </div>
        <div class="step-description">The data app template includes built-in support for:</div>
        <ul class="feature-list">
            <li>Fabric authentication and semantic model connectivity</li>
            <li>AI-assisted DAX query generation</li>
            <li>Charts, data grids, and KPI cards</li>
            <li>Theming and format strings</li>
        </ul>
    </div>

    <div class="step">
        <div class="step-header">
            <div class="step-number">3</div>
            <div class="step-title">Edit the app</div>
        </div>
        <div class="step-description">Navigate to your project directory</div>
        <div class="code-block">
            <pre><code>${escapeHtml(commands.changeDirectory)}</code></pre>
            <button class="copy-btn" data-command-id="changeDirectory" title="Copy to clipboard">
                <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 4h1V3H4v1zm0 3h1V6H4v1zm0 3h1V9H4v1zm7-6h1V3h-1v1zm0 3h1V6h-1v1zm-3 6h1v-1H8v1zm-4 0h1v-1H4v1zm8-9V1H2v12h2v2h10V4h-2zM3 12V2h8v2H5v8H3zm9 2H6V5h6v9z"/></svg>
            </button>
        </div>
        <div class="step-description">Edit your app code directly. Run it locally against your Fabric backend.</div>
        <div class="code-block">
            <pre><code>${escapeHtml(commands.startDevelopment)}</code></pre>
            <button class="copy-btn" data-command-id="startDevelopment" title="Copy to clipboard">
                <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 4h1V3H4v1zm0 3h1V6H4v1zm0 3h1V9H4v1zm7-6h1V3h-1v1zm0 3h1V6h-1v1zm-3 6h1v-1H8v1zm-4 0h1v-1H4v1zm8-9V1H2v12h2v2h10V4h-2zM3 12V2h8v2H5v8H3zm9 2H6V5h6v9z"/></svg>
            </button>
        </div>
    </div>

    <div class="step">
        <div class="step-header">
            <div class="step-number">4</div>
            <div class="step-title">Publish your changes</div>
        </div>
        <div class="step-description">When you're ready, deploy your updates to Fabric.</div>
        <div class="code-block">
            <pre><code>${escapeHtml(commands.publish)}</code></pre>
            <button class="copy-btn" data-command-id="publish" title="Copy to clipboard">
                <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 4h1V3H4v1zm0 3h1V6H4v1zm0 3h1V9H4v1zm7-6h1V3h-1v1zm0 3h1V6h-1v1zm-3 6h1v-1H8v1zm-4 0h1v-1H4v1zm8-9V1H2v12h2v2h10V4h-2zM3 12V2h8v2H5v8H3zm9 2H6V5h6v9z"/></svg>
            </button>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        document.querySelector('[data-action="copyPrompt"]').addEventListener('click', () => {
            vscode.postMessage({ command: 'copyPrompt' });
        });

        document.querySelectorAll('[data-command-id]').forEach(button => {
            button.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'copyToClipboard',
                    commandId: button.dataset.commandId,
                });
            });
        });
    </script>
</body>
</html>`;
    }
}

function getNonce(): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return nonce;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
