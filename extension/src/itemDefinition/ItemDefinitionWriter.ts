// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { IItemDefinition } from '@microsoft/vscode-fabric-api';
import { getItemDefinitionPathUri } from './pathUtils';
import { base64ToUint8Array } from '../bufferUtilities';

export interface IItemDefinitionWriter {
    save(itemDefinition: IItemDefinition, destination: vscode.Uri): Promise<void>;
}

export class ItemDefinitionWriter implements IItemDefinitionWriter {
    public constructor(private readonly fileSystem: vscode.FileSystem) {
    }

    async save(itemDefinition: IItemDefinition, destination: vscode.Uri): Promise<void> {
        if (itemDefinition && Array.isArray(itemDefinition.parts)) {
            for (let part of itemDefinition.parts) {
                if (part.payloadType === 'InlineBase64') {
                    const payload = base64ToUint8Array(part.payload);
                    const filePath = getItemDefinitionPathUri(part.path, destination);
                    await this.fileSystem.writeFile(filePath, payload);
                }
            }
        }
    }
}
