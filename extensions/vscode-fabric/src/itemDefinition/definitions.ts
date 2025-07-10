import * as vscode from 'vscode';

// Item definition public APIs as described https://learn.microsoft.com/en-us/rest/api/fabric/core/items/get-item-definition and https://learn.microsoft.com/en-us/rest/api/fabric/core/items/update-item-definition

export interface IItemDefinition {
    format?: string;
    parts: IItemDefinitionPart[];
}

export interface IItemDefinitionPart {
    path: string;
    payload: string;
    payloadType: PayloadType;
}

export enum PayloadType {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    InlineBase64 = 'InlineBase64',
}

// Extension API

export interface IItemDefinitionWriter {
    save(itemDefinition: IItemDefinition, destination: vscode.Uri): Promise<void>;
}