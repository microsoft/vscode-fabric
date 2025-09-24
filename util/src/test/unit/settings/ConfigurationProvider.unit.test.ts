// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { ConfigurationProvider } from '../../../settings/ConfigurationProvider';
import { IDisposableCollection } from '../../../DisposableCollection';

describe('ConfigurationProvider', function () {
    let disposableCollectionMock: Mock<IDisposableCollection>;
    let configurationProvider: ConfigurationProvider;
    let mockConfiguration: any;
    let configChangeHandler: Function;
    let getConfigurationStub: sinon.SinonStub;

    beforeEach(function () {
        disposableCollectionMock = new Mock<IDisposableCollection>();
        disposableCollectionMock.setup(instance => instance.add(It.IsAny())).returns(undefined);

        mockConfiguration = {
            get: sinon.stub(),
            update: sinon.stub().returns(Promise.resolve()),
        };

        getConfigurationStub = sinon.stub(vscode.workspace, 'getConfiguration').returns(mockConfiguration);

        const onDidChangeConfigurationStub = sinon.stub(vscode.workspace, 'onDidChangeConfiguration');
        onDidChangeConfigurationStub.callsFake((handler) => {
            configChangeHandler = handler;
            return { dispose: () => {} };
        });

        configurationProvider = new ConfigurationProvider(disposableCollectionMock.object());
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('get', function () {
        it('should retrieve configuration value from VS Code workspace', function () {
            const key = 'testKey';
            const defaultValue = 'defaultValue';
            const expectedValue = 'expectedValue';
            mockConfiguration.get.withArgs(key, defaultValue).returns(expectedValue);

            const result = configurationProvider.get(key, defaultValue);

            assert.strictEqual(result, expectedValue, 'Should return the expected value from configuration');
            assert(getConfigurationStub.calledWith('Fabric'), 'Should call getConfiguration with Fabric section');
            assert(mockConfiguration.get.calledWith(key, defaultValue), 'Should call get with the correct parameters');
        });

        it('should add key to the tracked keys set', function () {
            const key = 'newKey';
            const defaultValue = 'defaultValue';
            mockConfiguration.get.returns(defaultValue);

            configurationProvider.get(key, defaultValue);

            const eventHandler = sinon.spy();
            configurationProvider.onDidConfigurationChange(eventHandler);

            const event = {
                affectsConfiguration: (section: string) => {
                    return section === 'Fabric' || section === 'Fabric.newKey';
                },
            };

            configChangeHandler(event);

            assert.strictEqual(eventHandler.calledWith(key), true, 'Should fire event for the tracked key');
        });
    });

    describe('update', function () {
        it('should update configuration value in VS Code global settings', async function () {
            const key = 'updateKey';
            const value = 'newValue';

            await configurationProvider.update(key, value);

            assert(getConfigurationStub.calledWith('Fabric'), 'Should call getConfiguration with Fabric section');
            assert(
                mockConfiguration.update.calledWith(
                    key,
                    value,
                    vscode.ConfigurationTarget.Global
                ),
                'Should call update with the correct parameters'
            );
        });

        it('should add key to the tracked keys set when updating', function () {
            const key = 'updateTrackKey';
            const value = 'updateValue';

            void configurationProvider.update(key, value);

            const eventHandler = sinon.spy();
            configurationProvider.onDidConfigurationChange(eventHandler);

            const event = {
                affectsConfiguration: (section: string) => {
                    return section === 'Fabric' || section === 'Fabric.updateTrackKey';
                },
            };

            configChangeHandler(event);

            assert.strictEqual(eventHandler.calledWith(key), true, 'Should fire event for the tracked key');
        });
    });

    describe('onDidConfigurationChange', function () {
        it('should emit events only for tracked keys that changed', function () {
            const key1 = 'trackedKey1';
            const key2 = 'trackedKey2';
            const key3 = 'trackedKey3';

            configurationProvider.get(key1, null);
            configurationProvider.get(key2, null);
            configurationProvider.get(key3, null);

            const eventHandler = sinon.spy();
            configurationProvider.onDidConfigurationChange(eventHandler);

            const event = {
                affectsConfiguration: (section: string) => {
                    if (section === 'Fabric') {
                        return true;
                    }
                    if (section === 'Fabric.trackedKey1') {
                        return true;
                    }
                    if (section === 'Fabric.trackedKey3') {
                        return true;
                    }
                    return false;
                },
            };

            configChangeHandler(event);

            assert.strictEqual(eventHandler.callCount, 2, 'Should fire event twice - once for key1 and once for key3');
            assert.strictEqual(eventHandler.calledWith(key1), true, 'Should fire event for key1');
            assert.strictEqual(eventHandler.calledWith(key3), true, 'Should fire event for key3');
            assert.strictEqual(eventHandler.neverCalledWith(key2), true, 'Should not fire event for key2');
        });

        it('should not emit events when changes do not affect Fabric section', function () {
            const key = 'someKey';
            configurationProvider.get(key, null);

            const eventHandler = sinon.spy();
            configurationProvider.onDidConfigurationChange(eventHandler);

            const event = {
                affectsConfiguration: (section: string) => {
                    return section !== 'Fabric';
                },
            };

            configChangeHandler(event);

            assert.strictEqual(eventHandler.notCalled, true, 'Should not fire any events');
        });
    });
});
