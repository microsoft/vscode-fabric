import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import { IApiClientResponse, IArtifactManager, IWorkspaceManager, IArtifact, IItemDefinition } from '@fabric/vscode-fabric-api';
import { FabricError, TelemetryActivity, UserCancelledError} from '@fabric/vscode-fabric-util';
import { exportArtifactCommand } from '../../../artifactManager/exportArtifactCommand';
import { CoreTelemetryEventNames } from '../../../TelemetryEventNames';
import { verifyAddOrUpdateProperties, verifyAddOrUpdatePropertiesNever } from '../../utilities/moqUtilities';
import { IItemDefinitionWriter } from '../../../itemDefinition/ItemDefinitionWriter';

const artifactDisplayName = 'Test Artifact';
const artifactId = 'Test Artifact Id';

describe('exportArtifactCommand', () => {
    const localFolder = vscode.Uri.file('/path/to/local/folder');
    const successDefinition = {
        definition: {
            parts: [
                {
                    path: 'notebook-content.py',
                    payload: 'IyBGYWJyaW',
                    payloadType: 'InlineBase64'
                },
                {
                    path: '.platform',
                    payload: 'ewogICIkc2N',
                    payloadType: 'InlineBase64'
                }
            ]
        }
    };

    const successResponse = {
        status: 200,
        parsedBody: successDefinition
    };
    
    let artifactManagerMock: Mock<IArtifactManager>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let artifactMock: Mock<IArtifact>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
    let itemDefinitionWriterMock: Mock<IItemDefinitionWriter>;

    let showInformationMessageStub: sinon.SinonStub;
    let executeCommandStub: sinon.SinonStub;

    beforeEach(() => {
        artifactManagerMock = new Mock<IArtifactManager>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        artifactMock = new Mock<IArtifact>();
        itemDefinitionWriterMock = new Mock<IItemDefinitionWriter>();

        artifactMock.setup(a => a.id).returns(artifactId);
        artifactMock.setup(a => a.displayName).returns(artifactDisplayName);

        artifactManagerMock.setup(am => am.getArtifactDefinition(It.IsAny()))
            .returns(Promise.resolve(successResponse));

        workspaceManagerMock.setup(wm => wm.getLocalFolderForArtifact(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(localFolder));

        itemDefinitionWriterMock.setup(writer => writer.save(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve());

        telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();
        telemetryActivityMock.setup(instance => instance.addOrUpdateProperties(It.IsAny()))
            .returns(undefined);

        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    });

    afterEach(() => {
        sinon.restore();
    });

    it('Export artifact successfully', async () => {
        // Arrange
        showInformationMessageStub.callsFake(async (msg, opts, ...items) => {
            assert.strictEqual(opts.modal, false, 'showInformationMessage modal');
            assert.strictEqual(msg, `Opened ${artifactDisplayName}`, 'showInformationMessage message');
        });

        // Act
        await executeCommand();

        // Assert
        workspaceManagerMock.verify(
            wm => wm.getLocalFolderForArtifact(
                It.Is(artifact => artifact === artifactMock.object()),
                It.IsAny()),
            Times.Once());
        artifactManagerMock.verify(
            am => am.getArtifactDefinition(
                It.Is(artifact => artifact === artifactMock.object())),
            Times.Once());
        itemDefinitionWriterMock.verify(
            writer => writer.save(
                It.Is<IItemDefinition>(definition => JSON.stringify(definition) === JSON.stringify(successDefinition.definition)),
                It.Is<vscode.Uri>(uri => uri === localFolder)
            ),
            Times.Once()
        );

        assert.strictEqual(showInformationMessageStub.callCount, 1, 'showInformationMessage call count');

        assert.ok(executeCommandStub.called, 'executeCommand should be called');
        assert.ok(executeCommandStub.calledWith('vscode.openFolder', localFolder));
        
        verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '200');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'requestId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'errorCode');
    });
            

    it('Cancel local folder selection', async () => {
        // Arrange
        workspaceManagerMock.setup(wm => wm.getLocalFolderForArtifact(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(undefined));

        // Act & Assert
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof UserCancelledError, 'Should throw a UserCancelledError');
                assert.ok(err.stepName, 'Should have a stepName');
                assert.strictEqual(err.stepName!, 'localFolderSelection', 'Step name');
                return true;
            } 
        );

        // Assert
        workspaceManagerMock.verify(wm => wm.getLocalFolderForArtifact(It.Is(artifact => artifact === artifactMock.object()), It.IsAny()), Times.Once());
        telemetryActivityMock.verify(instance => instance.addOrUpdateProperties(It.IsAny()), Times.Never());
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
        artifactManagerMock.setup(instance => instance.getArtifactDefinition(It.IsAny()))
            .returns(Promise.resolve(apiClientResponseMock.object()));
        
        // Act & Assert
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

        assert.ok(error!.message.includes('Error opening'), 'Error message should include "Error opening"');

        verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '400');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'requestId', 'req-12345');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'errorCode', 'InvalidInput');
    });
    
    it('Error: Writer Error', async () => {
        // Arrange
        const errorText = 'Test - Failed to delete local folder - Test';
        itemDefinitionWriterMock.setup(writer => writer.save(It.IsAny(), It.IsAny()))
            .throws(new Error(errorText));
        
        // Act & Assert
        let error: FabricError | undefined = undefined;
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof FabricError, 'Should throw a FabricError');
                error = err as FabricError;
                assert.ok(error!.message.includes(`Error opening ${artifactDisplayName}`), 'Error message should include display name');
                assert.strictEqual(error.options?.showInUserNotification, 'Information', 'Error options should show in user notification');
                return true;
            } 
        );

        workspaceManagerMock.verify(
            wm => wm.getLocalFolderForArtifact(
                It.Is(artifact => artifact === artifactMock.object()),
                It.IsAny()),
            Times.Once());
        artifactManagerMock.verify(
            am => am.getArtifactDefinition(
                It.Is(artifact => artifact === artifactMock.object())),
            Times.Once());
        itemDefinitionWriterMock.verify(
            writer => writer.save(
                It.Is<IItemDefinition>(definition => JSON.stringify(definition) === JSON.stringify(successDefinition.definition)),
                It.Is<vscode.Uri>(uri => uri === localFolder)
            ),
            Times.Once()
        );

        assert.ok(showInformationMessageStub.notCalled,'showInformationMessage should not be called');

        assert.ok(error!.message.includes(errorText), 'message should include errorText');
        
        verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '200');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'requestId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'errorCode');
    });

    async function executeCommand(): Promise<void> {
        await exportArtifactCommand(
            artifactMock.object(),
            workspaceManagerMock.object(),
            artifactManagerMock.object(),
            itemDefinitionWriterMock.object(),
            telemetryActivityMock.object()
        );
    }
});