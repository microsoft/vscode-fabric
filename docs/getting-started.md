# Get started with Microsoft Fabric extension for VS Code
The Fabric Workspaces extension for VS Code allows you to view, manage a Fabric workspace within VS Code. The Fabric workspaces extension is the Core extension that enables Fabric App development extension to support additional feature to develop data function sets within your workspace.

## Sign in
When you open Microsoft Fabric extension in VS Code, you will see a sign in 

## Sign out 
You can sign out from the extension, by selecting **Accounts** and choose the user account using Fabric extension to sign out. 

## View all your workspaces and items 

You can view all your workspaces, items within it. You can filter the workspaces you want to work with in VS Code. 
![image](/docs/images/readme/manage-workspace.png)


### Switch tenants

You can enable Microsoft Fabric for your tenant  such that everyone in the tenant has access to Microsoft Fabric. You may have access to more than one tenant; you can switch between tenants using the tenant switcher.

1. Sign in to Microsoft Fabric.
2. Select **Switch tenant**.
![image](/docs/images/readme/switch-tenant.png)

  
### Create a Fabric item in VS Code

With the Microsoft Fabric Extension, you can now create, delete, and rename any Fabric item directly within VS Code, streamlining your workflow without ever leaving VS Code. You can also view the newly created items in [Fabric portal](https://app.fabric.microsoft.com).

1. Select your workspace in Fabric explorer. 
2. Slect **+** next to the workspace and create item.
3. Select the item type and provide a name to create the item in Fabric. 
4. Select **Open in Explorer** to open an item definition to edit in Visual studio code. Here is a list of ([supported items](/rest/api/fabric/articles/item-management/definitions/item-definition-overview)).

   ![image](/docs/images/readme/open-and-publish-notebook.gif)

## Command pallete  
You can access almost all Azure services provided by these extensions through the Command palette in VS Code. Press **F1**, then type in `Fabric` to find the available commands.
![image](/doc/images/readme/command-pallette.png)

## Open Fabric SQL database 
You can open your Fabric SQL database in MSSQL extension to design your schema and query your data. 
![image](/docs/images/readme/open-sql-database.gif)

## Git and version control 
- You can clone your git enabled workspace when opened in VS Code. 
- You can open item definition in VS Code, make your changes commit them to your repository using source control experience in VS Code. 

![image](/docs/images/readme/git-user-datafunction.gif)


## Manage trusted extensions

You can manage which account can use Fabric extension using **Manage trusted extension** settings in VS Code when you open your account in VS Code. You can enable and remove extension for that user account as needed. 

## Feedback 
Provide feature requests or report issues [here](https://github.com/microsoft/vscode-fabric/issues/new).

## Telemetry

This extension collects telemetry data, which is used to help understand how to
improve the product. For example, this usage data helps to debug issues, such as
slow start-up times, and to prioritize new features. You can disable telemetry
as described in the VS Code [disable telemetry reporting] documentation.

Please see [PRIVACY](privacy.md) for more information about data collection and use.

## Security reporting

Please see [SECURITY.md](SECURITY.md) for information on how to report security vulnerabilities.

## Code of Conduct

Please see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for information on our code of conduct.


## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos are subject to those third-party's policies.

