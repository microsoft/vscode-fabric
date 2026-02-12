// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IArtifactHandler, IItemDefinition, IApiClientRequestOptions } from '@microsoft/vscode-fabric-api';
import { FabricError } from '@microsoft/vscode-fabric-util';

/**
 * Artifact handler that provides custom behavior for Notebook artifacts.
 * This handler manages notebook-specific operations such as format validation
 * and definition processing for both .ipynb and .py formats.
 */
// Centralized notebook format type to avoid duplication/typos
//  - 'ipynb'  : Jupyter .ipynb JSON file(s)
//  - 'py'     : Python script representation (single .py)
//  - 'mixed'  : Both formats detected (invalid state)
//  - 'unknown': No recognizable notebook files found
type NotebookFormat = 'ipynb' | 'py' | 'mixed' | 'unknown';

export class NotebookArtifactHandler implements IArtifactHandler {
    public readonly artifactType: string = 'Notebook';

    public getDefinitionWorkflow = {
        /**
         * Customizes the get definition request to ensure notebooks are retrieved in the appropriate format
         */
        async onBeforeGetDefinition(_artifact: any, folder?: vscode.Uri, options?: IApiClientRequestOptions): Promise<IApiClientRequestOptions> {
            // Detect existing format (if any) on disk within the target folder.
            // Behavior:
            //  - If folder is undefined (remote view) -> request ipynb format
            //  - If folder exists with only .py files -> allow py format (omit format parameter)
            //  - If folder exists with .ipynb or unknown -> request ipynb format
            //  - If both .py and .ipynb detected -> throw error (mixed formats not supported)
            let detectedFormat: NotebookFormat = 'unknown';
            
            if (folder) {
                try {
                    detectedFormat = await NotebookArtifactHandler.detectNotebookFormat(folder);
                }
                catch (err) {
                    // If detection fails we fallback to unknown, which will result in ipynb
                    detectedFormat = 'unknown';
                }
            }

            if (detectedFormat === 'mixed') {
                throw new FabricError(
                    vscode.l10n.t('Invalid Notebook definition contains both .py and .ipynb files.'),
                    'invalid-notebook-definition-mixed-formats'
                );
            }

            // Only skip adding format parameter if we explicitly detected .py files on disk
            // In all other cases (undefined folder, ipynb, or unknown), request ipynb format
            if (detectedFormat !== 'py') {
                if (!options) {
                    options = {};
                }
                const ptOriginal: string = options.pathTemplate ?? options.url ?? '';
                const hasFormatParam: boolean = /([?&])format=/.test(ptOriginal);
                if (!hasFormatParam) {
                    if (ptOriginal.includes('?')) {
                        options.pathTemplate = `${ptOriginal}&format=ipynb`;
                    }
                    else {
                        options.pathTemplate = `${ptOriginal}?format=ipynb`;
                    }
                }
            }
            return options || {};
        },
    };

    public updateDefinitionWorkflow = {
        /**
         * Validates notebook definition format and ensures consistency before updating
         */
        async onBeforeUpdateDefinition(_artifact: any, definition: IItemDefinition, folder?: vscode.Uri, options?: IApiClientRequestOptions): Promise<IApiClientRequestOptions> {
            const format = NotebookArtifactHandler.detectNotebookFormatFromDefinition(definition);
            if (format === 'mixed') {
                throw new FabricError(
                    vscode.l10n.t('Invalid Notebook definition contains both .py and .ipynb files.'),
                    'invalid-notebook-definition-mixed-formats'
                );
            }

            if (format === 'ipynb') {
                definition.format = 'ipynb';
                if (options?.body && typeof options.body === 'object' && 'definition' in options.body) {
                    // Ensure the body carries the updated definition reference
                    (options.body as any).definition = definition;
                }
            }

            return options || {};
        },
    };

    /**
     * Detect the notebook format present in the folder.
     * Recursively scans (limited depth) for .ipynb or .py files.
     * Returns:
     *  - 'ipynb' if only ipynb found
     *  - 'py' if only py found
     *  - 'mixed' if both found
     *  - 'unknown' if neither found
     */
    private static async detectNotebookFormat(folder: vscode.Uri): Promise<NotebookFormat> {
        let entries: readonly [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(folder);
        }
        catch {
            return 'unknown';
        }

        let hasIpynb = false;
        let hasPy = false;
        for (const [name, type] of entries) {
            if (type !== vscode.FileType.File) {
                continue; // Only consider top-level files
            }
            const lower = name.toLowerCase();
            if (lower.endsWith('.ipynb')) {
                hasIpynb = true;
            }
            else if (lower.endsWith('.py')) {
                hasPy = true;
            }
            if (hasIpynb && hasPy) {
                return 'mixed';
            }
        }
        // eslint-disable-next-line brace-style
        if (hasIpynb) { return 'ipynb'; }
        // eslint-disable-next-line brace-style
        if (hasPy) { return 'py'; }
        return 'unknown';
    }

    /**
     * Determine format from an item definition's parts (non-async helper).
     */
    private static detectNotebookFormatFromDefinition(definition: IItemDefinition): NotebookFormat {
        let hasIpynb: boolean = false;
        let hasPy: boolean = false;
        for (const part of definition.parts ?? []) {
            const p: string = part.path?.toLowerCase?.() ?? '';
            if (p.endsWith('.ipynb') || p.includes('.ipynb/')) {
                hasIpynb = true;
            }
            if (p.endsWith('.py') || p.includes('.py/')) {
                hasPy = true;
            }
            if (hasIpynb && hasPy) {
                return 'mixed';
            }
        }
        // eslint-disable-next-line brace-style
        if (hasIpynb) { return 'ipynb'; }
        // eslint-disable-next-line brace-style
        if (hasPy) { return 'py'; }

        return 'unknown';
    }
}
