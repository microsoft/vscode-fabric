import { DIContainer } from '@wessberg/di';
import * as vscode from 'vscode';
import { It, Mock, Times } from 'moq.ts';
import { FabricVsCodeExtension } from '../../extension';
import { composeTestContainer } from './composeTestContainer';
import { FabricEnvironmentName, getFabricEnvironment, IAccountProvider, IFabricEnvironmentProvider, sleep, TelemetryService } from '@fabric/vscode-fabric-util';

describe('FabricVsCodeExtension', function() {
    let app: FabricVsCodeExtension;
    let container: DIContainer;
    let mockAccountPovider: Mock<IAccountProvider>;
    let mockTelemetryService: Mock<TelemetryService>;
    let mockEnvironmentProvider: Mock<IFabricEnvironmentProvider>;
    let onDidEnvironmentChangeEmitter: vscode.EventEmitter<void>;
    let onTenantChangedEmitter: vscode.EventEmitter<void>;
    
    beforeEach(async function() {
        // Get the test container
        container = await composeTestContainer();
        
        // Set up mocks necessary for these tests
        mockAccountPovider = new Mock<IAccountProvider>();
        mockAccountPovider.setup(provider => provider.onSignInChanged).returns(new vscode.EventEmitter<void>().event);
        
        onTenantChangedEmitter = new vscode.EventEmitter<void>();
        mockAccountPovider.setup(provider => provider.onTenantChanged).returns(onTenantChangedEmitter.event);
        mockAccountPovider.setup(provider => provider.getDefaultTelemetryProperties).returns(async () => ({
            tenantid: 'some-tenant',
            useralias: 'some-user',
            isMicrosoftInternal: 'false'
        }));

        // Set up telemetry service mock to verify properties are added
        mockTelemetryService = new Mock<TelemetryService>();
        mockTelemetryService.setup(service => service.sendTelemetryEvent(It.IsAny(), It.IsAny(), It.IsAny())).returns(undefined);
        mockTelemetryService.setup(service => service.sendTelemetryErrorEvent(It.IsAny(), It.IsAny(), It.IsAny())).returns(undefined);
        mockTelemetryService.setup(service => service.addOrUpdateDefaultProperty(It.IsAny<string>(), It.IsAny<string>())) .returns(undefined);
        mockTelemetryService.setup(service => service.dispose()).returns(Promise.resolve());
            
        mockEnvironmentProvider = new Mock<IFabricEnvironmentProvider>();
        mockEnvironmentProvider.setup(provider => provider.getCurrent()).returns(getFabricEnvironment(FabricEnvironmentName.MOCK));

        onDidEnvironmentChangeEmitter = new vscode.EventEmitter<void>();
        mockEnvironmentProvider.setup(provider => provider.onDidEnvironmentChange).returns(onDidEnvironmentChangeEmitter.event);

        // Override the test container where needed
        container.registerSingleton<IAccountProvider>(() => mockAccountPovider.object());
        container.registerSingleton<TelemetryService>(() => mockTelemetryService.object());
        container.registerSingleton<IFabricEnvironmentProvider>(() => mockEnvironmentProvider.object());

        // Create the extension
        app = new FabricVsCodeExtension(container);
    });

    afterEach(async function() {
        await app.deactivate();
    });

    it('should set default telemetry properties on activate', async function() {
        // Act
        await app.activate();

        // Assert
        mockTelemetryService.verify(service => 
            service.addOrUpdateDefaultProperty(
                It.Is<string>(s => s === 'tenantid'),
                It.Is<string>(s => s === 'some-tenant')), Times.Once());

        mockTelemetryService.verify(service => 
            service.addOrUpdateDefaultProperty(
                It.Is<string>(s => s === 'useralias'),
                It.Is<string>(s => s === 'some-user')), Times.Once());

        mockTelemetryService.verify(service => 
            service.addOrUpdateDefaultProperty(
                It.Is<string>(s => s === 'ismicrosoftinternal'),
                It.Is<string>(s => s === 'false')), Times.Once());
    });

    it('should set fabric environment property on activate', async function() {
        // Act
        await app.activate();

        // Assert
        mockTelemetryService.verify(service => 
            service.addOrUpdateDefaultProperty(
                It.Is<string>(s => s === 'fabricEnvironment'),
                It.Is<string>(s => s === 'MOCK')), Times.Once());

        // Arrange - change the environment retuned by the provider
        mockEnvironmentProvider.setup(provider => provider.getCurrent()).returns(getFabricEnvironment(FabricEnvironmentName.PROD));

        // Act - simulate changed event
        onDidEnvironmentChangeEmitter.fire();

        // Assert
        mockTelemetryService.verify(service => 
            service.addOrUpdateDefaultProperty(
                It.Is<string>(s => s === 'fabricEnvironment'),
                It.Is<string>(s => s === 'PROD')), Times.Once());
    });

    it('should update tenantid property when onTenantChanged is called', async function() {
        // Act - activate extension
        await app.activate();

        // Verify initial setup call
        mockTelemetryService.verify(service => 
            service.addOrUpdateDefaultProperty(
                It.Is<string>(s => s === 'tenantid'),
                It.Is<string>(s => s === 'some-tenant')), Times.Once());

        // Arrange - update mock to return different tenant properties
        mockAccountPovider.setup(provider => provider.getDefaultTelemetryProperties).returns(async () => ({
            tenantid: 'updated-tenant',
            useralias: 'updated-user',
            isMicrosoftInternal: 'true'
        }));

        // Act - simulate tenant change event
        onTenantChangedEmitter.fire();

        // Give the async event handler time to complete
        await sleep(10);

        // Assert - verify updated tenant properties were set
        mockTelemetryService.verify(service => 
            service.addOrUpdateDefaultProperty(
                It.Is<string>(s => s === 'tenantid'),
                It.Is<string>(s => s === 'updated-tenant')), Times.Once());

        mockTelemetryService.verify(service => 
            service.addOrUpdateDefaultProperty(
                It.Is<string>(s => s === 'useralias'),
                It.Is<string>(s => s === 'updated-user')), Times.Once());

        mockTelemetryService.verify(service => 
            service.addOrUpdateDefaultProperty(
                It.Is<string>(s => s === 'ismicrosoftinternal'),
                It.Is<string>(s => s === 'true')), Times.Once());
    });
});