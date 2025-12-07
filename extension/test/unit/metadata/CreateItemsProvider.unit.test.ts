// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { CreateItemsProvider } from '../../../src/metadata/CreateItemsProvider';
import { CreationCapability, FabricItemMetadata } from '../../../src/metadata/definitions';
import * as fabricItemUtilities from '../../../src/metadata/fabricItemUtilities';

describe('CreateItemsProvider', () => {
    let getArtifactIconPathStub: sinon.SinonStub;
    let getArtifactDefaultIconPathStub: sinon.SinonStub;
    const baseUri = vscode.Uri.file('/path/to/extension');

    beforeEach(() => {
        getArtifactIconPathStub = sinon.stub(fabricItemUtilities, 'getArtifactIconPath');
        getArtifactDefaultIconPathStub = sinon.stub(fabricItemUtilities, 'getArtifactDefaultIconPath');
    });

    afterEach(() => {
        sinon.restore();
    });

    it('returns only supported and preview items', () => {
        const metadata: Record<string, FabricItemMetadata> = {
            notebook: {
                displayName: 'Notebook',
                creationCapability: CreationCapability.supported,
            },
            lakehouse: {
                displayName: 'Lakehouse',
                creationCapability: CreationCapability.preview,
            },
            deprecated: {
                displayName: 'Deprecated',
                creationCapability: CreationCapability.unsupported,
            },
        };

        const provider = new CreateItemsProvider(metadata);
        const items = provider.getItemsForCreate(baseUri);

        assert.strictEqual(items.length, 2, 'items length');
        assert.deepStrictEqual(
            items.map(i => i.type).sort(),
            ['lakehouse', 'notebook'],
            'should contain notebook and lakehouse'
        );
    });

    it('returns an empty array if no creatable items', () => {
        const metadata: Record<string, FabricItemMetadata> = {
            onlyUnsupported: {
                displayName: 'None',
                creationCapability: CreationCapability.unsupported,
            },
        };
        const provider = new CreateItemsProvider(metadata);
        const items = provider.getItemsForCreate(baseUri);
        assert.deepStrictEqual(items, []);
    });

    it('defaults creationCapability to unsupported if missing', () => {
        const metadata: Record<string, FabricItemMetadata> = {
            noCapability: {
                displayName: 'Default',
            },
        };
        const provider = new CreateItemsProvider(metadata);
        const items = provider.getItemsForCreate(baseUri);
        assert.deepStrictEqual(items, []);
    });

    it('copies item metadata with appropriate fallbacks', () => {
        // Arrange
        const metadata: Record<string, FabricItemMetadata> = {
            /* eslint-disable @typescript-eslint/naming-convention*/
            'CompleteData': {
                displayName: 'Complete data',
                creationCapability: CreationCapability.supported,
                creationDescription: 'Fancy description',
                iconInformation: { fileName: 'complete.svg', isThemed: true },
            },
            'NoMetadata': {
                creationCapability: CreationCapability.supported,
            },
            /* eslint-enable @typescript-eslint/naming-convention*/
        };
        getArtifactIconPathStub.withArgs(baseUri, 'CompleteData').returns('icon/path.svg');
        getArtifactDefaultIconPathStub.withArgs(baseUri).returns('default/icon/path.svg');

        // Act
        const provider = new CreateItemsProvider(metadata);
        const items = provider.getItemsForCreate(baseUri);

        // Assert
        assert.equal(items.length, 2, 'items length');

        assert.strictEqual(items[0].type, 'CompleteData');
        assert.strictEqual(items[0].displayName, 'Complete data');
        assert.strictEqual(items[0].description, 'Fancy description');
        assert.strictEqual(items[0].creationCapability, CreationCapability.supported);
        assert.strictEqual(getArtifactIconPathStub.callCount, 1, 'getArtifactIconPath should be called once');
        assert.ok(getArtifactIconPathStub.calledWith(baseUri, 'CompleteData'), 'getArtifactIconPath should be called with CompleteData');

        assert.strictEqual(items[1].type, 'NoMetadata');
        assert.strictEqual(items[1].displayName, 'NoMetadata', 'displayName should fallback to type');
        assert.strictEqual(items[1].description, 'Create a new NoMetadata', 'description should fallback to default');
        assert.strictEqual(items[1].creationCapability, CreationCapability.supported, 'creationCapability should be set');
        assert.strictEqual(getArtifactDefaultIconPathStub.callCount, 1, 'getArtifactDefaultIconPath should be called once');
        assert.ok(getArtifactDefaultIconPathStub.calledWith(baseUri), 'getArtifactDefaultIconPath should be called with baseUri');
    });

    describe('with artifactTypeFilter', () => {
        it('returns only the filtered type when it exists and is creatable', () => {
            const metadata: Record<string, FabricItemMetadata> = {
                notebook: {
                    displayName: 'Notebook',
                    creationCapability: CreationCapability.supported,
                },
                lakehouse: {
                    displayName: 'Lakehouse',
                    creationCapability: CreationCapability.supported,
                },
            };

            const provider = new CreateItemsProvider(metadata, 'notebook');
            const items = provider.getItemsForCreate(baseUri);

            assert.strictEqual(items.length, 1, 'should return only one item');
            assert.strictEqual(items[0].type, 'notebook');
            assert.strictEqual(items[0].displayName, 'Notebook');
        });

        it('returns all items when filtered type does not exist in metadata', () => {
            const metadata: Record<string, FabricItemMetadata> = {
                notebook: {
                    displayName: 'Notebook',
                    creationCapability: CreationCapability.supported,
                },
                lakehouse: {
                    displayName: 'Lakehouse',
                    creationCapability: CreationCapability.supported,
                },
            };

            const provider = new CreateItemsProvider(metadata, 'nonexistent');
            const items = provider.getItemsForCreate(baseUri);

            assert.strictEqual(items.length, 2, 'should return all creatable items');
            assert.deepStrictEqual(
                items.map(i => i.type).sort(),
                ['lakehouse', 'notebook']
            );
        });

        it('returns all items when filtered type exists but is not creatable', () => {
            const metadata: Record<string, FabricItemMetadata> = {
                notebook: {
                    displayName: 'Notebook',
                    creationCapability: CreationCapability.supported,
                },
                deprecated: {
                    displayName: 'Deprecated',
                    creationCapability: CreationCapability.unsupported,
                },
            };

            const provider = new CreateItemsProvider(metadata, 'deprecated');
            const items = provider.getItemsForCreate(baseUri);

            assert.strictEqual(items.length, 1, 'should fall back to all creatable items');
            assert.strictEqual(items[0].type, 'notebook');
        });

        it('returns empty array when filtered type is not creatable and no other creatable items exist', () => {
            const metadata: Record<string, FabricItemMetadata> = {
                deprecated: {
                    displayName: 'Deprecated',
                    creationCapability: CreationCapability.unsupported,
                },
            };

            const provider = new CreateItemsProvider(metadata, 'deprecated');
            const items = provider.getItemsForCreate(baseUri);

            assert.deepStrictEqual(items, [], 'should return empty array');
        });

        it('works with preview items when filtered', () => {
            const metadata: Record<string, FabricItemMetadata> = {
                notebook: {
                    displayName: 'Notebook',
                    creationCapability: CreationCapability.supported,
                },
                experimental: {
                    displayName: 'Experimental',
                    creationCapability: CreationCapability.preview,
                },
            };

            const provider = new CreateItemsProvider(metadata, 'experimental');
            const items = provider.getItemsForCreate(baseUri);

            assert.strictEqual(items.length, 1, 'should return filtered preview item');
            assert.strictEqual(items[0].type, 'experimental');
            assert.strictEqual(items[0].creationCapability, CreationCapability.preview);
        });
    });

});
