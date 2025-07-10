import * as assert from 'assert';

import { ActivityBar, CustomTreeSection, InputBox, ViewContent, VSBrowser, WebDriver, Workbench } from 'vscode-extension-tester';

const FABRIC_ACTIVITY_BAR_NAME = 'Microsoft Fabric';

describe('UITEST: Example E2E UI Tests', () => {
    let browser: VSBrowser;
    let driver: WebDriver;

    let fabricSidebBarViewContent: ViewContent;

    before(async () => {
        browser = VSBrowser.instance;
        driver = browser.driver;

        const activityBar = new ActivityBar();
        const fabricViewControl = await activityBar.getViewControl(FABRIC_ACTIVITY_BAR_NAME);
        assert.ok(fabricViewControl, `${FABRIC_ACTIVITY_BAR_NAME} ActivityView not found`);

        const fabricSidebBarView = await fabricViewControl.openView();
        fabricSidebBarViewContent =  fabricSidebBarView.getContent();
    });

    // Skip for now b/c requires auth that is not set up in the pipelines yet
    it.skip('Select Fabric Workspace', async function() {
        await new Workbench().executeCommand('Fabric: Select Fabric workspace');

        const input = await InputBox.create();
        await input.setText('VSCode-AppDev-E2ETest (DoNotDelete-UsedByAutomation)');
        await input.confirm();

        const section = await fabricSidebBarViewContent.getSection('Fabric Workspace') as CustomTreeSection;
        await section.expand();

        // wait for the items to load
        await waitForCondition(async () => (await section.getVisibleItems()).length > 0);

        const items = await section.getVisibleItems();
        const labels = await Promise.all(items.map((item) => item.getLabel()));
        assert.ok(labels.includes('Notebook (DoNotDelete)'));
    });

    it('Expected items are in Feedback view', async function() {
        const section = await fabricSidebBarViewContent.getSection('Feedback') as CustomTreeSection;
        await section.expand();

        // wait for the items to load
        await waitForCondition(async () => (await section.getVisibleItems()).length > 0, 15000);

        const items = await section.getVisibleItems();
        const labels = await Promise.all(items.map((item) => item.getLabel()));
        assert.ok(labels.includes('Report issue...'));
        assert.ok(labels.includes('View known issues...'));
    });
});

// TODO: how do we share code like this across UI tests in each extension? Do we just move this to
// the Util package???
// 
//  Utility function that waits for a condition to be false using polling.
async function waitForCondition(check: () => Promise<boolean>, timeout = 10000, pollingInterval = 500): Promise<void> {
    const start = Date.now();
    while (true) {
        try {
            if (await check()) {
                return;
            }
        } 
        catch (error: unknown) {
            if (error instanceof Error && 
                error.name !== 'ElementNotInteractableError') {
                throw error;
            }
        }
        if (Date.now() - start > timeout) {
            throw new Error('Timeout waiting for condition');
        }
        await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }
}