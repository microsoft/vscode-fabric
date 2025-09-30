// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { InternalSatelliteManager } from '../../../src/internalSatellites/InternalSatelliteManager';
import { IWorkspaceManager, IArtifactManager, IFabricApiClient } from '@microsoft/vscode-fabric-api';
import { ILogger, TelemetryService } from '@microsoft/vscode-fabric-util';
import { IWorkspaceFilterManager } from '../../../src/workspace/WorkspaceFilterManager';
import { IFabricExtensionManagerInternal } from '../../../src/apis/internal/fabricExtensionInternal';

describe('InternalSatelliteManager', function () {
    let contextMock: Mock<vscode.ExtensionContext>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let artifactManagerMock: Mock<IArtifactManager>;
    let apiClientMock: Mock<IFabricApiClient>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let loggerMock: Mock<ILogger>;
    let extensionManagerMock: Mock<IFabricExtensionManagerInternal>;
    let workspaceFilterManagerMock: Mock<IWorkspaceFilterManager>;
    let serviceCollection: any;
    let registerCommandStub: sinon.SinonStub;

    before(function () {
        // No global setup required
    });

    beforeEach(function () {
        contextMock = new Mock<vscode.ExtensionContext>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        artifactManagerMock = new Mock<IArtifactManager>();
        apiClientMock = new Mock<IFabricApiClient>();
        telemetryServiceMock = new Mock<TelemetryService>();
        loggerMock = new Mock<ILogger>();
        extensionManagerMock = new Mock<IFabricExtensionManagerInternal>();
        workspaceFilterManagerMock = new Mock<IWorkspaceFilterManager>();
        serviceCollection = {
            workspaceManager: workspaceManagerMock.object(),
            artifactManager: artifactManagerMock.object(),
            apiClient: apiClientMock.object(),
        };
        extensionManagerMock.setup(x => x.addExtension(It.IsAny())).returns(serviceCollection);
        // Ensure context.subscriptions is an array for all extension instances
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

    it('should construct and have extensionClasses for SqlExtension and NotebookExtension', function () {
        // Act
        const manager = new InternalSatelliteManager(
            contextMock.object(),
            telemetryServiceMock.object(),
            loggerMock.object(),
            extensionManagerMock.object(),
            workspaceFilterManagerMock.object()
        );
        // Assert
        assert.ok(manager.extensionClasses.length >= 2, 'Should have at least two extension classes');
    });

    it('should activate all extensions and return their identities', function () {
        // Arrange
        const context = contextMock.object();
        (context as any).subscriptions = [];
        const manager = new InternalSatelliteManager(
            context,
            telemetryServiceMock.object(),
            loggerMock.object(),
            extensionManagerMock.object(),
            workspaceFilterManagerMock.object()
        );
        // Act
        manager.activateAll();
        const ids = manager.getSatelliteIds();
        // Assert
        assert.ok(Array.isArray(ids), 'getSatelliteIds should return an array');
        assert.ok(ids.length >= 2, 'Should have at least two satellite ids after activation');
    });

    it('should dispose all extensions without error', function () {
        // Arrange
        const context = contextMock.object();
        (context as any).subscriptions = [];
        const manager = new InternalSatelliteManager(
            context,
            telemetryServiceMock.object(),
            loggerMock.object(),
            extensionManagerMock.object(),
            workspaceFilterManagerMock.object()
        );
        manager.activateAll();
        // Act & Assert
        assert.doesNotThrow(() => manager.dispose(), 'Dispose should not throw');
    });
});
