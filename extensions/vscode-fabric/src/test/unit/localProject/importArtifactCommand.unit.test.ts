import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import { importArtifactCommand } from '../../../localProject/importArtifactCommand';
import { IArtifact, IWorkspaceManager, IArtifactManager, IWorkspace, IFabricApiClient, IApiClientResponse } from '@microsoft/vscode-fabric-api';
import { IItemDefinitionReader } from '../../../itemDefinition/ItemDefinitionReader';
import { IFabricEnvironmentProvider, FabricError, TelemetryActivity, UserCancelledError } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../../../TelemetryEventNames';
import { verifyAddOrUpdateProperties, verifyAddOrUpdatePropertiesNever } from '../../utilities/moqUtilities';
import { FabricWorkspaceDataProvider } from '../../../workspace/treeView';

// Import the modules to stub
import * as quickPick from '../../../ui/showWorkspaceQuickPick';
import * as prompts from '../../../ui/prompts';
import { ICapacityManager } from '../../../CapacityManager';

const artifactDisplayName = 'Test Artifact DisplayName';
const artifactType = 'Test Artifact Type';

describe('importArtifactCommand', () => {
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let artifactManagerMock: Mock<IArtifactManager>;
    let capacityManagerMock: Mock<ICapacityManager>;
    let readerMock: Mock<IItemDefinitionReader>;
    let fabricEnvironmentProviderMock: Mock<IFabricEnvironmentProvider>;
    let dataProviderMock: Mock<FabricWorkspaceDataProvider>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
    let telemetryService: any;
    let logger: any;

    let showWorkspaceQuickPickStub: sinon.SinonStub;
    let showSignInPromptStub: sinon.SinonStub;

    const folderUri = vscode.Uri.file(`/path/to/local/folder/${artifactDisplayName}.${artifactType}`);
    const fakeWorkspace: IWorkspace = { displayName: 'ws', type: 'test', objectId: 'id' } as IWorkspace;
    const fakeArtifact: IArtifact = { type: artifactType, displayName: artifactDisplayName } as IArtifact;
    const fakeDefinition = { parts: [] };

    beforeEach(() => {
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        artifactManagerMock = new Mock<IArtifactManager>();
        capacityManagerMock = new Mock<ICapacityManager>();
        readerMock = new Mock<IItemDefinitionReader>();
        fabricEnvironmentProviderMock = new Mock<IFabricEnvironmentProvider>();
        dataProviderMock = new Mock<FabricWorkspaceDataProvider>();
        telemetryService = {};
        logger = {};

        artifactManagerMock
            .setup(m => m.listArtifacts(It.IsAny()))
            .returnsAsync([fakeArtifact]);
        artifactManagerMock
            .setup(a => a.updateArtifactDefinition(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve({ status: 200 } as IApiClientResponse));
        artifactManagerMock
            .setup(a => a.createArtifactWithDefinition(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve({ status: 201 } as IApiClientResponse));

        workspaceManagerMock
            .setup(m => m.isConnected())
            .returnsAsync(true);
        workspaceManagerMock
            .setup(m => m.currentWorkspace)
            .returns(undefined);

        readerMock
            .setup(r => r.read(It.IsAny()))
            .returnsAsync(fakeDefinition);

        dataProviderMock
            .setup(x => x.refresh())
            .returns(undefined);

        fabricEnvironmentProviderMock
            .setup(x => x.getCurrent())
            .returns({ sharedUri: 'https://test.fabric', env: 'test-env' } as any);

        telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();
        telemetryActivityMock.setup(instance => instance.addOrUpdateProperties(It.IsAny()))
            .returns(undefined);

        // Stub showSelectWorkspaceQuickPick
        showWorkspaceQuickPickStub = sinon.stub(quickPick, 'showWorkspaceQuickPick');
        showWorkspaceQuickPickStub.resolves(fakeWorkspace);

        showSignInPromptStub = sinon.stub(prompts, 'showSignInPrompt');
    });

    afterEach(() => {
        sinon.restore();
    });

    it('Import artifact successfully', async () => {
        // Arrange

        // Act
        await executeCommand();

        // Assert
        assert.ok(showWorkspaceQuickPickStub.calledOnce, 'showWorkspaceQuickPick should be called');
        artifactManagerMock.verify(a => a.updateArtifactDefinition(fakeArtifact, fakeDefinition));
        dataProviderMock.verify(x => x.refresh(), Times.Never());

        verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '200');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'itemType', artifactType);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'workspaceId', fakeWorkspace.objectId);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'fabricWorkspaceName', fakeWorkspace.displayName);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'artifactId', fakeArtifact.id);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'fabricArtifactName', artifactDisplayName);
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'requestId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'errorCode');
    });

    it('Import creates artifact', async () => {
        // Arrange
        artifactManagerMock
            .setup(m => m.listArtifacts(It.IsAny()))
            .returnsAsync([]);

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(
            a => a.createArtifactWithDefinition(
                It.Is<IArtifact>(obj =>
                    obj.workspaceId === fakeWorkspace.objectId &&
                    obj.type === artifactType &&
                    obj.displayName === artifactDisplayName
                ),
                fakeDefinition
            ),
            Times.Once()
        );
        artifactManagerMock.verify(a => a.updateArtifactDefinition(It.IsAny(), It.IsAny()), Times.Never());
        dataProviderMock.verify(x => x.refresh(), Times.Never());
        assert.ok(showWorkspaceQuickPickStub.calledOnce, 'showWorkspaceQuickPick should be called');
    });

    it('Import creates artifact in current workspace', async () => {
        // Arrange
        artifactManagerMock
            .setup(m => m.listArtifacts(It.IsAny()))
            .returnsAsync([]);

        workspaceManagerMock
            .setup(m => m.currentWorkspace)
            .returns(fakeWorkspace);

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(
            a => a.createArtifactWithDefinition(
                It.Is<IArtifact>(obj =>
                    obj.workspaceId === fakeWorkspace.objectId &&
                    obj.type === artifactType &&
                    obj.displayName === artifactDisplayName
                ),
                fakeDefinition
            ),
            Times.Once()
        );
        artifactManagerMock.verify(a => a.updateArtifactDefinition(It.IsAny(), It.IsAny()), Times.Never());
        dataProviderMock.verify(x => x.refresh(), Times.Once());
        assert.ok(showWorkspaceQuickPickStub.calledOnce, 'showWorkspaceQuickPick should be called');
    });

    it('User is not signed in', async () => {
        // Arrange
        workspaceManagerMock
            .setup(m => m.isConnected())
            .returnsAsync(false);

        // Act
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof UserCancelledError, 'Should throw a UserCancelledError');
                assert.ok(err.stepName, 'Should have a stepName');
                assert.strictEqual(err.stepName!, 'signIn', 'Step name');
                return true;
            }
        );

        // Assert
        assert.ok(showSignInPromptStub.calledOnce, 'showSignInPrompt should be called');

        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'itemType');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'statusCode');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'workspaceId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'fabricWorkspaceName');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'artifactId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'fabricArtifactName');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'requestId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'errorCode');
    });

    it('Cancel workspace selection', async () => {
        // Arrange
        showWorkspaceQuickPickStub.resolves(undefined);

        // Act
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof UserCancelledError, 'Should throw a UserCancelledError');
                assert.ok(err.stepName, 'Should have a stepName');
                assert.strictEqual(err.stepName!, 'selectWorkspace', 'Step name');
                return true;
            }
        );

        // Assert
        verifyAddOrUpdateProperties(telemetryActivityMock, 'itemType', artifactType);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'fabricArtifactName', artifactDisplayName);
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'statusCode');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'workspaceId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'fabricWorkspaceName');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'artifactId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'requestId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'errorCode');
    });

    it('Error: unable to parse source folder name', async () => {
        // Arrange
        // Patch tryParseLocalProjectData to return undefined
        const importArtifactModule = await import('../../../localProject/utilities');
        const origTryParse = importArtifactModule.tryParseLocalProjectData;
        importArtifactModule.tryParseLocalProjectData = async () => undefined;

        // Act
        let error: FabricError | undefined = undefined;
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof FabricError, 'Should throw a FabricError');
                error = err;
                assert.ok(error!.message.includes('No valid Fabric project data found'), 'Error message should include display name');
                assert.strictEqual(error.options?.showInUserNotification, 'Information', 'Error options should show in user notification');
                return true;
            }
        );

        // Assert
        importArtifactModule.tryParseLocalProjectData = origTryParse;
    });

    it('Error: API Error', async () => {
        // Arrange
        const apiClientResponseMock = new Mock<IApiClientResponse>();
        const errorResponseBody = {
            errorCode: 'InvalidInput',
            message: 'The input was invalid',
            requestId: 'req-12345',
        };
        apiClientResponseMock.setup(instance => instance.status).returns(400);
        apiClientResponseMock.setup(instance => instance.parsedBody).returns(errorResponseBody);
        artifactManagerMock.setup(instance => instance.updateArtifactDefinition(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(apiClientResponseMock.object()));

        // Act
        let error: Error | undefined = undefined;
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof FabricError, 'Should throw a FabricError');
                error = err;
                return true;
            } 
        );

        // Assert
        assert.ok(error!.message.includes('Error publishing'), 'Error message should include "Error publishing"');

        verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '400');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'requestId', 'req-12345');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'errorCode', 'InvalidInput');
    });
    
    it('Error: reader.read throws an exception', async () => {
        // Arrange
        const errorText = 'Test - reader.read failed';
        readerMock
            .setup(r => r.read(It.IsAny()))
            .throws(new Error(errorText));

        // Act
        let error: FabricError | undefined = undefined;
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof FabricError, 'Should throw a FabricError');
                error = err as FabricError;
                assert.ok(error!.message.includes(`Error reading item definition from ${folderUri.fsPath}`), 'Error message should include path');
                assert.ok(error!.message.includes(errorText), 'Error message should include errorText');
                assert.strictEqual(error.options?.showInUserNotification, 'Information', 'Error options should show in user notification');
                return true;
            } 
        );

        // Assert
        artifactManagerMock.verify(a => a.updateArtifactDefinition(It.IsAny(), It.IsAny()), Times.Never());
    });

    async function executeCommand(): Promise<void> {
        await importArtifactCommand(
            folderUri,
            workspaceManagerMock.object(),
            artifactManagerMock.object(),
            capacityManagerMock.object(),
            readerMock.object(),
            fabricEnvironmentProviderMock.object(),
            dataProviderMock.object(),
            telemetryActivityMock.object(),
            telemetryService,
            logger
        );
    }
});