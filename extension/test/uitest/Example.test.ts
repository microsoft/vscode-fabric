// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';

import { ActivityBar, CustomTreeSection, InputBox, ViewContent, VSBrowser, WebDriver, Workbench, ViewControl } from 'vscode-extension-tester';
import { waitFor } from '../utilities/asyncWait';
import { TestEnvironmentConfig } from '../utilities/TestEnvironmentConfig';

// See https://github.com/redhat-developer/vscode-extension-tester/blob/main/docs/Taking%20Screenshots.md?plain=1#L11
import { before } from 'vscode-extension-tester';

const FABRIC_ACTIVITY_BAR_NAME = 'Microsoft Fabric';

describe('UITEST: Example E2E UI Tests', () => {
    let browser: VSBrowser;
    let driver: WebDriver;

    let fabricSidebBarViewContent: ViewContent;

    before(async () => {
        browser = VSBrowser.instance;
        driver = browser.driver;

        const activityBar = new ActivityBar();
        // Wait for the Fabric activity bar icon/view control to appear (extension may activate lazily)
        const fabricViewControl = await waitFor<ViewControl | undefined>(async () => {
            const vc = await activityBar.getViewControl(FABRIC_ACTIVITY_BAR_NAME);
            return vc ?? undefined;
        }, 15000, 500);
        assert.ok(fabricViewControl, `${FABRIC_ACTIVITY_BAR_NAME} ActivityView not found after waiting`);

        const fabricSidebBarView = await fabricViewControl.openView();
        fabricSidebBarViewContent = fabricSidebBarView.getContent();
    });

    it('Expected items are in Feedback view', async function () {
        const section = await waitFor<CustomTreeSection | undefined>(async () => {
            try {
                const s = await fabricSidebBarViewContent.getSection('Feedback') as CustomTreeSection | undefined;
                return s ?? undefined;
            }
            catch {
                return undefined;
            }
        }, 10000, 250);
        assert.ok(section, 'Feedback section not found');

        // Retry expand until it succeeds (handles intermittent ElementNotInteractable)
        await waitFor(async () => {
            try {
                await section!.expand();
                return true;
            }
            catch (e) {
                return undefined;
            }
        }, 5000, 250);

        // wait for feedback items to load
        await waitFor(async () => {
            try {
                const items = await section!.getVisibleItems();
                return items.length > 0 ? true : undefined;
            }
            catch {
                return undefined;
            }
        }, 20000, 500);

        const items = await section!.getVisibleItems();
        const labels = await Promise.all(items.map((item) => item.getLabel()));
        assert.ok(labels.includes('Report issue...'));
        assert.ok(labels.includes('View known issues...'));
    });
});

// Local waitForCondition removed in favor of shared helper in ../utilities/asyncWait
