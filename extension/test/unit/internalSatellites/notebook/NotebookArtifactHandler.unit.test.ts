// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { NotebookArtifactHandler } from '../../../../src/internalSatellites/notebook/NotebookArtifactHandler';
import { FabricError } from '@microsoft/vscode-fabric-util';
import { IItemDefinition, IApiClientRequestOptions } from '@microsoft/vscode-fabric-api';

/**
 * Unit tests for NotebookArtifactHandler covering getDefinitionWorkflow and updateDefinitionWorkflow logic.
 */
describe('NotebookArtifactHandler', function () {
    let handler: NotebookArtifactHandler;
    let folder: vscode.Uri;

    before(function () {
        // Global setup (none required)
    });

    beforeEach(function () {
        handler = new NotebookArtifactHandler();
        // folder will be set per test scenario
        folder = vscode.Uri.file('/virtual/notebook-unused');
    });

    afterEach(function () {
        // no teardown required
    });

    after(function () {
        // Global teardown (none required)
    });

    function createOptions(pathTemplate?: string, url?: string): IApiClientRequestOptions {
        return { pathTemplate, url } as IApiClientRequestOptions;
    }

    async function createScenario(files: string[]): Promise<vscode.Uri> {
        const dir = vscode.Uri.file(path.join(os.tmpdir(), 'nb-handler-test-' + Date.now() + '-' + Math.random().toString(36).slice(2)));
        await vscode.workspace.fs.createDirectory(dir);
        for (const f of files) {
            const fileUri = vscode.Uri.joinPath(dir, f);
            const segments = f.split('/');
            if (segments.length > 1) {
                // ensure subdirectory exists
                const subDir = vscode.Uri.joinPath(dir, ...segments.slice(0, -1));
                await vscode.workspace.fs.createDirectory(subDir);
            }
            await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
        }
        return dir;
    }

    it('getDefinition should add format=ipynb when only .ipynb file exists and no query', async function () {
        // Arrange
        folder = await createScenario(['notebook1.ipynb']);
        const options = createOptions('/api/notebooks/123');

        // Act
        const updated = await handler.getDefinitionWorkflow.onBeforeGetDefinition({}, folder, options);

        // Assert
        assert.equal(updated.pathTemplate, '/api/notebooks/123?format=ipynb', 'Should append ?format=ipynb');
    });

    it('getDefinition should add &format=ipynb when only .ipynb file exists and existing query present', async function () {
        // Arrange
        folder = await createScenario(['n.ipynb']);
        const options = createOptions('/api/notebooks/123?foo=bar');

        // Act
        const updated = await handler.getDefinitionWorkflow.onBeforeGetDefinition({}, folder, options);

        // Assert
        assert.equal(updated.pathTemplate, '/api/notebooks/123?foo=bar&format=ipynb', 'Should append &format=ipynb');
    });

    it('getDefinition should not duplicate format parameter if already present', async function () {
        // Arrange
        folder = await createScenario(['n.ipynb']);
        const options = createOptions('/api/notebooks/123?foo=bar&format=ipynb');

        // Act
        const updated = await handler.getDefinitionWorkflow.onBeforeGetDefinition({}, folder, options);

        // Assert
        assert.equal(updated.pathTemplate, '/api/notebooks/123?foo=bar&format=ipynb', 'Should remain unchanged');
    });

    it('getDefinition should add format=ipynb even when only .py file exists', async function () {
        // Arrange
        folder = await createScenario(['notebook1.py']);
        const options = createOptions('/api/notebooks/123');

        // Act
        const updated = await handler.getDefinitionWorkflow.onBeforeGetDefinition({}, folder, options);

        // Assert
        assert.equal(updated.pathTemplate, '/api/notebooks/123?format=ipynb', 'Should add format=ipynb for all notebooks, including .py');
    });

    it('getDefinition should throw FabricError when mixed .py and .ipynb files detected', async function () {
        // Arrange
        folder = await createScenario(['n.ipynb', 'n.py']);
        const options = createOptions('/api/notebooks/123');

        // Act & Assert
        await assert.rejects(
            () => handler.getDefinitionWorkflow.onBeforeGetDefinition({}, folder, options),
            (err: any) => err instanceof FabricError && err.nonLocalizedMessage === 'invalid-notebook-definition-mixed-formats',
            'Should throw FabricError for mixed formats'
        );
    });

    it('getDefinition should add format=ipynb when no notebook files found (unknown)', async function () {
        // Arrange
        folder = await createScenario(['readme.txt']);
        const options = createOptions('/api/notebooks/123');

        // Act
        const updated = await handler.getDefinitionWorkflow.onBeforeGetDefinition({}, folder, options);

        // Assert
        assert.equal(updated.pathTemplate, '/api/notebooks/123?format=ipynb', 'Should force ipynb for unknown format');
    });

    it('getDefinition should add format=ipynb when readDirectory throws (fallback)', async function () {
        // Arrange
        folder = vscode.Uri.file(path.join(os.tmpdir(), 'nb-handler-nonexistent', Date.now().toString(), Math.random().toString(36)));
        const options = createOptions('/api/notebooks/123');

        // Act
        const updated = await handler.getDefinitionWorkflow.onBeforeGetDefinition({}, folder, options);

        // Assert
        assert.equal(updated.pathTemplate, '/api/notebooks/123?format=ipynb', 'Should force ipynb on readDirectory failure');
    });

    it('getDefinition should derive from url when pathTemplate undefined and add format parameter', async function () {
        // Arrange
        folder = await createScenario(['n.ipynb']);
        const options = createOptions(undefined, '/api/notebooks/456');

        // Act
        const updated = await handler.getDefinitionWorkflow.onBeforeGetDefinition({}, folder, options);

        // Assert
        assert.equal(updated.pathTemplate, '/api/notebooks/456?format=ipynb', 'Should set pathTemplate based on url and add format');
    });

    it('getDefinition should set pathTemplate to ?format=ipynb when both pathTemplate and url absent', async function () {
        // Arrange
        folder = await createScenario(['n.ipynb']);
        const options = {} as IApiClientRequestOptions;

        // Act
        const updated = await handler.getDefinitionWorkflow.onBeforeGetDefinition({}, folder, options);

        // Assert
        assert.equal(updated.pathTemplate, '?format=ipynb', 'Should default to just ?format=ipynb');
    });

    // ---------------- updateDefinitionWorkflow.onBeforeUpdateDefinition ----------------

    it('updateDefinition should set definition.format to ipynb when only ipynb parts present and update options.body.definition', async function () {
        // Arrange
        const definition: IItemDefinition = {
            parts: [{ path: 'folder/notebook.ipynb' }] as any,
        } as IItemDefinition;
        const bodyCarrier: any = { definition };
        const options: IApiClientRequestOptions = { body: bodyCarrier } as IApiClientRequestOptions;

        // Act
        const updated = await handler.updateDefinitionWorkflow.onBeforeUpdateDefinition({}, definition, folder, options);

        // Assert
        assert.equal(definition.format, 'ipynb', 'Definition format should be set to ipynb');
        assert.strictEqual((updated.body as any).definition, definition, 'Body should carry updated definition reference');
    });

    it('updateDefinition should not set format when only py parts present', async function () {
        // Arrange
        const definition: IItemDefinition = {
            parts: [{ path: 'folder/notebook.py' }] as any,
        } as IItemDefinition;
        const options: IApiClientRequestOptions = {} as IApiClientRequestOptions;

        // Act
        await handler.updateDefinitionWorkflow.onBeforeUpdateDefinition({}, definition, folder, options);

        // Assert
        assert.notEqual(definition.format, 'ipynb', 'Definition format should not be forced for py');
        assert.equal(definition.format, undefined, 'Definition format should remain undefined');
    });

    it('updateDefinition should throw FabricError for mixed formats in parts', async function () {
        // Arrange
        const definition: IItemDefinition = {
            parts: [{ path: 'n.ipynb' }, { path: 'n.py' }] as any,
        } as IItemDefinition;
        const options: IApiClientRequestOptions = {} as IApiClientRequestOptions;

        // Act & Assert
        await assert.rejects(
            () => handler.updateDefinitionWorkflow.onBeforeUpdateDefinition({}, definition, folder, options),
            (err: any) => err instanceof FabricError && err.nonLocalizedMessage === 'invalid-notebook-definition-mixed-formats',
            'Should throw FabricError for mixed definition parts'
        );
    });

    it('updateDefinition should leave format unchanged when no parts (unknown)', async function () {
        // Arrange
        const definition: IItemDefinition = { parts: [] } as IItemDefinition;
        const options: IApiClientRequestOptions = {} as IApiClientRequestOptions;

        // Act
        await handler.updateDefinitionWorkflow.onBeforeUpdateDefinition({}, definition, folder, options);

        // Assert
        assert.equal(definition.format, undefined, 'Format should remain undefined for unknown');
    });
});
