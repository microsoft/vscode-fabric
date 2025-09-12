import { Uri } from 'vscode';
import { IObservableArray } from '../collections/definitions';

/**
 * Information about a local project
 */
export interface ILocalProjectInformation {
    /**
     * The artifact type of the project
     */
    artifactType: string;

    /**
     * The path to the local project
     */
    path: Uri;
}

/**
 * Enumerates potential local project folder paths.
 * Expected to be consumed by the {@link ILocalProjectDiscovery} implementation.
 */
export interface IWorkspaceFolderProvider {
    /**
     * A collection of workspace folder paths
     */
    readonly workspaceFolders: IObservableArray<Uri>;
}

/**
 * Finds local projects.
 * Expected to be consumed by the {@link LocalProjectTreeDataProvider}
 */
export interface ILocalProjectDiscovery {
    /**
     * A collection of {@link ILocalProjectInformation}s discovered
     */
    readonly projects: IObservableArray<ILocalProjectInformation>;
}
