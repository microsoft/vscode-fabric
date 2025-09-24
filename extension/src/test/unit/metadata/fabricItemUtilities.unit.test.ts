// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fabricItemUtilities from '../../../metadata/fabricItemUtilities';
import * as fabricItemMetadata from '../../../metadata/fabricItemMetadata';
import { IArtifact } from '@microsoft/vscode-fabric-api';

// Mocked metadata for testing
const testMetadata = {
    /* eslint-disable @typescript-eslint/naming-convention*/
    ThemedIcon: {
        displayName: 'A themed icon',
        displayNamePlural: 'The themed icons',
        iconInformation: { fileName: 'themed.svg', isThemed: true },
        extensionId: 'fabric.themedIcon',
        portalFolder: 'themed-icons',
    },
    NonThemedIcon: {
        iconInformation: { fileName: 'nonthemed.svg', isThemed: false },
    },
    NoMetadata: {
    },
    /* eslint-enable @typescript-eslint/naming-convention*/
};

describe('fabricItemUtilities', () => {
    let fabricItemMetadataStub: sinon.SinonStub;

    beforeEach(() => {
        // Stub the fabricItemMetadata import in the module under test
        fabricItemMetadataStub = sinon.stub(fabricItemMetadata, 'fabricItemMetadata').value(testMetadata);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('getDisplayName', () => {
        it('returns displayName for known artifact', () => {
            assert.strictEqual(fabricItemUtilities.getDisplayName('ThemedIcon'), 'A themed icon');
        });

        it('returns artifactType for missing property', () => {
            assert.strictEqual(fabricItemUtilities.getDisplayName('NoMetadata'), 'NoMetadata');
        });

        it('returns artifactType for unknown artifact', () => {
            assert.strictEqual(fabricItemUtilities.getDisplayName('UnknownType'), 'UnknownType');
        });

        it('works with IArtifact object', () => {
            const artifact: IArtifact = {
                type: 'ThemedIcon',
                id: '1',
                displayName: 'TestThemedIcon',
                description: 'Test Themed Icon',
                workspaceId: 'ws1',
                fabricEnvironment: 'mock',
            };
            assert.strictEqual(fabricItemUtilities.getDisplayName(artifact), 'A themed icon');
        });
    });

    describe('getDisplayNamePlural', () => {
        it('returns displayNamePlural for known artifact', () => {
            assert.strictEqual(fabricItemUtilities.getDisplayNamePlural('ThemedIcon'), 'The themed icons');
        });

        it('returns artifactType for missing property', () => {
            assert.strictEqual(fabricItemUtilities.getDisplayNamePlural('NoMetadata'), 'NoMetadata');
        });

        it('returns undefined for unknown artifact', () => {
            assert.strictEqual(fabricItemUtilities.getDisplayNamePlural('UnknownType'), 'UnknownType');
        });
    });

    describe('getArtifactIconPath', () => {
        const baseUri = vscode.Uri.file('/path/to/extension');

        it('returns themed icon path for themed artifact', () => {
            const result = fabricItemUtilities.getArtifactIconPath(baseUri, 'ThemedIcon');
            assert.ok(result && typeof result === 'object' && 'light' in result && 'dark' in result, 'Should return themed icon path');
            assert.strictEqual(
                result?.light.fsPath,
                vscode.Uri.joinPath(baseUri, 'resources', 'light', 'artifacts', 'themed.svg').fsPath
            );
            assert.strictEqual(
                result?.dark.fsPath,
                vscode.Uri.joinPath(baseUri, 'resources', 'dark', 'artifacts', 'themed.svg').fsPath
            );
        });

        it('returns non-themed icon path for non-themed artifact', () => {
            const result = fabricItemUtilities.getArtifactIconPath(baseUri, 'NonThemedIcon');
            assert.ok(result instanceof vscode.Uri, 'Should return a Uri for non-themed icon');
            assert.strictEqual(
                result?.fsPath,
                vscode.Uri.joinPath(baseUri, 'resources', 'artifacts', 'nonthemed.svg').fsPath
            );
        });

        it('returns undefined for missing property', () => {
            assert.strictEqual(fabricItemUtilities.getArtifactIconPath(baseUri, 'NoMetadata'), undefined);
        });

        it('returns undefined if no iconInformation', () => {
            assert.strictEqual(fabricItemUtilities.getArtifactIconPath(baseUri, 'UnknownType'), undefined);
        });

        it('returns undefined if baseUri is missing', () => {
            assert.strictEqual(fabricItemUtilities.getArtifactIconPath(undefined as any, 'ThemedIcon'), undefined);
        });
    });

    describe('getArtifactDefaultIconPath', () => {
        const baseUri = vscode.Uri.file('/path/to/extension');
        it('returns themed default icon path', () => {
            const result = fabricItemUtilities.getArtifactDefaultIconPath(baseUri);
            assert.ok(result && typeof result === 'object' && 'light' in result && 'dark' in result, 'Should return themed default icon path');
            assert.strictEqual(
                result?.light.fsPath,
                vscode.Uri.joinPath(baseUri, 'resources', 'light', 'artifacts', 'document_24.svg').fsPath
            );
            assert.strictEqual(
                result?.dark.fsPath,
                vscode.Uri.joinPath(baseUri, 'resources', 'dark', 'artifacts', 'document_24.svg').fsPath
            );
        });
    });

    describe('getArtifactExtensionId', () => {
        it('returns extensionId for known artifact', () => {
            assert.strictEqual(fabricItemUtilities.getArtifactExtensionId('ThemedIcon'), 'fabric.themedIcon');
        });

        it('returns undefined for known artifact with no extensionId', () => {
            assert.strictEqual(fabricItemUtilities.getArtifactExtensionId('NoMetadata'), undefined);
        });

        it('returns undefined for unknown artifact', () => {
            assert.strictEqual(fabricItemUtilities.getArtifactExtensionId('UnknownType'), undefined);
        });
    });

    describe('getArtifactTypeFolder', () => {
        it('returns portalFolder if present', () => {
            assert.strictEqual(fabricItemUtilities.getArtifactTypeFolder('ThemedIcon'), 'themed-icons');
        });

        it('returns default folder if portalFolder missing', () => {
            assert.strictEqual(fabricItemUtilities.getArtifactTypeFolder('NoMetadata'), 'NoMetadatas');
            assert.strictEqual(fabricItemUtilities.getArtifactTypeFolder('UnknownType'), 'UnknownTypes');
        });
    });
});
