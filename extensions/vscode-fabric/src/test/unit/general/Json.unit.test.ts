
import * as Mocha from 'mocha';

describe('JSON Tests', () => {
    it('JSON payload', () => {
        ///* eslint-disable*/
        let jsonResponse = {
            'objectId': 'd32bb87d-befb-4c1b-baac-b3ba29b393ff',
            'artifactType': 'UserDataFunction',
            'displayName': 'DFS1',
            'description': 'New Function Set',
            'folderObjectId': 'd0b59abd-ddcb-4c20-b9ae-df4c17e057fd',
            'provisionState': 'Active',
            'lastUpdatedDate': '2023-09-21T19:17:57.2238701',
            'capacityObjectId': 'B5E27B67-12B0-4A03-8D26-C4503032B345',
            'workloadPayload': {
                'runtime': 'DOTNET',
                'deployedCodeOrigin': 'User',
                'resources': [
                    {
                        'artifactId' : 'guid of resource',
                        'artifactType' : 'SqlDbNative',
                        'artifactName' : 'mysqldbnative',
                        'connectionString' : 'Data Source=tcp:renzo-srv-.....com,1433;Initial Catalog=somecat',
                    },
                    {
                        'artifactId' : 'guid of resource2',
                        'artifactType' : 'SqlDbNative',
                        'artifactName' : 'mysqldbnative2',
                        'connectionString' : 'Data Source=tcp:renzo-srv-.....com,1433;Initial Catalog=somecat2',
                    },
                ],
                'functions': [
                    {
                        'name': 'WordOfTheDay',
                        'httpMethod': [
                            'get',
                        ],
                        'path': 'api/WordOfTheDay',
                        'description': '',
                        'fabricUri': 'v1/workspaces/d0b59abd-ddcb-4c20-b9ae-df4c17e057fd/functionSets/d32bb87d-befb-4c1b-baac-b3ba29b393ff/userApi/api/WordOfTheDay',
                    },
                    {
                        'name': 'Function2',
                        'httpMethod': [
                            'get',
                        ],
                        'path': 'api/function2',
                        'description': '',
                        'fabricUri': 'v1/workspaces/d0b59abd-ddcb-4c20-b9ae-df4c17e057fd/functionSets/d32bb87d-befb-4c1b-baac-b3ba29b393ff/userApi/api/WordOfTheDay',
                    },
                ],
                'resourceStatus': 'Ready',
            },
            'payloadContentType': 'InlineJson',
            'extendedProperties': {},
            'artifactRelations': null,
            'ownerUserId': 22279,
            'ownerUser': {
                'id': 22279,
                'name': 'Calvin Hsia',
                'objectId': '95140315-e746-4b70-ae9c-8df25933cda6',
                'userPrincipalName': 'calvinh@microsoft.com',
            },
            'createdByUserId': 22279,
            'createdByUser': {
                'id': 22279,
                'name': 'Calvin Hsia',
                'objectId': '95140315-e746-4b70-ae9c-8df25933cda6',
                'userPrincipalName': 'calvinh@microsoft.com',
            },
            'modifiedByUserId': 22279,
            'modifiedByUser': {
                'id': 22279,
                'name': 'Calvin Hsia',
                'objectId': '95140315-e746-4b70-ae9c-8df25933cda6',
                'userPrincipalName': 'calvinh@microsoft.com',
            },
            'createdDate': '2023-09-21T19:17:52.4894531',
            'artifactPermissions': 0,
            'permissions': 71,
            'datamartRelations': null,
            'datasetRelations': null,
            'dataflowRelations': null,
            'parentArtifactObjectId': null,
        };
        let js = JSON.stringify(jsonResponse);

        let jsq = js.replace(/\\"/g, '"');
        let val = JSON.parse(jsq);

        console.log(JSON.stringify(val));

        console.log('testing JSON payload');

    });

});
