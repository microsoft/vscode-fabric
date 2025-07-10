import * as assert from 'assert';

import { getSessionProviderForEnvironment, msSessionProvider, msSessionProviderPPE } from '../authentication/helpers';
import { FabricEnvironmentName } from '../settings/FabricEnvironment';

describe('sessionProviderForFabricEnvironment should return', () => {
    // Tests for msSessionProviderPPE environments
    it('microsoft-sovereign-cloud for FabricEnvironment.MOCK', () => {
        const result = getSessionProviderForEnvironment(FabricEnvironmentName.MOCK);
        assert.equal(result, msSessionProviderPPE);
    });

    it('microsoft-sovereign-cloud for FabricEnvironment.ONEBOX', () => {
        const result = getSessionProviderForEnvironment(FabricEnvironmentName.ONEBOX);
        assert.equal(result, msSessionProviderPPE);
    });

    it('microsoft-sovereign-cloud for FabricEnvironment.EDOG', () => {
        const result = getSessionProviderForEnvironment(FabricEnvironmentName.EDOG);
        assert.equal(result, msSessionProviderPPE);
    });

    it('microsoft-sovereign-cloud for FabricEnvironment.EDOGONEBOX', () => {
        const result = getSessionProviderForEnvironment(FabricEnvironmentName.EDOGONEBOX);
        assert.equal(result, msSessionProviderPPE);
    });

    // Tests for msSessionProvider environments
    it('microsoft for FabricEnvironment.DAILY', () => {
        const result = getSessionProviderForEnvironment(FabricEnvironmentName.DAILY);
        assert.equal(result, msSessionProvider);
    });

    it('microsoft for FabricEnvironment.DXT', () => {
        const result = getSessionProviderForEnvironment(FabricEnvironmentName.DXT);
        assert.equal(result, msSessionProvider);
    });

    it('microsoft for FabricEnvironment.MSIT', () => {
        const result = getSessionProviderForEnvironment(FabricEnvironmentName.MSIT);
        assert.equal(result, msSessionProvider);
    });

    it('microsoft for FabricEnvironment.PROD', () => {
        const result = getSessionProviderForEnvironment(FabricEnvironmentName.PROD);
        assert.equal(result, msSessionProvider);
    });
});