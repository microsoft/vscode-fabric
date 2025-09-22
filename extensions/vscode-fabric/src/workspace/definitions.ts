// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { ITenantSettings } from '../authentication';
import { FabricTreeNode } from '@microsoft/vscode-fabric-api';

/**
 * Display styles for the workspace tree view
 */
export enum DisplayStyle {
    list = 'ListView',
    tree = 'TreeView',
}

/**
 * Interface for root tree node provider
 */
export interface IRootTreeNodeProvider {
    create(workspace: ITenantSettings): FabricTreeNode;
    onDisplayStyleChanged: vscode.Event<void>;
    getCurrentDisplayStyle(): DisplayStyle;
}
