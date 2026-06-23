// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { DIContainer } from '@wessberg/di';

import { IFabricExtensionManager } from '@microsoft/vscode-fabric-api';

// APIs/Interfaces
import { IGitOperator } from '../apis/internal/fabricExtensionInternal';

// Other services
import { ILocalFolderManager } from '../ILocalFolderManager';

// Base class
import { FabricVsCodeExtensionBase, composeBaseContainer } from '../FabricVsCodeExtensionBase';

// Web-specific implementations
import { WebGitOperator } from './WebGitOperator';
import { WebLocalFolderManager } from './WebLocalFolderManager';

let app: FabricVsCodeWebExtension;

/**
 * Activates the web version of the Fabric extension.
 * This is a simplified entry point for browser-based VS Code environments.
 */
export async function activate(context: vscode.ExtensionContext): Promise<IFabricExtensionManager> {
    const container = await composeContainer(context);
    app = new FabricVsCodeWebExtension(container);
    return await app.activate();
}

export async function deactivate() {
    // Clean shutdown
    if (app) {
        await app.deactivate();
    }
}

/**
 * Web extension class. Inherits all activation logic from FabricVsCodeExtensionBase.
 * Web-specific implementations (git operator, folder manager) are provided via DI.
 */
export class FabricVsCodeWebExtension extends FabricVsCodeExtensionBase { }

async function composeContainer(context: vscode.ExtensionContext): Promise<DIContainer> {
    const container = composeBaseContainer(context);

    // Local folder and git operations (web-specific implementations)
    container.registerSingleton<ILocalFolderManager, WebLocalFolderManager>();
    container.registerSingleton<IGitOperator, WebGitOperator>();

    return container;
}
