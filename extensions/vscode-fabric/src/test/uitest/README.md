# End-to-end Tests
The E2E tests are based on UI testing that uses Selenium Webdriver to automated VS Code. The framework in use is ExTester: https://github.com/redhat-developer/vscode-extension-tester

## Run 
To run the UI tests use `npm run uitest` and make sure the monorepo is built (`npm run compile` from repo root) and of course the tests themselves (`npm run compile-tests`).

`npm run uitest` will package and install the extension into a test instance of VS Code. If the extension has not changed, you do not need to package/install every time, so you can use `npm run uitest-no-vsix-build` for a faster loop.

## Debug
You can debug UI tests using the respective "Debug UI Tests" launch configuration. You need to add Mocha's `.only` to the test you want to debug. 


## Page Object API
All APIs available are listed in the docs: https://github.com/redhat-developer/vscode-extension-tester/wiki/Page-Object-APIs

### Samples
The samples here are very helpful: https://github.com/redhat-developer/vscode-extension-tester-example/tree/main/src/ui-test