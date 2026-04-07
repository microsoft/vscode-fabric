// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { NotebookExtension } from '../../../../src/internalSatellites/notebook/NotebookExtension';
import { IFabricExtensionManager } from '@microsoft/vscode-fabric-api';
import { TelemetryService, ILogger } from '@microsoft/vscode-fabric-util';

describe('NotebookExtension', function () {
    let contextMock: Mock<vscode.ExtensionContext>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let loggerMock: Mock<ILogger>;
    let extensionManagerMock: Mock<IFabricExtensionManager>;
    let serviceCollection: any;
    let registerCommandStub: sinon.SinonStub;

    before(function () {
        // No global setup required
    });

    beforeEach(function () {
        contextMock = new Mock<vscode.ExtensionContext>();
        telemetryServiceMock = new Mock<TelemetryService>();
        loggerMock = new Mock<ILogger>();
        extensionManagerMock = new Mock<IFabricExtensionManager>();
        serviceCollection = {};
        extensionManagerMock.setup(x => x.addExtension(It.IsAny())).returns(serviceCollection);
        // Ensure context.subscriptions is an array
        const context = contextMock.object();
        (context as any).subscriptions = [];
        // Stub vscode.commands.registerCommand to avoid duplicate registration errors
        registerCommandStub = sinon.stub(vscode.commands, 'registerCommand').callsFake(() => ({ dispose: () => {} }));
    });

    afterEach(function () {
        sinon.restore();
    });

    after(function () {
        // No global teardown required
    });

    it('should register itself and initialize services on construction', function () {
        // Arrange
        const context = contextMock.object();
        (context as any).subscriptions = [];
        // Act
        const notebookExtension = new NotebookExtension(
            context,
            telemetryServiceMock.object(),
            loggerMock.object(),
            extensionManagerMock.object()
        );
        // Assert
        assert.equal(notebookExtension.identity, 'fabric.internal-satellite-notebook', 'Identity should be set');
        assert.equal(notebookExtension.apiVersion, '0.7', 'API version should be set');
        extensionManagerMock.verify(x => x.addExtension(It.IsAny()), Times.Once());
    });

    it('should dispose without error', function () {
        // Arrange
        const context = contextMock.object();
        (context as any).subscriptions = [];
        const notebookExtension = new NotebookExtension(
            context,
            telemetryServiceMock.object(),
            loggerMock.object(),
            extensionManagerMock.object()
        );
        // Act & Assert
        assert.doesNotThrow(() => notebookExtension.dispose(), 'Dispose should not throw');
    });
});
