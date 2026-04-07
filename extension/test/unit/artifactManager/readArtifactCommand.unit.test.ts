// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import { readArtifactCommand } from '../../../src/artifactManager/readArtifactCommand';
import { IArtifact, IApiClientResponse, IArtifactManager, Schema } from '@microsoft/vscode-fabric-api';
import { FabricError, TelemetryActivity } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { verifyAddOrUpdateProperties, verifyAddOrUpdatePropertiesNever } from '../../utilities/moqUtilities';

describe('readArtifactCommand', () => {
    let artifactManagerMock: Mock<IArtifactManager>;
    let artifactMock: Mock<IArtifact>;
    let textDocumentMock: Mock<vscode.TextDocument>;
    let apiClientResponseMock: Mock<IApiClientResponse>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;

    let fakeResponseBody = { displayName: 'Item 1', description: 'Item 1 description' };

    let openTextDocumentStub: sinon.SinonStub;
    let showTextDocumentStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;

    beforeEach(() => {
        artifactMock = new Mock<IArtifact>();
        artifactMock.setup(instance => instance.displayName).returns('Item 1');

        apiClientResponseMock = new Mock<IApiClientResponse>();
        apiClientResponseMock.setup(instance => instance.status).returns(200);
        apiClientResponseMock.setup(instance => instance.bodyAsText).returns(JSON.stringify(fakeResponseBody));

        artifactManagerMock = new Mock<IArtifactManager>();
        artifactManagerMock.setup(instance => instance.getArtifact(It.IsAny()))
            .returns(Promise.resolve(apiClientResponseMock.object()));

        telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();
        telemetryActivityMock.setup(instance => instance.addOrUpdateProperties(It.IsAny()))
            .returns(undefined);

        textDocumentMock = new Mock<vscode.TextDocument>();
        openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument').resolves(textDocumentMock.object());
        showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves({} as vscode.TextEditor);
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    });

    afterEach(() => {
        sinon.restore();
    });

    it('Read data', async () => {
        // Arrange

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(
            instance => instance.getArtifact(
                It.Is<IArtifact>(a => a === artifactMock.object())
            ),
            Times.Once()
        );

        assert.strictEqual(openTextDocumentStub.calledOnce, true, 'openTextDocument should be called once');
        const uriPassedToOpen = openTextDocumentStub.getCall(0).args[0];
        assert.strictEqual(uriPassedToOpen.scheme, Schema.fabricVirtualDoc, 'openTextDocument should be called with the correct scheme');
        assert.strictEqual(uriPassedToOpen.path, '/Item 1.json', 'openTextDocument should be called with the correct path');
        assert.strictEqual(uriPassedToOpen.query, `content=${JSON.stringify(fakeResponseBody)}`, 'openTextDocument should be called with the correct query');

        assert.strictEqual(showTextDocumentStub.calledOnce, true, 'showTextDocument should be called once');
        const docPassedToShow = showTextDocumentStub.getCall(0).args[0];
        assert.strictEqual(docPassedToShow, textDocumentMock.object(), 'showTextDocument should be called with the document returned by openTextDocument');

        verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '200');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'requestId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'errorCode');
    });

    it('Read data returns no bodyAsText', async () => {
        // Arrange
        apiClientResponseMock.setup(instance => instance.bodyAsText).returns(undefined);

        // Act
        await executeCommand();

        //Assert
        assert.strictEqual(openTextDocumentStub.notCalled, true, 'openTextDocument should not be called');
        assert.strictEqual(showTextDocumentStub.notCalled, true, 'showTextDocument should not be called');
    });

    it('Read data returns an error', async () => {
        // Arrange
        const errorResponseBody = {
            errorCode: 'InvalidInput',
            message: 'The input was invalid',
            requestId: 'req-12345',
        };
        apiClientResponseMock.setup(instance => instance.status).returns(400);
        apiClientResponseMock.setup(instance => instance.parsedBody).returns(errorResponseBody);

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

        //Assert
        assert.strictEqual(openTextDocumentStub.notCalled, true, 'openTextDocument should not be called');
        assert.strictEqual(showTextDocumentStub.notCalled, true, 'showTextDocument should not be called');

        assert.ok(error!.message.includes('Error reading'), 'Error message should include "Error reading"');

        verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '400');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'requestId', 'req-12345');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'errorCode', 'InvalidInput');
    });

    async function executeCommand(): Promise<void> {
        await readArtifactCommand(
            artifactMock.object(),
            artifactManagerMock.object(),
            telemetryActivityMock.object()
        );
    }

});
