import {expect, test} from '@playwright/test';
import {
    canvas,
    clickCanvas,
    dragOnCanvas,
    focusedLabel,
    focusedText,
    inspector,
    layers,
    openEditor,
    property,
    treeItem,
} from './helpers';

// The example document: "rect" at (0, 0) 100×100 and "circle" centered at (200, 200), radius 30.

test.describe('app shell', () => {
    test('loads with every region and no errors', async ({page}) => {
        const errors = await openEditor(page);
        await expect(page.getByRole('banner')).toBeVisible();
        await expect(page.getByRole('tablist', {name: 'Open documents'})).toBeVisible();
        await expect(layers(page)).toBeVisible();
        await expect(page.getByRole('main')).toBeVisible();
        // The open document's tab panel sits inside <main>, labelled by the selected tab.
        const panel = page.getByRole('main').getByRole('tabpanel', {name: /test doc/});
        await expect(panel).toBeVisible();
        await expect(panel.getByRole('toolbar', {name: 'Canvas tools'})).toBeVisible();
        await expect(inspector(page)).toBeVisible();
        await expect(page.getByRole('contentinfo')).toBeVisible();
        await expect(page.getByRole('toolbar', {name: 'Canvas tools'})).toBeVisible();
        expect(errors).toEqual([]);
    });
});

test.describe('canvas selection and editing', () => {
    test('clicking a shape selects it in the tree and the inspector', async ({page}) => {
        await openEditor(page);
        await clickCanvas(page, 50, 50);
        await expect(inspector(page).getByRole('textbox', {name: 'Shape name'})).toHaveValue('rect');
        await expect(treeItem(page, 'rect')).toHaveAttribute('aria-current', 'true');
        await clickCanvas(page, 600, 600);
        await expect(inspector(page).getByText(/Select an\s+object/)).toBeVisible();
    });

    test('dragging a shape moves it, and undo puts it back', async ({page}) => {
        await openEditor(page);
        await clickCanvas(page, 200, 200);
        await expect(property(page, 'x')).toHaveCount(0); // circles have a center, not x/y bounds
        await clickCanvas(page, 50, 50);
        await expect(property(page, 'x')).toHaveValue('0');
        await dragOnCanvas(page, {x: 50, y: 50}, {x: 150, y: 110});
        await expect(property(page, 'x')).toHaveValue('100');
        await expect(property(page, 'y')).toHaveValue('60');
        await page.keyboard.press('ControlOrMeta+z');
        await expect(property(page, 'x')).toHaveValue('0');
        await expect(property(page, 'y')).toHaveValue('0');
        await page.keyboard.press('ControlOrMeta+Shift+z');
        await expect(property(page, 'x')).toHaveValue('100');
    });

    test('shift-click selects several shapes and offers alignment', async ({page}) => {
        await openEditor(page);
        await clickCanvas(page, 50, 50);
        await clickCanvas(page, 200, 200, {modifiers: ['Shift']});
        await expect(inspector(page).getByText('2 objects selected')).toBeVisible();
        await expect(page.getByRole('button', {name: 'Align'})).toBeVisible();
    });

    test('a property edit session (steps and typing) is one undo step', async ({page}) => {
        await openEditor(page);
        await treeItem(page, 'rect').click();
        await page.getByRole('button', {name: 'Increase width'}).click();
        await page.getByRole('button', {name: 'Increase width'}).click();
        await expect(property(page, 'width')).toHaveValue('102');
        const width = property(page, 'width');
        await width.fill('240');
        await width.press('Enter');
        await expect(width).toHaveValue('240');
        // The session began when the field was first used, so undo returns to the original width.
        await page.keyboard.press('ControlOrMeta+z');
        await expect(width).toHaveValue('100');
    });
});

