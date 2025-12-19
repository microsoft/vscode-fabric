// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import { FabricFeatureConfiguration } from '../../../src/settings/FabricFeatureConfiguration';
import { MockConfigurationProvider } from '../../utilities/MockConfigurationProvider';

describe('FabricFeatureConfiguration', () => {
    let mockConfigProvider: MockConfigurationProvider;
    let featureConfig: FabricFeatureConfiguration;

    beforeEach(() => {
        mockConfigProvider = new MockConfigurationProvider();
        featureConfig = new FabricFeatureConfiguration(mockConfigProvider);
    });

    describe('isFolderGroupingEnabled', () => {
        it('returns false by default', () => {
            assert.strictEqual(featureConfig.isFolderGroupingEnabled(), false);
        });

        it('returns true when ShowFolders is enabled', () => {
            mockConfigProvider.setConfigValue('ShowFolders', true);
            assert.strictEqual(featureConfig.isFolderGroupingEnabled(), true);
        });

        it('returns false when ShowFolders is disabled', () => {
            mockConfigProvider.setConfigValue('ShowFolders', false);
            assert.strictEqual(featureConfig.isFolderGroupingEnabled(), false);
        });
    });

    describe('isItemDefinitionsEnabled', () => {
        it('returns false by default', () => {
            assert.strictEqual(featureConfig.isItemDefinitionsEnabled(), false);
        });

        it('returns true when ShowItemDefinitions is enabled', () => {
            mockConfigProvider.setConfigValue('ShowItemDefinitions', true);
            assert.strictEqual(featureConfig.isItemDefinitionsEnabled(), true);
        });

        it('returns false when ShowItemDefinitions is disabled', () => {
            mockConfigProvider.setConfigValue('ShowItemDefinitions', false);
            assert.strictEqual(featureConfig.isItemDefinitionsEnabled(), false);
        });
    });

    describe('onDidFolderGroupingChange', () => {
        it('fires when ShowFolders configuration changes', (done) => {
            featureConfig.onDidFolderGroupingChange(() => {
                done();
            });

            mockConfigProvider.fireConfigChange('ShowFolders');
        });

        it('does not fire when ShowItemDefinitions configuration changes', (done) => {
            let folderEventFired = false;

            featureConfig.onDidFolderGroupingChange(() => {
                folderEventFired = true;
            });

            mockConfigProvider.fireConfigChange('ShowItemDefinitions');

            // Give time for event to fire if it's going to
            setTimeout(() => {
                assert.strictEqual(folderEventFired, false);
                done();
            }, 50);
        });

        it('does not fire when unrelated configuration changes', (done) => {
            let folderEventFired = false;

            featureConfig.onDidFolderGroupingChange(() => {
                folderEventFired = true;
            });

            mockConfigProvider.fireConfigChange('SomeOtherSetting');

            // Give time for event to fire if it's going to
            setTimeout(() => {
                assert.strictEqual(folderEventFired, false);
                done();
            }, 50);
        });
    });

    describe('onDidItemDefinitionsChange', () => {
        it('fires when ShowItemDefinitions configuration changes', (done) => {
            featureConfig.onDidItemDefinitionsChange(() => {
                done();
            });

            mockConfigProvider.fireConfigChange('ShowItemDefinitions');
        });

        it('does not fire when ShowFolders configuration changes', (done) => {
            let definitionsEventFired = false;

            featureConfig.onDidItemDefinitionsChange(() => {
                definitionsEventFired = true;
            });

            mockConfigProvider.fireConfigChange('ShowFolders');

            // Give time for event to fire if it's going to
            setTimeout(() => {
                assert.strictEqual(definitionsEventFired, false);
                done();
            }, 50);
        });

        it('does not fire when unrelated configuration changes', (done) => {
            let definitionsEventFired = false;

            featureConfig.onDidItemDefinitionsChange(() => {
                definitionsEventFired = true;
            });

            mockConfigProvider.fireConfigChange('SomeOtherSetting');

            // Give time for event to fire if it's going to
            setTimeout(() => {
                assert.strictEqual(definitionsEventFired, false);
                done();
            }, 50);
        });
    });

    describe('event isolation', () => {
        it('changing ShowFolders does not fire onDidItemDefinitionsChange', (done) => {
            let definitionsEventFired = false;

            featureConfig.onDidItemDefinitionsChange(() => {
                definitionsEventFired = true;
            });

            mockConfigProvider.update('ShowFolders', true);

            // Give time for event to fire if it's going to
            setTimeout(() => {
                assert.strictEqual(definitionsEventFired, false);
                done();
            }, 50);
        });

        it('changing ShowItemDefinitions does not fire onDidFolderGroupingChange', (done) => {
            let folderEventFired = false;

            featureConfig.onDidFolderGroupingChange(() => {
                folderEventFired = true;
            });

            mockConfigProvider.update('ShowItemDefinitions', true);

            // Give time for event to fire if it's going to
            setTimeout(() => {
                assert.strictEqual(folderEventFired, false);
                done();
            }, 50);
        });
    });
});
