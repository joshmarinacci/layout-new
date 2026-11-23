import {expect, test} from '@playwright/test';
import {
    canvas,
    canvasCamera,
    canvasPoint,
    clickCanvas,
    dragOnCanvas,
    focusedLabel,
    focusedText,
    inspector,
    layers,
    openEditor,
    property,
    treeItem,
    wheelCanvas,
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
        await expect.poll(async () => (await canvasCamera(page)).zoom).toBe(1.25);
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

test.describe('infinite canvas', () => {
    test('the wheel pans in every direction and shapes stay hittable', async ({page}) => {
        await openEditor(page);
        const start = await canvasPoint(page, 50, 50);
        await wheelCanvas(page, start, {x: -300, y: -200});
        await expect.poll(async () => canvasCamera(page)).toEqual({x: -300, y: -200, zoom: 1});
        // The rect moved on screen with the pan, and clicks still find it.
        expect(await canvasPoint(page, 50, 50)).toEqual({x: start.x + 300, y: start.y + 200});
        await clickCanvas(page, 50, 50);
        await expect(inspector(page).getByRole('textbox', {name: 'Shape name'})).toHaveValue('rect');
    });

    test('pinch or Ctrl/⌘+wheel zooms around the cursor', async ({page}) => {
        await openEditor(page);
        const anchor = await canvasPoint(page, 200, 200);
        await wheelCanvas(page, anchor, {y: -400}, {zoom: true});
        await expect.poll(async () => (await canvasCamera(page)).zoom).toBeGreaterThan(1.5);
        const after = await canvasPoint(page, 200, 200);
        expect(after.x).toBeCloseTo(anchor.x, 0);
        expect(after.y).toBeCloseTo(anchor.y, 0);
        await expect(page.getByRole('group', {name: 'Canvas zoom controls'})).not.toContainText('100%');
    });

    test('zoom reaches 2% and 6400% and the buttons stop there', async ({page}) => {
        await openEditor(page);
        const center = await canvasPoint(page, 100, 100);
        for (let i = 0; i < 8; i++) await wheelCanvas(page, center, {y: 2000}, {zoom: true});
        const controls = page.getByRole('group', {name: 'Canvas zoom controls'});
        await expect(controls).toContainText('2%');
        await expect(controls.getByRole('button', {name: 'Zoom out'})).toBeDisabled();
        for (let i = 0; i < 16; i++) await wheelCanvas(page, center, {y: -2000}, {zoom: true});
        await expect(controls).toContainText('6400%');
        await expect(controls.getByRole('button', {name: 'Zoom in'})).toBeDisabled();
        await controls.getByRole('button', {name: 'Reset zoom'}).click();
        await expect(controls).toContainText('100%');
    });

    test('space-drag and middle-drag pan the canvas', async ({page}) => {
        await openEditor(page);
        const from = await canvasPoint(page, 300, 300);
        await canvas(page).focus();
        await page.keyboard.down('Space');
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x + 120, from.y + 80, {steps: 4});
        await page.mouse.up();
        await page.keyboard.up('Space');
        await expect.poll(async () => canvasCamera(page)).toEqual({x: -120, y: -80, zoom: 1});
        await page.mouse.move(from.x, from.y);
        await page.mouse.down({button: 'middle'});
        await page.mouse.move(from.x - 120, from.y - 80, {steps: 4});
        await page.mouse.up({button: 'middle'});
        await expect.poll(async () => canvasCamera(page)).toEqual({x: 0, y: 0, zoom: 1});
        // Panning never selects or moves anything.
        await expect(inspector(page).getByText(/Select an\s+object/)).toBeVisible();
    });

    test('new shapes appear in view far from the origin, and can be moved there', async ({page}) => {
        await openEditor(page);
        const middle = await canvasPoint(page, 300, 300);
        await wheelCanvas(page, middle, {x: -50_000, y: 30_000});
        await expect.poll(async () => canvasCamera(page)).toMatchObject({x: -50_000, y: 30_000});
        await page.getByRole('button', {name: 'Shape', exact: true}).click();
        await page.getByRole('menuitem', {name: 'New Rectangle'}).click();
        const x = Number(await property(page, 'x').inputValue());
        const y = Number(await property(page, 'y').inputValue());
        const box = (await canvas(page).boundingBox())!;
        // Centered on the visible canvas: the far side of the old 1024×1024 page.
        expect(x + 50).toBeCloseTo(-50_000 + box.width / 2, -1);
        expect(y + 40).toBeCloseTo(30_000 + box.height / 2, -1);
        await dragOnCanvas(page, {x: x + 50, y: y + 40}, {x: x + 150, y: y + 10});
        await expect(property(page, 'x')).toHaveValue(String(x + 100));
        await expect(property(page, 'y')).toHaveValue(String(y - 30));
    });

    test('zoom to fit brings far-apart content into view', async ({page}) => {
        await openEditor(page);
        await clickCanvas(page, 50, 50);
        const x = property(page, 'x');
        await x.fill('-20000');
        await x.press('Enter');
        const zoomToFit = page.getByRole('button', {name: 'Zoom to fit'});
        await zoomToFit.click();
        await expect.poll(async () => (await canvasCamera(page)).zoom).toBeLessThan(0.1);
        // Both ends of the content are on screen: canvasPoint throws for off-canvas points.
        await canvasPoint(page, -20_000, 0);
        await canvasPoint(page, 230, 230);
        await clickCanvas(page, 200, 200);
        await expect(inspector(page).getByRole('textbox', {name: 'Shape name'})).toHaveValue('circle');
    });

    test('each page keeps its own view', async ({page}) => {
        await openEditor(page);
        await wheelCanvas(page, await canvasPoint(page, 50, 50), {x: 400, y: 400});
        await expect.poll(async () => canvasCamera(page)).toEqual({x: 400, y: 400, zoom: 1});
        await page.getByRole('button', {name: 'Page', exact: true}).click();
        await page.getByRole('menuitem', {name: 'New Page'}).click();
        await expect.poll(async () => canvasCamera(page)).toEqual({x: 0, y: 0, zoom: 1});
        // Select something first: switching pages with an empty selection is a separate,
        // pre-existing bug (EditorStore.selectPage does not publish).
        await page.getByRole('button', {name: 'Shape', exact: true}).click();
        await page.getByRole('menuitem', {name: 'New Rectangle'}).click();
        await treeItem(page, /Page 1/).click();
        await expect.poll(async () => canvasCamera(page)).toEqual({x: 400, y: 400, zoom: 1});
    });
});