test.describe('menus', () => {
    test('a canvas context menu works from the keyboard', async ({page}) => {
        await openEditor(page);
        await clickCanvas(page, 600, 300, {button: 'right'});
        const menu = page.getByRole('menu', {name: 'Page actions'});
        await expect(menu).toBeVisible();
        expect(await focusedText(page)).toBe('Rename page');
        await page.keyboard.press('ArrowDown'); // skips the disabled "Delete page"
        expect(await focusedText(page)).toBe('Export Page as PNG');
        await page.keyboard.press('End');
        expect(await focusedText(page)).toBe('New Image from PNG');
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
    });

    test('running a context menu item closes the menu', async ({page}) => {
        await openEditor(page);
        await clickCanvas(page, 600, 300, {button: 'right'});
        await page.getByRole('menuitem', {name: 'New Rectangle'}).click();
        await expect(page.getByRole('menu')).toBeHidden();
        await expect(inspector(page).getByRole('textbox', {name: 'Shape name'})).toHaveValue('Rectangle');
    });

    test('a context menu opened near the bottom stays on screen', async ({page}) => {
        await openEditor(page);
        const viewport = page.viewportSize()!;
        await page.mouse.click(viewport.width / 2, viewport.height - 40, {button: 'right'});
        const menu = page.getByRole('menu', {name: 'Page actions'});
        await expect(menu).toBeVisible();
        const box = (await menu.boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        await expect(page.getByRole('menuitem', {name: 'New Image from PNG'})).toBeInViewport();
    });

    test('a menubar dropdown opens, navigates and returns focus on Escape', async ({page}) => {
        await openEditor(page);
        const file = page.getByRole('button', {name: 'File'});
        await file.click();
        await expect(page.getByRole('menu', {name: 'File'})).toBeVisible();
        await page.keyboard.press('ArrowDown');
        expect(await focusedText(page)).toMatch(/^New Document/);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('menu', {name: 'File'})).toBeHidden();
        await expect(file).toBeFocused();
    });

    test('the command palette runs a command', async ({page}) => {
        await openEditor(page);
        await page.keyboard.press('ControlOrMeta+Shift+p');
        const palette = page.getByRole('dialog', {name: 'Command palette'});
        await expect(palette).toBeVisible();
        await page.keyboard.type('new circle');
        await page.keyboard.press('Enter');
        await expect(palette).toBeHidden();
        await expect(inspector(page).getByRole('textbox', {name: 'Shape name'})).toHaveValue('Circle');
    });
});

test.describe('layers tree', () => {
    test('double-click renames a page without collapsing it', async ({page}) => {
        await openEditor(page);
        await treeItem(page, 'Page 1').dblclick();
        const field = layers(page).getByRole('textbox', {name: 'Rename Page 1'});
        await expect(field).toBeVisible();
        await expect(treeItem(page, 'rect')).toBeVisible();
        await field.fill('Cover');
        await field.press('Enter');
        await expect(treeItem(page, 'Cover')).toBeVisible();
        await expect(treeItem(page, 'rect')).toBeVisible();
    });

    test('a single click opens and closes folders', async ({page}) => {
        await openEditor(page);
        await treeItem(page, 'Pages').click();
        await expect(treeItem(page, 'Page 1')).toBeHidden();
        await treeItem(page, 'Pages').click();
        await expect(treeItem(page, 'Page 1')).toBeVisible();
    });

    test('dragging a shape row reorders the layers', async ({page}) => {
        await openEditor(page);
        const order = () => layers(page).locator('.tree-label').allTextContents();
        expect((await order()).filter(name => ['rect', 'circle'].includes(name))).toEqual(['rect', 'circle']);
        await treeItem(page, 'circle').dragTo(treeItem(page, 'rect'), {targetPosition: {x: 20, y: 2}});
        await expect
            .poll(async () => (await order()).filter(name => ['rect', 'circle'].includes(name)))
            .toEqual(['circle', 'rect']);
    });

    test('switching tabs keeps an unfinished rename from the inspector', async ({page}) => {
        await openEditor(page);
        await page.getByRole('button', {name: 'File'}).click();
        await page.getByRole('menuitem', {name: /^New Document/}).click();
        const tabs = page.getByRole('tab');
        await expect(tabs).toHaveCount(2);
        await tabs.first().click();
        await treeItem(page, 'rect').click();
        const name = inspector(page).getByRole('textbox', {name: 'Shape name'});
        await name.fill('Header');
        await expect(name).toBeFocused();
        await tabs.nth(1).click();
        await tabs.first().click();
        await expect(treeItem(page, 'Header')).toBeVisible();
    });

    test('selecting the document shows its properties and renames it', async ({page}) => {
        await openEditor(page);
        await treeItem(page, /^Doc: /).click();
        const title = inspector(page).getByRole('textbox', {name: 'Title'});
        await expect(title).toHaveValue('test doc');
        await expect(inspector(page).locator('.prop-stats')).toContainText('Shapes2');
        await title.fill('Poster');
        await title.press('Enter');
        await expect(treeItem(page, 'Doc: Poster')).toBeVisible();
        await expect(page.getByRole('tab', {selected: true})).toContainText('Poster');
    });
});

