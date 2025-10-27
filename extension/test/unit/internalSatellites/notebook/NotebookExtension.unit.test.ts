// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { NotebookExtension } from '../../../../src/internalSatellites/notebook/NotebookExtension';
import { IFabricExtensionManager, IWorkspaceManager, IArtifactManager } from '@microsoft/vscode-fabric-api';
import { TelemetryService } from '@microsoft/vscode-fabric-util';

describe('NotebookExtension', function () {
    let contextMock: Mock<vscode.ExtensionContext>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let artifactManagerMock: Mock<IArtifactManager>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let extensionManagerMock: Mock<IFabricExtensionManager>;
    let serviceCollection: any;
    let registerCommandStub: sinon.SinonStub;

    before(function () {
        // No global setup required
    });

    beforeEach(function () {
        contextMock = new Mock<vscode.ExtensionContext>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        artifactManagerMock = new Mock<IArtifactManager>();
        telemetryServiceMock = new Mock<TelemetryService>();
        extensionManagerMock = new Mock<IFabricExtensionManager>();
        serviceCollection = {
            workspaceManager: workspaceManagerMock.object(),
            artifactManager: artifactManagerMock.object(),
        };
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
            extensionManagerMock.object()
        );
        // Act & Assert
        assert.doesNotThrow(() => notebookExtension.dispose(), 'Dispose should not throw');
    });
});
