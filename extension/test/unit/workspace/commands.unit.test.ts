// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import { registerWorkspaceCommands } from '../../../src/workspace/commands';
import { commandNames } from '../../../src/constants';
import { WorkspaceManagerBase } from '../../../src/workspace/WorkspaceManager';
import { TelemetryService, ILogger, IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { IAccountProvider } from '../../../src/authentication/interfaces';
import { ICapacityManager } from '../../../src/CapacityManager';
import { IWorkspaceFilterManager } from '../../../src/workspace/WorkspaceFilterManager';

describe('Workspace Commands', () => {
    let contextMock: Mock<vscode.ExtensionContext>;
    let accountProviderMock: Mock<IAccountProvider>;
    let workspaceManagerMock: Mock<WorkspaceManagerBase>;
    let capacityManagerMock: Mock<ICapacityManager>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let loggerMock: Mock<ILogger>;
    let workspaceFilterManagerMock: Mock<IWorkspaceFilterManager>;
    let fabricEnvironmentProviderMock: Mock<IFabricEnvironmentProvider>;

    let registerCommandStub: sinon.SinonStub;
    let originalRegisterCommand: typeof vscode.commands.registerCommand;
    let disposeSpy: sinon.SinonSpy;

    beforeEach(() => {
        contextMock = new Mock<vscode.ExtensionContext>();
        accountProviderMock = new Mock<IAccountProvider>();
        workspaceManagerMock = new Mock<WorkspaceManagerBase>();
        capacityManagerMock = new Mock<ICapacityManager>();
        telemetryServiceMock = new Mock<TelemetryService>();
        loggerMock = new Mock<ILogger>();
        workspaceFilterManagerMock = new Mock<IWorkspaceFilterManager>();
        fabricEnvironmentProviderMock = new Mock<IFabricEnvironmentProvider>();

        contextMock.setup(x => x.subscriptions).returns([]);

        // Stub vscode.commands.registerCommand to capture registrations
        disposeSpy = sinon.spy();
        registerCommandStub = sinon.stub().returns({ dispose: disposeSpy });
        originalRegisterCommand = vscode.commands.registerCommand;
        (vscode.commands as any).registerCommand = registerCommandStub;
    });

    afterEach(() => {
        // Restore the original registerCommand
        (vscode.commands as any).registerCommand = originalRegisterCommand;
        sinon.restore();
    });

    describe('registerWorkspaceCommands', () => {
        it('should register signUpForFabric command', () => {
            registerWorkspaceCommands(
                contextMock.object(),
                accountProviderMock.object(),
                workspaceManagerMock.object(),
                capacityManagerMock.object(),
                telemetryServiceMock.object(),
                loggerMock.object(),
                workspaceFilterManagerMock.object(),
                fabricEnvironmentProviderMock.object()
            );

            assert.ok(
                registerCommandStub.calledWith(
                    commandNames.signUpForFabric,
                    sinon.match.func
                ),
                'signUpForFabric command should be registered'
            );
        });
    });

    describe('signUpForFabric command', () => {
        let openExternalStub: sinon.SinonStub;
        let parseStub: sinon.SinonStub;
        let sessionInfo: vscode.AuthenticationSession;

        beforeEach(() => {
            // Create mock session info
            sessionInfo = {
                id: 'test-session-id',
                accessToken: 'test-token',
                account: {
                    id: 'test-account-id',
                    label: 'test@example.com',
                },
                scopes: [],
            };

            // Stub vscode.env.openExternal
            openExternalStub = sinon.stub(vscode.env, 'openExternal').resolves(true);
            parseStub = sinon.stub(vscode.Uri, 'parse').callsFake((url: string) => {
                return { toString: () => url } as vscode.Uri;
            });

            // Setup mocks
            accountProviderMock.setup(x => x.getSessionInfo(It.IsAny())).returns(Promise.resolve(sessionInfo));
            fabricEnvironmentProviderMock.setup(x => x.getCurrent()).returns({
                env: 'PROD',
                clientId: 'test-client-id',
                scopes: ['https://analysis.windows.net/powerbi/api/.default'],
                sharedUri: 'https://api.fabric.microsoft.com',
                portalUri: 'app.fabric.microsoft.com',
                sessionProvider: 'microsoft',
            });
            telemetryServiceMock.setup(x => x.sendTelemetryEvent(It.IsAny(), It.IsAny())).returns();
        });

        it('should open external browser with correct signup URL', async () => {
            registerWorkspaceCommands(
                contextMock.object(),
                accountProviderMock.object(),
                workspaceManagerMock.object(),
                capacityManagerMock.object(),
                telemetryServiceMock.object(),
                loggerMock.object(),
                workspaceFilterManagerMock.object(),
                fabricEnvironmentProviderMock.object()
            );

            // Get the registered callback for signUpForFabric
            const signUpCallback = registerCommandStub
                .getCalls()
                .find(call => call.args[0] === commandNames.signUpForFabric)?.args[1];

            assert.ok(signUpCallback, 'signUpForFabric callback should be registered');

            // Execute the command
            await signUpCallback();

            // Verify openExternal was called
            assert.ok(openExternalStub.calledOnce, 'openExternal should be called once');

            // Verify the URL structure
            const calledUrl = parseStub.firstCall.args[0];
            assert.ok(calledUrl.includes('https://app.fabric.microsoft.com/autoSignUp'), 'URL should contain signup path');
            assert.ok(calledUrl.includes('clientApp=vscode'), 'URL should contain clientApp parameter');
            assert.ok(calledUrl.includes('loginHint=test%40example.com'), 'URL should contain encoded loginHint');
            assert.ok(calledUrl.includes('vscodeApp='), 'URL should contain vscodeApp parameter');
        });

        it('should send telemetry event with correct properties', async () => {
            registerWorkspaceCommands(
                contextMock.object(),
                accountProviderMock.object(),
                workspaceManagerMock.object(),
                capacityManagerMock.object(),
                telemetryServiceMock.object(),
                loggerMock.object(),
                workspaceFilterManagerMock.object(),
                fabricEnvironmentProviderMock.object()
            );

            const signUpCallback = registerCommandStub
                .getCalls()
                .find(call => call.args[0] === commandNames.signUpForFabric)?.args[1];

            await signUpCallback();

            telemetryServiceMock.verify(
                x => x.sendTelemetryEvent(
                    'fabric/signUpInitiated',
                    It.Is((props: any) =>
                        props.portalUri === 'app.fabric.microsoft.com' &&
                        props.hasLoginHint === 'true' &&
                        props.vscodeApp !== undefined
                    )
                ),
                Times.Once()
            );
        });

        it('should handle missing session info gracefully', async () => {
            // Override mock to return null session
            accountProviderMock.setup(x => x.getSessionInfo(It.IsAny())).returns(Promise.resolve(null));

            registerWorkspaceCommands(
                contextMock.object(),
                accountProviderMock.object(),
                workspaceManagerMock.object(),
                capacityManagerMock.object(),
                telemetryServiceMock.object(),
                loggerMock.object(),
                workspaceFilterManagerMock.object(),
                fabricEnvironmentProviderMock.object()
            );

            const signUpCallback = registerCommandStub
                .getCalls()
                .find(call => call.args[0] === commandNames.signUpForFabric)?.args[1];

            await signUpCallback();

            // Verify openExternal was still called (with empty loginHint)
            assert.ok(openExternalStub.calledOnce, 'openExternal should be called even without session');

            const calledUrl = parseStub.firstCall.args[0];
            assert.ok(calledUrl.includes('loginHint='), 'URL should contain loginHint parameter (empty)');
        });

        it('should handle errors and show error message', async () => {
            const showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage').resolves();
            const testError = new Error('Test error');

            // Override mock to throw error
            accountProviderMock.setup(x => x.getSessionInfo(It.IsAny())).throws(testError);
            loggerMock.setup(x => x.reportExceptionTelemetryAndLog(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny())).returns();

            registerWorkspaceCommands(
                contextMock.object(),
                accountProviderMock.object(),
                workspaceManagerMock.object(),
                capacityManagerMock.object(),
                telemetryServiceMock.object(),
                loggerMock.object(),
                workspaceFilterManagerMock.object(),
                fabricEnvironmentProviderMock.object()
            );

            const signUpCallback = registerCommandStub
                .getCalls()
                .find(call => call.args[0] === commandNames.signUpForFabric)?.args[1];

            await signUpCallback();

            // Verify error was logged
            loggerMock.verify(
                x => x.reportExceptionTelemetryAndLog(
                    'signUpForFabric',
                    'fabric/signUpError',
                    testError,
                    telemetryServiceMock.object()
                ),
                Times.Once()
            );

            // Verify error message was shown
            assert.ok(showErrorMessageStub.calledOnce, 'Error message should be shown');
        });

        it('should use correct portal URI from environment provider', async () => {
            // Setup different environment
            fabricEnvironmentProviderMock.setup(x => x.getCurrent()).returns({
                env: 'CUSTOM',
                clientId: 'custom-client-id',
                scopes: ['https://analysis.windows.net/powerbi/api/.default'],
                sharedUri: 'https://api.custom.fabric.example.com',
                portalUri: 'custom.fabric.example.com',
                sessionProvider: 'microsoft',
            });

            registerWorkspaceCommands(
                contextMock.object(),
                accountProviderMock.object(),
                workspaceManagerMock.object(),
                capacityManagerMock.object(),
                telemetryServiceMock.object(),
                loggerMock.object(),
                workspaceFilterManagerMock.object(),
                fabricEnvironmentProviderMock.object()
            );

            const signUpCallback = registerCommandStub
                .getCalls()
                .find(call => call.args[0] === commandNames.signUpForFabric)?.args[1];

            await signUpCallback();

            const calledUrl = parseStub.firstCall.args[0];
            assert.ok(
                calledUrl.includes('https://custom.fabric.example.com/autoSignUp'),
                'URL should use custom portal URI'
            );
        });
    });
});
