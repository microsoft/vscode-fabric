// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import { registerLocalProjectCommands } from '../../../src/localProject/commands';
import { commandNames } from '../../../src/constants';
import { IWorkspaceManager, IWorkspace, LocalProjectTreeNode, IFabricApiClient } from '@microsoft/vscode-fabric-api';
import { IArtifactManagerInternal } from '../../../src/apis/internal/fabricExtensionInternal';
import { TelemetryService, IFabricEnvironmentProvider, ILogger } from '@microsoft/vscode-fabric-util';
import { UserCancelledError } from '@microsoft/vscode-fabric-util';
import { ICapacityManager } from '../../../src/CapacityManager';
import { FabricWorkspaceDataProvider } from '../../../src/workspace/treeView';
import { ILocalFolderManager } from '../../../src/LocalFolderManager';
import { IWorkspaceFilterManager } from '../../../src/workspace/WorkspaceFilterManager';

describe('registerLocalProjectCommands', () => {
    let contextMock: Mock<vscode.ExtensionContext>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let fabricEnvironmentProviderMock: Mock<IFabricEnvironmentProvider>;
    let artifactManagerMock: Mock<IArtifactManagerInternal>;
    let localFolderManagerMock: Mock<ILocalFolderManager>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let loggerMock: Mock<ILogger>;
    let capacityManagerMock: Mock<ICapacityManager>;
    let workspaceFilterManagerMock: Mock<IWorkspaceFilterManager>;
    let dataProviderMock: Mock<FabricWorkspaceDataProvider>;

    let registerCommandStub: sinon.SinonStub;
    let originalRegisterCommand: typeof vscode.commands.registerCommand;
    let disposeSpy: sinon.SinonSpy;

    beforeEach(() => {
        contextMock = new Mock<vscode.ExtensionContext>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        fabricEnvironmentProviderMock = new Mock<IFabricEnvironmentProvider>();
        artifactManagerMock = new Mock<IArtifactManagerInternal>();
        localFolderManagerMock = new Mock<ILocalFolderManager>();
        telemetryServiceMock = new Mock<TelemetryService>();
        loggerMock = new Mock<ILogger>();
        capacityManagerMock = new Mock<ICapacityManager>();
        workspaceFilterManagerMock = new Mock<IWorkspaceFilterManager>();
        dataProviderMock = new Mock<FabricWorkspaceDataProvider>();

        contextMock.setup(x => x.subscriptions).returns([]);

        localFolderManagerMock.setup(x => x.getWorkspaceIdForLocalFolder(It.IsAny<vscode.Uri>())).returns(undefined);

        // Stub vscode.commands.registerCommand to capture registrations
        //registerCommandStub = sinon.stub();
        disposeSpy = sinon.spy();
        registerCommandStub = sinon.stub().returns({ dispose: disposeSpy });        originalRegisterCommand = vscode.commands.registerCommand;
        (vscode.commands as any).registerCommand = registerCommandStub;
    });

    afterEach(() => {
        // Restore the original registerCommand
        (vscode.commands as any).registerCommand = originalRegisterCommand;
        sinon.restore();
    });

    [
        { name: 'vscode-fabric.importArtifact' },
    ].forEach(command => {
        it(`registers ${command.name} command`, async () => {
            await act();

            // Find the registration for the command
            const commandRegistration = registerCommandStub.getCalls().find(call =>
                call.args[0] === command.name
            );
            assert.ok(commandRegistration, `${command.name} command should be registered`);
            assert.strictEqual(typeof commandRegistration.args[1], 'function', 'Callback should be a function');
        });
    });

    it('commands are registered', async () => {
        await act();

        const expectedCommands: string[] = [
            'vscode-fabric.importArtifact',
        ];
        expectedCommands.forEach(command => {
            const commandRegistration = registerCommandStub.getCalls().find(call =>
                call.args[0] === command
            );
            assert.ok(commandRegistration, `${command} command should be registered`);
            assert.strictEqual(typeof commandRegistration.args[1], 'function', 'Callback should be a function');
        });
    });

    it('disposes previous commands only on second registration', async () => {
        // First registration
        await act();

        // Should NOT be called after first registration
        assert.strictEqual(disposeSpy.called, false, 'dispose should NOT be called after first registration');

        // Second registration
        await act();

        // Should be called after second registration
        assert.strictEqual(disposeSpy.called, true, 'dispose should be called after second registration');
        assert.strictEqual(disposeSpy.callCount, 2, 'dispose should be called for each registered command');
    });

    describe('Execute callbacks', () => {
        const folder = vscode.Uri.file('/path/to/local/folder/test-artifact');
        const treeNode = { folder } as LocalProjectTreeNode;
        let capturedTelemetryProps: any = undefined;

        beforeEach(() => {
            fabricEnvironmentProviderMock.setup(x => x.getCurrent())
                .returns({ sharedUri: 'https://test.fabric', env: 'test-env' } as any);

            const testWorkspace = { objectId: 'test-workspace-id', displayName: 'TestWorkspaceDisplayName' } as IWorkspace;
            workspaceManagerMock.setup(x => x.listWorkspaces()).returns(Promise.resolve([testWorkspace]));
            workspaceManagerMock.setup(x => x.getWorkspaceById('test-workspace-id')).returns(Promise.resolve(testWorkspace));

            telemetryServiceMock.setup(x =>
                x.sendTelemetryEvent(
                    It.IsAny(),
                    It.Is<any>(props => {
                        capturedTelemetryProps = props;
                        return true;
                    }),
                    It.IsAny()
                )
            ).returns(undefined);
        });

        afterEach(() => {
            sinon.restore();
        });

        [
            {
                commandName: commandNames.importArtifact,
                modulePath: '../../../src/localProject/importArtifactCommand',
                stubName: 'importArtifactCommand',
                telemetryEvent: 'item/import',
            },
        ].forEach(({ commandName, modulePath, stubName, telemetryEvent }) => {
            it(`executes ${stubName}`, async () => {
                // Arrange
                const commandModule = await import(modulePath);
                const commandStub = sinon.stub().resolves();
                sinon.replace(commandModule, stubName, commandStub);

                // Act
                await act();

                const registration = registerCommandStub.getCalls().find(call => call.args[0] === commandName);
                assert.ok(registration, `${commandName} command should be registered`);
                const callback = registration.args[1];

                await callback(treeNode);

                // Assert
                assert.strictEqual(commandStub.calledOnce, true, `${stubName} should be called once`);
                const [args] = commandStub.firstCall.args;
                assert.strictEqual(args, folder, `${stubName} should be called with the correct folder`);
                //verifyTelemetry(telemetryServiceMock, telemetryEvent);
            });
        });

        [
            {
                commandName: 'vscode-fabric.importArtifact',
                modulePath: '../../../src/localProject/importArtifactCommand',
                stubName: 'importArtifactCommand',
                telemetryEvent: 'item/import',
            },
        ].forEach(({ commandName, modulePath, stubName, telemetryEvent }) => {
            it(`executes ${stubName} and handles user cancel`, async () => {
                // Arrange
                const commandModule = await import(modulePath);
                const commandStub = sinon.stub().rejects(new UserCancelledError());
                sinon.replace(commandModule, stubName, commandStub);

                // Act
                await act();
                const registration = registerCommandStub.getCalls().find(call => call.args[0] === commandName);
                assert.ok(registration, `${commandName} command should be registered`);
                const callback = registration.args[1];
                await callback(treeNode);

                // Assert
                assert.strictEqual(commandStub.calledOnce, true, `${stubName} should be called once`);
                assert.strictEqual(capturedTelemetryProps.result, 'Canceled', 'result should be Canceled');
            });

            it(`executes ${stubName} and handles error`, async () => {
                // Arrange
                const commandModule = await import(modulePath);
                const commandStub = sinon.stub().rejects(new Error('Test error'));
                sinon.replace(commandModule, stubName, commandStub);

                // Act & Assert
                await act();
                const registration = registerCommandStub.getCalls().find(call => call.args[0] === commandName);
                assert.ok(registration, `${commandName} command should be registered`);
                const callback = registration.args[1];

                await assert.rejects(
                    async () => {
                        await callback(treeNode);
                    },
                    (err: Error) => {
                        return true;
                    }
                );

                // Assert
                assert.strictEqual(commandStub.calledOnce, true, `${stubName} should be called once`);

                assert.strictEqual(capturedTelemetryProps.result, 'Failed', 'result should be Failed');
            });
        });
    });

    async function act(): Promise<void> {
        await registerLocalProjectCommands(
            contextMock.object(),
            workspaceManagerMock.object(),
            fabricEnvironmentProviderMock.object(),
            artifactManagerMock.object(),
            localFolderManagerMock.object(),
            workspaceFilterManagerMock.object(),
            capacityManagerMock.object(),
            dataProviderMock.object(),
            telemetryServiceMock.object(),
            loggerMock.object()
        );
    }

});
