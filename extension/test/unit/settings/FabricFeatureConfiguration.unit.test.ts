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

    describe('isEditItemDefinitionsEnabled', () => {
        it('returns false by default', () => {
            assert.strictEqual(featureConfig.isEditItemDefinitionsEnabled(), false);
        });

        it('returns true when EditItemDefinitions is enabled', () => {
            mockConfigProvider.setConfigValue('EditItemDefinitions', true);
            assert.strictEqual(featureConfig.isEditItemDefinitionsEnabled(), true);
        });

        it('returns false when EditItemDefinitions is disabled', () => {
            mockConfigProvider.setConfigValue('EditItemDefinitions', false);
            assert.strictEqual(featureConfig.isEditItemDefinitionsEnabled(), false);
        });
    });

    describe('onDidFolderGroupingChange', () => {
        it('fires when ShowFolders configuration changes', (done) => {
            featureConfig.onDidFolderGroupingChange(() => {
                done();
            });

            mockConfigProvider.fireConfigChange('ShowFolders');
        });

        it('does not fire when EditItemDefinitions configuration changes', (done) => {
            let folderEventFired = false;

            featureConfig.onDidFolderGroupingChange(() => {
                folderEventFired = true;
            });

            mockConfigProvider.fireConfigChange('EditItemDefinitions');

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

    describe('onDidEditItemDefinitionsChange', () => {
        it('fires when EditItemDefinitions configuration changes', (done) => {
            featureConfig.onDidEditItemDefinitionsChange(() => {
                done();
            });

            mockConfigProvider.fireConfigChange('EditItemDefinitions');
        });

        it('does not fire when ShowFolders configuration changes', (done) => {
            let definitionsEventFired = false;

            featureConfig.onDidEditItemDefinitionsChange(() => {
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

            featureConfig.onDidEditItemDefinitionsChange(() => {
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
        it('changing ShowFolders does not fire onDidEditItemDefinitionsChange', (done) => {
            let definitionsEventFired = false;

            featureConfig.onDidEditItemDefinitionsChange(() => {
                definitionsEventFired = true;
            });

            mockConfigProvider.update('ShowFolders', true);

            // Give time for event to fire if it's going to
            setTimeout(() => {
                assert.strictEqual(definitionsEventFired, false);
                done();
            }, 50);
        });

        it('changing EditItemDefinitions does not fire onDidFolderGroupingChange', (done) => {
            let folderEventFired = false;

            featureConfig.onDidFolderGroupingChange(() => {
                folderEventFired = true;
            });

            mockConfigProvider.update('EditItemDefinitions', true);

            // Give time for event to fire if it's going to
            setTimeout(() => {
                assert.strictEqual(folderEventFired, false);
                done();
            }, 50);
        });
    });
});
