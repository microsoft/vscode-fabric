// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { OperationRequestType, IArtifactHandler, IArtifact, IApiClientRequestOptions, IApiClientResponse, Schema  } from '@microsoft/vscode-fabric-api';

export class DefaultArtifactHandler implements IArtifactHandler {

    public readonly artifactType: string = 'Default';

    public async onAfterRequest(action: OperationRequestType, artifact: IArtifact, response: IApiClientResponse): Promise<void> {
        if (OperationRequestType.select === (action & OperationRequestType.select)) {
            await this.onAfterSelect(artifact, response);
        }
    }

    private async onAfterSelect( artifact: IArtifact, response: IApiClientResponse): Promise<void> {
        const payload = response.bodyAsText ?? undefined;

        if (payload !== undefined) {
            const query = '?content=' + encodeURIComponent(payload);
            const furi = vscode.Uri.parse(
                Schema.fabricVirtualDoc + ':/'
                + artifact.displayName + '.json' + query);
            const doc = await vscode.workspace.openTextDocument(furi);
            await vscode.window.showTextDocument(doc, { preserveFocus: true });
        }
    }
}
