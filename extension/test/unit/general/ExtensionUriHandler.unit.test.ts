// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { ExtensionUriHandler } from '../../../src/ExtensionUriHandler';
import { IFabricExtensionServiceCollection } from '@microsoft/vscode-fabric-api';
import { FabricUriHandler, IConfigurationProvider, ILogger } from '@microsoft/vscode-fabric-util';
import { WorkspaceManager } from '../../../src/workspace/WorkspaceManager';

describe('ExtensionUriHandler', () => {
    let sandbox: sinon.SinonSandbox;
    let configEmitters: vscode.EventEmitter<string>[];

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        configEmitters = [];

        sandbox.stub(vscode.l10n, 't').callsFake((messageOrOptions: any, ...params: any[]) => {
            if (typeof messageOrOptions === 'string') {
                const message = messageOrOptions;
                if (params.length === 0) {
                    return message;
                }

                return message.replace(/\{(\d+)\}/g, (_match: string, index: string) => {
                    const numericIndex = Number(index);
                    return params[numericIndex] ?? '';
                });
            }

            if (typeof messageOrOptions === 'object' && messageOrOptions?.message) {
                const message: string = messageOrOptions.message;
                const args = Array.isArray(messageOrOptions.args) ? messageOrOptions.args : [];
                if (args.length === 0) {
                    return message;
                }

                return message.replace(/\{(\d+)\}/g, (_match: string, index: string) => {
                    const numericIndex = Number(index);
                    return (args as any[])[numericIndex] ?? '';
                });
            }

            return '';
        });
    });

    afterEach(() => {
        configEmitters.forEach(emitter => emitter.dispose());
        sandbox.restore();
    });

    function createLogger(infoSpy?: sinon.SinonSpy): ILogger {
        const spy = infoSpy ?? sandbox.spy();
        return {
            trace: () => { /* no-op */ },
            debug: () => { /* no-op */ },
            info: spy,
            warn: () => { /* no-op */ },
            error: () => { /* no-op */ },
            show: () => { /* no-op */ },
            log: () => { /* no-op */ },
            reportExceptionTelemetryAndLog: () => { /* no-op */ },
        };
    }

    function createHandler(overrides?: {
        refreshStub?: sinon.SinonStub<[], Promise<void>>;
        loggerInfoSpy?: sinon.SinonSpy;
        configProvider?: IConfigurationProvider;
    }): {
            handler: ExtensionUriHandler;
            refreshStub: sinon.SinonStub<[], Promise<void>>;
            infoSpy: sinon.SinonSpy;
            core: IFabricExtensionServiceCollection;
        } {
        const refreshStub = overrides?.refreshStub ?? sandbox.stub<[], Promise<void>>().resolves();
        const workspaceManager = { refreshConnectionToFabric: refreshStub } as unknown as WorkspaceManager;
        const core: IFabricExtensionServiceCollection = {
            workspaceManager,
            artifactManager: {} as any,
            apiClient: {} as any,
        };
        const infoSpy = overrides?.loggerInfoSpy ?? sandbox.spy();
        const handler = new ExtensionUriHandler(
            core,
            null,
            createLogger(infoSpy)
        );
        return { handler, refreshStub, infoSpy, core };
    }

    it('handles signup completion callback with auto-assigned license', async () => {
        const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves(undefined);
        const showInformationStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);

        const { handler, refreshStub, infoSpy } = createHandler();

        const uri = vscode.Uri.parse('vscode-fabric://signup?signedUp=1&autoAssigned=1');
        await handler.handleUri(uri);

        assert.strictEqual(refreshStub.calledOnce, true, 'refreshConnectionToFabric should be invoked when signup completes');
        assert.strictEqual(executeCommandStub.calledOnce, true, 'workbench view should be shown');
        assert.deepStrictEqual(executeCommandStub.firstCall.args, ['workbench.view.extension.vscode-fabric_view_workspace']);
        const expectedTitle = 'Microsoft Fabric (Free) license assigned. You\'re signed in and can now create and explore Fabric items.';
        const expectedButtons = ['Learn More', 'Privacy Statement'];
        assert.strictEqual(showInformationStub.calledOnce, true, 'informational message should be shown');
        assert.strictEqual(showInformationStub.firstCall.args[0], expectedTitle, 'auto-assigned license title should be used');
        assert.deepStrictEqual(showInformationStub.firstCall.args.slice(1), expectedButtons, 'auto-assigned license buttons should be used');
        assert.strictEqual(infoSpy.calledWith('Signup completion callback received'), true, 'logger should record signup completion');
    });

    it('delegates to base handler when URI is not a signup callback', async () => {
        const baseHandleStub = sandbox.stub(FabricUriHandler.prototype, 'handleUri').resolves();
        const { handler } = createHandler();

        const uri = vscode.Uri.parse('vscode-fabric://signup?artifactId=12345');
        await handler.handleUri(uri);

        assert.strictEqual(baseHandleStub.calledOnce, true, 'base handler should be invoked for non-signup URIs');
        assert.strictEqual(baseHandleStub.firstCall.args[0], uri, 'base handler should receive the original URI');
    });
});
