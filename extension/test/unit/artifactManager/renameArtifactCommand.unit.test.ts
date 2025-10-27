// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import { IArtifactManager, IArtifact, IApiClientResponse } from '@microsoft/vscode-fabric-api';
import { FabricError, TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { renameArtifactCommand } from '../../../src/artifactManager/renameArtifactCommand';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { FabricWorkspaceDataProvider } from '../../../src/workspace/treeView';
import { verifyAddOrUpdateProperties, verifyAddOrUpdatePropertiesNever } from '../../utilities/moqUtilities';
import { UserCancelledError } from '@microsoft/vscode-fabric-util';

describe('renameArtifactCommand', () => {
    let artifactManagerMock: Mock<IArtifactManager>;
    let artifactMock: Mock<IArtifact>;
    let apiClientResponseMock: Mock<IApiClientResponse>;
    let dataProviderMock: Mock<FabricWorkspaceDataProvider>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;

    let showInputBoxStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;

    let originalName: string = 'Item 1';
    let fakeResponseBody = { displayName: 'Item 1', description: 'Item 1 description' };

    beforeEach(() => {
        artifactMock = new Mock<IArtifact>();
        artifactMock.setup(instance => instance.displayName).returns(originalName);

        apiClientResponseMock = new Mock<IApiClientResponse>();
        apiClientResponseMock.setup(instance => instance.status).returns(200);
        apiClientResponseMock.setup(instance => instance.bodyAsText).returns(JSON.stringify(fakeResponseBody));

        artifactManagerMock = new Mock<IArtifactManager>();
        artifactManagerMock.setup(instance => instance.updateArtifact(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(apiClientResponseMock.object()));

        dataProviderMock = new Mock<FabricWorkspaceDataProvider>();
        dataProviderMock.setup(instance => instance.refresh())
            .returns(undefined);

        telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();
        telemetryActivityMock.setup(instance => instance.addOrUpdateProperties(It.IsAny()))
            .returns(undefined);

        showInputBoxStub = sinon.stub(vscode.window, 'showInputBox');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    });

    afterEach(() => {
        sinon.restore();
    });

    it('Rename artifact', async () => {
        // Arrange
        const newName = 'Renamed Artifact';
        showInputBoxStub.resolves(newName);

        showInformationMessageStub.onFirstCall().callsFake(async (msg, opts, ...items) => {
            assert.strictEqual(opts.modal, false);
            assert.ok(msg.includes(`Renamed '${originalName}' to '${newName}'`));
            assert.strictEqual(items.length, 0);
            return undefined;
        });

        // Act
        await executeCommand();

        // Assert
        assert.strictEqual(showInputBoxStub.calledOnce, true, 'User should be prompted to enter a new name');

        artifactManagerMock.verify(
            instance => instance.updateArtifact(It.IsAny(), It.IsAny()),
            Times.Once()
        );
        artifactManagerMock.verify(
            instance => instance.updateArtifact(
                artifactMock.object(),
                It.Is<Map<string, string>>(map =>
                    map.size === 1 &&
                    map.has('displayName') &&
                    map.get('displayName') === newName
                )
            ),
            Times.Once()
        );

        assert.strictEqual(showInformationMessageStub.calledOnce, true, 'showInformationMessage should be called on success');

        dataProviderMock.verify(
            instance => instance.refresh(),
            Times.Once()
        );

        verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '200');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'requestId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'errorCode');
    });

    [
        { newName: undefined },
        { newName: originalName },
    ].forEach(({ newName }) => {
        it(`Skip rename: user enters '${newName}'`, async () => {
            // Arrange
            showInputBoxStub.resolves(newName);

            // Act
            await assert.rejects(
                async () => {
                    await executeCommand();
                },
                (err: Error) => {
                    assert.ok(err instanceof UserCancelledError, 'Should throw a UserCancelledError');
                    return true;
                }
            );

            // Assert
            assert.strictEqual(showInputBoxStub.calledOnce, true, 'User should be prompted to enter a new name');

            artifactManagerMock.verify(
                instance => instance.updateArtifact(It.IsAny(), It.IsAny()),
                Times.Never()
            );

            assert.strictEqual(showInformationMessageStub.notCalled, true, 'showInformationMessage should be called on success');

            dataProviderMock.verify(
                instance => instance.refresh(),
                Times.Never()
            );
        });
    });

    it('Error handling', async () => {
        // Arrange
        const errorResponseBody = {
            errorCode: 'InvalidInput',
            message: 'The input was invalid',
            requestId: 'req-12345',
        };
        apiClientResponseMock.setup(instance => instance.status).returns(400);
        apiClientResponseMock.setup(instance => instance.parsedBody).returns(errorResponseBody);
        artifactManagerMock.setup(instance => instance.updateArtifact(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(apiClientResponseMock.object()));

        showInputBoxStub.resolves('Some New Name');

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

        dataProviderMock.verify(
            instance => instance.refresh(),
            Times.Never()
        );

        assert.ok(error!.message.includes('Error renaming'), 'Error message should include "Error renaming"');

        verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '400');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'requestId', 'req-12345');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'errorCode', 'InvalidInput');
    });

    async function executeCommand(): Promise<void> {
        await renameArtifactCommand(
            artifactMock.object(),
            artifactManagerMock.object(),
            dataProviderMock.object(),
            telemetryActivityMock.object()
        );
    }

});
