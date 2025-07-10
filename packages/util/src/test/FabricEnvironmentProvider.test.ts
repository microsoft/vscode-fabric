import * as assert from 'assert';

import { FABRIC_ENVIRONMENT_KEY, FabricEnvironmentProvider } from '../settings/FabricEnvironmentProvider';
import { FabricEnvironmentName } from '../settings/FabricEnvironment';
import { FakeConfigurationProvider } from '../settings/mocks';
import { MockConsoleLogger } from '../logger/Logger';

describe('The FabricEnvironmentProvider should', () => {
    it('return PROD if the setting is invalid2', async () =>{
        const config = new FakeConfigurationProvider();
        await config.update(FABRIC_ENVIRONMENT_KEY, 'INVALID');

        const provider = new FabricEnvironmentProvider(config, new MockConsoleLogger('Fabric'));
        const result = provider.getCurrent();
        assert.equal(result.env, FabricEnvironmentName.PROD);
    });
});