test.describe('panels and toolbar', () => {
    test('side panels resize by dragging and by keyboard, and remember their width', async ({page}) => {
        await openEditor(page);
        const panel = layers(page);
        const before = (await panel.boundingBox())!.width;
        const handle = page.getByRole('separator', {name: 'Resize layers panel'});
        const box = (await handle.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + 200);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 80, box.y + 200, {steps: 8});
        await page.mouse.up();
        await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBe(Math.round(before + 80));
        await handle.focus();
        await page.keyboard.press('ArrowRight');
        await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBe(Math.round(before + 90));
        await page.reload();
        await expect
            .poll(async () => Math.round((await layers(page).boundingBox())!.width))
            .toBe(Math.round(before + 90));
    });

    test('the status bar hides and shows the side panels', async ({page}) => {
        await openEditor(page);
        await page.getByRole('button', {name: 'Hide tree panel'}).click();
        await expect(layers(page)).toBeHidden();
        await page.getByRole('button', {name: 'Show tree panel'}).click();
        await expect(layers(page)).toBeVisible();
        await page.getByRole('button', {name: 'Hide properties panel'}).click();
        await expect(inspector(page)).toBeHidden();
    });

    test('the canvas toolbar is one tab stop with arrow-key navigation', async ({page}) => {
        await openEditor(page);
        await treeItem(page, 'rect').click();
        const toolbar = page.getByRole('toolbar', {name: 'Canvas tools'});
        await expect(toolbar.locator('button[tabindex="0"]')).toHaveCount(1);
        await toolbar.getByRole('button', {name: 'Zoom out'}).focus();
        await page.keyboard.press('ArrowRight');
        expect(await focusedLabel(page)).toBe('Zoom in');
        await page.keyboard.press('End');
        expect(await focusedLabel(page)).toBe('Delete selected shapes');
        await page.keyboard.press('Home');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Enter');
        await expect(toolbar).toContainText('125%');
        await expect.poll(async () => Math.round((await canvas(page).boundingBox())!.width)).toBe(1280);
    });
});

test.describe('appearance', () => {
    test('the Appearance menu switches light and dark', async ({page}) => {
        await openEditor(page);
        await page.getByRole('button', {name: 'Appearance'}).click();
        await page.getByRole('menuitem', {name: 'Dark Theme'}).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await page.getByRole('button', {name: 'Appearance'}).click();
        await page.getByRole('menuitem', {name: 'System Theme'}).click();
        await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
    });

    test('theme settings apply live and persist across reloads', async ({page}) => {
        await openEditor(page);
        await page.getByRole('button', {name: 'Appearance'}).click();
        await page.getByRole('menuitem', {name: 'Theme Settings…'}).click();
        const dialog = page.getByRole('dialog', {name: 'Theme Settings'});
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', {name: 'Orange'}).click();
        await dialog.locator('[data-seg="mode"] button[data-v="dark"]').click();
        const accent = () => page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'));
        expect(await accent()).toBe('#f08c2e');
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        expect(await accent()).toBe('#f08c2e');
    });
});
