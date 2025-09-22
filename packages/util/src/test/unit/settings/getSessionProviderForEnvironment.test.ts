// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';

import { getSessionProviderForFabricEnvironment, msSessionProvider, msSessionProviderPPE } from '../../../settings/getSessionProviderForFabricEnvironment';
import { FabricEnvironmentName } from '../../../settings/FabricEnvironment';

describe('sessionProviderForFabricEnvironment should return', () => {
    // Tests for msSessionProviderPPE environments
    it('microsoft-sovereign-cloud for FabricEnvironment.MOCK', () => {
        const result = getSessionProviderForFabricEnvironment(FabricEnvironmentName.MOCK);
        assert.equal(result, msSessionProviderPPE);
    });

    it('microsoft-sovereign-cloud for FabricEnvironment.ONEBOX', () => {
        const result = getSessionProviderForFabricEnvironment(FabricEnvironmentName.ONEBOX);
        assert.equal(result, msSessionProviderPPE);
    });

    it('microsoft-sovereign-cloud for FabricEnvironment.EDOG', () => {
        const result = getSessionProviderForFabricEnvironment(FabricEnvironmentName.EDOG);
        assert.equal(result, msSessionProviderPPE);
    });

    it('microsoft-sovereign-cloud for FabricEnvironment.EDOGONEBOX', () => {
        const result = getSessionProviderForFabricEnvironment(FabricEnvironmentName.EDOGONEBOX);
        assert.equal(result, msSessionProviderPPE);
    });

    // Tests for msSessionProvider environments
    it('microsoft for FabricEnvironment.DAILY', () => {
        const result = getSessionProviderForFabricEnvironment(FabricEnvironmentName.DAILY);
        assert.equal(result, msSessionProvider);
    });

    it('microsoft for FabricEnvironment.DXT', () => {
        const result = getSessionProviderForFabricEnvironment(FabricEnvironmentName.DXT);
        assert.equal(result, msSessionProvider);
    });

    it('microsoft for FabricEnvironment.MSIT', () => {
        const result = getSessionProviderForFabricEnvironment(FabricEnvironmentName.MSIT);
        assert.equal(result, msSessionProvider);
    });

    it('microsoft for FabricEnvironment.PROD', () => {
        const result = getSessionProviderForFabricEnvironment(FabricEnvironmentName.PROD);
        assert.equal(result, msSessionProvider);
    });
});
