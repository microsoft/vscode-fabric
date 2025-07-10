import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import { registerArtifactCommands } from '../../../artifactManager/commands';
import { commandNames } from '../../../constants';
import { ArtifactTreeNode, IWorkspaceManager, IArtifact, IWorkspace } from '@fabric/vscode-fabric-api';
import { FabricWorkspaceDataProvider } from '../../../workspace/treeView';
import { IArtifactManagerInternal, IFabricExtensionManagerInternal } from '../../../apis/internal/fabricExtensionInternal';
import { TelemetryService, TelemetryActivity, IFabricEnvironmentProvider, ILogger } from '@fabric/vscode-fabric-util';
import { UserCancelledError } from '@fabric/vscode-fabric-util';
import { IItemDefinitionWriter } from '../../../itemDefinition/definitions';

describe('registerArtifactCommands', () => {
    let contextMock: Mock<vscode.ExtensionContext>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let fabricEnvironmentProviderMock: Mock<IFabricEnvironmentProvider>;
    let artifactManagerMock: Mock<IArtifactManagerInternal>;
    let dataProviderMock: Mock<FabricWorkspaceDataProvider>;
    let extensionManagerMock: Mock<IFabricExtensionManagerInternal>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let loggerMock: Mock<ILogger>;
    let itemDefinitionWriterMock: Mock<IItemDefinitionWriter>;

    let registerCommandStub: sinon.SinonStub;
    let originalRegisterCommand: typeof vscode.commands.registerCommand;
    let disposeSpy: sinon.SinonSpy;

    beforeEach(() => {
        contextMock = new Mock<vscode.ExtensionContext>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        fabricEnvironmentProviderMock = new Mock<IFabricEnvironmentProvider>();
        artifactManagerMock = new Mock<IArtifactManagerInternal>();
        dataProviderMock = new Mock<FabricWorkspaceDataProvider>();
        extensionManagerMock = new Mock<IFabricExtensionManagerInternal>();
        telemetryServiceMock = new Mock<TelemetryService>();
        loggerMock = new Mock<ILogger>();
        itemDefinitionWriterMock = new Mock<IItemDefinitionWriter>();

        contextMock.setup(x => x.subscriptions).returns([]);

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
        { name: 'vscode-fabric.createArtifact' },
        { name: 'vscode-fabric.readArtifact' },
        { name: 'vscode-fabric.renameArtifact' },
        { name: 'vscode-fabric.deleteArtifact' },
        { name: 'vscode-fabric.openArtifact' },
        { name: 'vscode-fabric.exportArtifact' },
        { name: 'vscode-fabric.refreshArtifactView' },
        { name: 'vscode-fabric.openInPortal' },        
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
            'vscode-fabric.createArtifact',
            'vscode-fabric.readArtifact',
            'vscode-fabric.renameArtifact',
            'vscode-fabric.deleteArtifact',
            'vscode-fabric.exportArtifact',
            'vscode-fabric.openArtifact',
            'vscode-fabric.refreshArtifactView',
            'vscode-fabric.openInPortal',
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
        assert.strictEqual(disposeSpy.callCount, 8, 'dispose should be called for each registered command');
    });

    describe('Execute callbacks', () => {
        const artifact = { id: 'test-artifact-id', type: 'test-artifact-type', displayName: 'TestArtifactDisplayName', workspaceId: 'test-workspace-id' } as IArtifact;
        const artifactTreeNode = { artifact } as ArtifactTreeNode;
        let capturedTelemetryProps: any = undefined;

        beforeEach(() => {
            fabricEnvironmentProviderMock.setup(x => x.getCurrent())
                .returns({ sharedUri: 'https://test.fabric', env: 'test-env' } as any);

            workspaceManagerMock.setup(x => x.currentWorkspace).returns({ objectId: 'test-workspace-id', displayName: 'TestWorkspaceDisplayName' } as IWorkspace);

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
                commandName: commandNames.createArtifact,
                modulePath: '../../../artifactManager/createArtifactCommand',
                stubName: 'createArtifactCommand',
                telemetryEvent: 'item/create',
                specialCase: true
            },
            {
                commandName: 'vscode-fabric.readArtifact',
                modulePath: '../../../artifactManager/readArtifactCommand',
                stubName: 'readArtifactCommand',
                telemetryEvent: 'item/read'
            },
            {
                commandName: 'vscode-fabric.renameArtifact',
                modulePath: '../../../artifactManager/renameArtifactCommand',
                stubName: 'renameArtifactCommand',
                telemetryEvent: 'item/update'
            },
            {
                commandName: 'vscode-fabric.deleteArtifact',
                modulePath: '../../../artifactManager/deleteArtifactCommand',
                stubName: 'deleteArtifactCommand',
                telemetryEvent: 'item/delete'
            },
            {
                commandName: 'vscode-fabric.exportArtifact',
                modulePath: '../../../artifactManager/exportArtifactCommand',
                stubName: 'exportArtifactCommand',
                telemetryEvent: 'item/export'
            },
        ].forEach(({ commandName, modulePath, stubName, telemetryEvent, specialCase }) => {
            it(`executes ${stubName}`, async () => {
                // Arrange
                const commandModule = await import(modulePath);
                const commandStub = sinon.stub().resolves();
                sinon.replace(commandModule, stubName, commandStub);

                let promptStub: sinon.SinonStub | undefined;
                let promptResult: any;
                if (specialCase) {
                    promptResult = { type: 'test-artifact-type', name: 'TestArtifactDisplayName' };
                    promptStub = sinon.stub().resolves(promptResult);
                    sinon.replace(commandModule, 'promptForArtifactTypeAndName', promptStub);

                    artifactManagerMock.setup(x => x.shouldUseDeprecatedCommand(It.IsAny(), It.IsAny())).returns(false);

                    extensionManagerMock.setup(x => x.getArtifactHandler(It.IsAny())).returns(undefined);

                    workspaceManagerMock.setup(x => x.isConnected()).returns(Promise.resolve(true));
                }

                // Act
                await act();

                const registration = registerCommandStub.getCalls().find(call => call.args[0] === commandName);
                assert.ok(registration, `${commandName} command should be registered`);
                const callback = registration.args[1];

                if (specialCase) {
                    await callback();
                }
                else {
                    await callback(artifactTreeNode);
                }

                // Assert
                assert.strictEqual(commandStub.calledOnce, true, `${stubName} should be called once`);
                if (specialCase) {
                    const [artifactManagerArg, extensionManagerArg, artifactArg] = commandStub.firstCall.args;
                    assert.strictEqual(artifactManagerArg, artifactManagerMock.object(), 'artifactManager should be passed');
                    assert.strictEqual(extensionManagerArg, extensionManagerMock.object(), 'extensionManager should be passed');
                    assert.ok(artifactArg, 'artifact should be passed');
                    assert.strictEqual(artifactArg.type, promptResult.type, 'artifact type should match');
                    assert.strictEqual(artifactArg.displayName, promptResult.name, 'artifact name should match');
                    assert.strictEqual(artifactArg.workspaceId, 'test-workspace-id', 'artifact workspaceId should match');
                    assert.strictEqual(artifactArg.fabricEnvironment, 'test-env', 'artifact fabricEnvironment should match');
                    assert.strictEqual(promptStub!.calledOnce, true, 'promptForArtifactTypeAndName should be called once');
                }
                else {
                    const [artifactArg] = commandStub.firstCall.args;
                    assert.strictEqual(artifactArg, artifact, `${stubName} should be called with the correct artifact`);
                }
                verifyTelemetry(telemetryServiceMock, telemetryEvent, !!specialCase);
            });
        });


        [
            {
                commandName: 'vscode-fabric.readArtifact',
                modulePath: '../../../artifactManager/readArtifactCommand',
                stubName: 'readArtifactCommand',
                telemetryEvent: 'item/read'
            },
            {
                commandName: 'vscode-fabric.renameArtifact',
                modulePath: '../../../artifactManager/renameArtifactCommand',
                stubName: 'renameArtifactCommand',
                telemetryEvent: 'item/update'
            },
            {
                commandName: 'vscode-fabric.deleteArtifact',
                modulePath: '../../../artifactManager/deleteArtifactCommand',
                stubName: 'deleteArtifactCommand',
                telemetryEvent: 'item/delete'
            }
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
                await callback(artifactTreeNode);

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
                        await callback(artifactTreeNode);
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

        function verifyTelemetry(telemetryServiceMock: Mock<TelemetryService>, eventName: string, specialCase: boolean): void {
            telemetryServiceMock.verify(
                x => x.sendTelemetryEvent(eventName, It.IsAny(), It.IsAny()),
                Times.Once()
            );

            assert.ok(capturedTelemetryProps, 'Telemetry properties should be captured');
            assert.strictEqual(capturedTelemetryProps.succeeded, 'true', 'succeeded should match');
            assert.strictEqual(capturedTelemetryProps.endpoint, 'https://test.fabric', 'endpoint should match');
            assert.strictEqual(capturedTelemetryProps.workspaceId, 'test-workspace-id', 'workspaceId should match');
            assert.strictEqual(capturedTelemetryProps.artifactId, specialCase ? undefined : 'test-artifact-id', 'artifactId should match');
            assert.strictEqual(capturedTelemetryProps.fabricArtifactName, 'TestArtifactDisplayName', 'fabricArtifactName should match');
            assert.strictEqual(capturedTelemetryProps.fabricWorkspaceName, 'TestWorkspaceDisplayName', 'fabricWorkspaceName should match');
            assert.strictEqual(capturedTelemetryProps.itemType, 'test-artifact-type', 'itemType should match');
            assert.strictEqual(capturedTelemetryProps.result, 'Succeeded', 'result should match');
            assert.strictEqual(Object.keys(capturedTelemetryProps).length, specialCase ? 7 : 8, 'Telemetry properties key count should match');
        }
    });

    

    async function act(): Promise<void> {
        await registerArtifactCommands(
            contextMock.object(),
            workspaceManagerMock.object(),
            fabricEnvironmentProviderMock.object(),
            artifactManagerMock.object(),
            dataProviderMock.object(),
            extensionManagerMock.object(),
            telemetryServiceMock.object(),
            loggerMock.object(),
            itemDefinitionWriterMock.object()
        );
    }
    
});
