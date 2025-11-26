// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import { registerArtifactCommands } from '../../../src/artifactManager/commands';
import { commandNames } from '../../../src/constants';
import { ArtifactTreeNode, IWorkspaceManager, IArtifact, IWorkspace } from '@microsoft/vscode-fabric-api';
import { FabricWorkspaceDataProvider } from '../../../src/workspace/treeView';
import { IArtifactManagerInternal, IFabricExtensionManagerInternal } from '../../../src/apis/internal/fabricExtensionInternal';
import { TelemetryService, TelemetryActivity, IFabricEnvironmentProvider, ILogger, IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { UserCancelledError } from '@microsoft/vscode-fabric-util';
import { IItemDefinitionWriter } from '../../../src/itemDefinition/ItemDefinitionWriter';
import { ICapacityManager } from '../../../src/CapacityManager';
import { IWorkspaceFilterManager } from '../../../src/workspace/WorkspaceFilterManager';
import { ILocalFolderService } from '../../../src/LocalFolderService';
import { IAccountProvider } from '../../../src/authentication';

describe('registerArtifactCommands', () => {
    let contextMock: Mock<vscode.ExtensionContext>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let fabricEnvironmentProviderMock: Mock<IFabricEnvironmentProvider>;
    let artifactManagerMock: Mock<IArtifactManagerInternal>;
    let localFolderServiceMock: Mock<ILocalFolderService>;
    let configurationProviderMock: Mock<IConfigurationProvider>;
    let dataProviderMock: Mock<FabricWorkspaceDataProvider>;
    let extensionManagerMock: Mock<IFabricExtensionManagerInternal>;
    let capacityManagerMock: Mock<ICapacityManager>;
    let workspaceFilterManagerMock: Mock<IWorkspaceFilterManager>;
    let accountProviderMock: Mock<IAccountProvider>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let loggerMock: Mock<ILogger>;
    let itemDefinitionWriterMock: Mock<IItemDefinitionWriter>;

    let registerCommandStub: sinon.SinonStub;
    let originalRegisterCommand: typeof vscode.commands.registerCommand;
    let disposeSpy: sinon.SinonSpy;

    const expectedCommands: string[] = [
        'vscode-fabric.changeLocalFolder',
        'vscode-fabric.createArtifact',
        'vscode-fabric.deleteArtifact',
        'vscode-fabric.exportArtifact',
        'vscode-fabric.openArtifact',
        'vscode-fabric.openInPortal',
        'vscode-fabric.openLocalFolder',
        'vscode-fabric.readArtifact',
        'vscode-fabric.refreshArtifactView',
        'vscode-fabric.renameArtifact',
    ];

    beforeEach(() => {
        contextMock = new Mock<vscode.ExtensionContext>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        fabricEnvironmentProviderMock = new Mock<IFabricEnvironmentProvider>();
        artifactManagerMock = new Mock<IArtifactManagerInternal>();
        localFolderServiceMock = new Mock<ILocalFolderService>();
        configurationProviderMock = new Mock<IConfigurationProvider>();
        dataProviderMock = new Mock<FabricWorkspaceDataProvider>();
        extensionManagerMock = new Mock<IFabricExtensionManagerInternal>();
        capacityManagerMock = new Mock<ICapacityManager>();
        workspaceFilterManagerMock = new Mock<IWorkspaceFilterManager>();
        accountProviderMock = new Mock<IAccountProvider>();
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

    it('commands are registered', async () => {
        await act();

        assert.strictEqual(registerCommandStub.callCount, expectedCommands.length, 'total command registrations');
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
        assert.strictEqual(disposeSpy.callCount, expectedCommands.length, 'dispose should be called for each registered command');
    });

    describe('Execute callbacks', () => {
        const artifact = { id: 'test-artifact-id', type: 'test-artifact-type', displayName: 'TestArtifactDisplayName', workspaceId: 'test-workspace-id' } as IArtifact;
        const artifactTreeNode = { artifact } as ArtifactTreeNode;
        let capturedTelemetryProps: any = undefined;

        beforeEach(() => {
            fabricEnvironmentProviderMock.setup(x => x.getCurrent())
                .returns({ sharedUri: 'https://test.fabric', env: 'test-env' } as any);

            // Set up workspace for telemetry
            const testWorkspace = { objectId: 'test-workspace-id', displayName: 'TestWorkspaceDisplayName' } as IWorkspace;
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
                commandName: commandNames.createArtifact,
                modulePath: '../../../src/artifactManager/createArtifactCommand',
                stubName: 'createArtifactCommand',
                telemetryEvent: 'item/create',
                specialCase: true,
            },
            {
                commandName: 'vscode-fabric.readArtifact',
                modulePath: '../../../src/artifactManager/readArtifactCommand',
                stubName: 'readArtifactCommand',
                telemetryEvent: 'item/read',
            },
            {
                commandName: 'vscode-fabric.renameArtifact',
                modulePath: '../../../src/artifactManager/renameArtifactCommand',
                stubName: 'renameArtifactCommand',
                telemetryEvent: 'item/update',
            },
            {
                commandName: 'vscode-fabric.deleteArtifact',
                modulePath: '../../../src/artifactManager/deleteArtifactCommand',
                stubName: 'deleteArtifactCommand',
                telemetryEvent: 'item/delete',
            },
            {
                commandName: 'vscode-fabric.exportArtifact',
                modulePath: '../../../src/artifactManager/exportArtifactCommand',
                stubName: 'exportArtifactCommand',
                telemetryEvent: 'item/export',
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
                    promptResult = { type: 'test-artifact-type', name: 'TestArtifactDisplayName', workspaceId: 'test-workspace-id' };
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
                modulePath: '../../../src/artifactManager/readArtifactCommand',
                stubName: 'readArtifactCommand',
                telemetryEvent: 'item/read',
            },
            {
                commandName: 'vscode-fabric.renameArtifact',
                modulePath: '../../../src/artifactManager/renameArtifactCommand',
                stubName: 'renameArtifactCommand',
                telemetryEvent: 'item/update',
            },
            {
                commandName: 'vscode-fabric.deleteArtifact',
                modulePath: '../../../src/artifactManager/deleteArtifactCommand',
                stubName: 'deleteArtifactCommand',
                telemetryEvent: 'item/delete',
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

        describe('exportArtifact command (UriHandler scenario)', () => {
            let artifactId = 'A1B2C3D4-E5F6-7890-1234-56789ABCDEF0';
            let workspaceId = 'B1C2D3E4-F5A6-7890-1234-56789ABCDEF1';
            let environment = 'DEV';

            let commandCallback: any;
            let exportArtifactCommandStub: sinon.SinonStub;

            beforeEach(async () => {
                loggerMock
                    .setup(l => l.reportExceptionTelemetryAndLog(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()))
                    .returns();
                loggerMock
                    .setup(l => l.reportExceptionTelemetryAndLog(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()))
                    .returns();

                const artifact = { id: artifactId, type: 'test-type', displayName: 'TestArtifact', workspaceId } as IArtifact;
                workspaceManagerMock
                    .setup(x => x.getItemsInWorkspace(workspaceId))
                    .returns(Promise.resolve([artifact]));
                accountProviderMock
                    .setup(x => x.isSignedIn())
                    .returns(Promise.resolve(true));
                fabricEnvironmentProviderMock
                    .setup(x => x.switchToEnvironment(environment))
                    .returns(Promise.resolve(true));

                // Create a stub for the exportArtifactCommand function
                exportArtifactCommandStub = sinon.stub().resolves();
                const exportArtifactCommandModule = require('../../../src/artifactManager/exportArtifactCommand');
                sinon.replace(exportArtifactCommandModule, 'exportArtifactCommand', exportArtifactCommandStub);

                // Get the command handler for the vscode-fabric.exportArtifact command
                await act();
                const registration = registerCommandStub.getCalls().find(call => call.args[0] === 'vscode-fabric.exportArtifact');
                assert.ok(registration, 'exportArtifact command should be registered');
                commandCallback = registration.args[1];
            });

            it('executes exportArtifact with artifactId/workspaceId', async () => {
                // Act
                await commandCallback({ artifactId, workspaceId });

                // Assert
                assert(exportArtifactCommandStub.calledOnce, 'exportArtifactCommand should be called');
                fabricEnvironmentProviderMock.verify(x => x.switchToEnvironment(It.IsAny()), Times.Never());
                const [calledArtifact] = exportArtifactCommandStub.firstCall.args;
                assert.strictEqual(calledArtifact.id, artifactId, 'artifact id should match');
                assert.strictEqual(calledArtifact.workspaceId, workspaceId, 'workspace id should match');
                assert.strictEqual(calledArtifact.displayName, 'TestArtifact', 'artifact displayName should match');
            });

            it('executes exportArtifact with artifactId/workspaceId/environment', async () => {
                // Act
                await commandCallback({ artifactId, workspaceId, environment });

                // Assert
                assert(exportArtifactCommandStub.calledOnce, 'exportArtifactCommand should be called');
                fabricEnvironmentProviderMock.verify(x => x.switchToEnvironment(It.IsAny()), Times.Once());
                const [calledArtifact] = exportArtifactCommandStub.firstCall.args;
                assert.strictEqual(calledArtifact.id, artifactId, 'artifact id should match');
                assert.strictEqual(calledArtifact.workspaceId, workspaceId, 'workspace id should match');
                assert.strictEqual(calledArtifact.displayName, 'TestArtifact', 'artifact displayName should match');
            });

            it('logs error if artifactId is not a valid GUID', async () => {
                // Arrange
                const invalidArtifactId = 'not-a-guid';

                // Act
                const result = await commandCallback({ artifactId: invalidArtifactId, workspaceId, environment });

                // Assert
                assert(exportArtifactCommandStub.notCalled, 'exportArtifactCommand should not be called');
                loggerMock.verify(l => l.reportExceptionTelemetryAndLog(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()), Times.Once());
                assert.strictEqual(result, undefined, 'Should return undefined for invalid artifactId');
            });

            it('logs error if workspaceId is not a valid GUID', async () => {
                // Arrange
                const invalidWorkspaceId = 'not-a-guid';

                // Act
                const result = await commandCallback({ artifactId, workspaceId: invalidWorkspaceId, environment });

                // Assert
                assert(exportArtifactCommandStub.notCalled, 'exportArtifactCommand should not be called');
                loggerMock.verify(l => l.reportExceptionTelemetryAndLog(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()), Times.Once());
                assert.strictEqual(result, undefined, 'Should return undefined for invalid workspaceId');
            });

            it('logs error if not signed in', async () => {
                // Arrange
                accountProviderMock
                    .setup(x => x.isSignedIn())
                    .returns(Promise.resolve(false));
                accountProviderMock
                    .setup(x => x.awaitSignIn())
                    .returns(Promise.resolve());

                // Act
                const result = await commandCallback({ artifactId, workspaceId, environment });

                // Assert
                assert(exportArtifactCommandStub.notCalled, 'exportArtifactCommand should not be called');
                loggerMock.verify(l => l.reportExceptionTelemetryAndLog(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()), Times.Once());
                assert.strictEqual(result, undefined, 'Should return undefined when not signed in');
            });

            it('logs error if environment switch fails', async () => {
                // Arrange
                environment = 'INVALID';
                fabricEnvironmentProviderMock.setup(x => x.switchToEnvironment(environment)).returns(Promise.resolve(false));

                // Act
                const result = await commandCallback({ artifactId, workspaceId, environment });

                // Assert
                assert(exportArtifactCommandStub.notCalled, 'exportArtifactCommand should not be called');
                assert.strictEqual(result, undefined, 'Should return undefined when environment switch fails');
                loggerMock.verify(l => l.reportExceptionTelemetryAndLog(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()), Times.Once());
            });

            it('logs error if artifact cannot be found', async () => {
                // Arrange
                workspaceManagerMock.setup(x => x.getItemsInWorkspace(workspaceId)).returns(Promise.resolve([]));

                // Act
                const result = await commandCallback({ artifactId, workspaceId, environment });

                // Assert
                assert(exportArtifactCommandStub.notCalled, 'exportArtifactCommand should not be called');
                assert.strictEqual(result, undefined, 'Should return undefined when artifact cannot be found');
                loggerMock.verify(l => l.reportExceptionTelemetryAndLog(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()), Times.Once());
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
            assert.strictEqual(capturedTelemetryProps.itemType, 'test-artifact-type', 'itemType should match');
            assert.strictEqual(capturedTelemetryProps.result, 'Succeeded', 'result should match');
            assert.strictEqual(Object.keys(capturedTelemetryProps).length, specialCase ? 6 : 7, 'Telemetry properties key count should match');
        }
    });

    async function act(): Promise<void> {
        await registerArtifactCommands(
            contextMock.object(),
            workspaceManagerMock.object(),
            fabricEnvironmentProviderMock.object(),
            artifactManagerMock.object(),
            localFolderServiceMock.object(),
            configurationProviderMock.object(),
            dataProviderMock.object(),
            extensionManagerMock.object(),
            workspaceFilterManagerMock.object(),
            capacityManagerMock.object(),
            accountProviderMock.object(),
            telemetryServiceMock.object(),
            loggerMock.object()
        );
    }

});
