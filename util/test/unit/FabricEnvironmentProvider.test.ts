// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';

import { FABRIC_ENVIRONMENT_KEY, FabricEnvironmentProvider } from '../../src/settings/FabricEnvironmentProvider';
import { FabricEnvironmentName } from '../../src/settings/FabricEnvironment';
import { FakeConfigurationProvider } from '../../src/settings/mocks';
import { MockConsoleLogger } from '../../src/logger/Logger';

describe('The FabricEnvironmentProvider should', () => {
    it('return PROD if the setting is invalid2', async () => {
        const config = new FakeConfigurationProvider();
        await config.update(FABRIC_ENVIRONMENT_KEY, 'INVALID');

        const provider = new FabricEnvironmentProvider(config, new MockConsoleLogger('Fabric'));
        const result = provider.getCurrent();
        assert.equal(result.env, FabricEnvironmentName.PROD);
    });
});
