import {expect, test, type Page} from '@playwright/test';
import {canvasPoint, clickCanvas, openEditor, property} from './helpers';

// The example document: "rect" at (0, 0) 100×100 and "circle" centered at (200, 200), radius 30.

const panel = (page: Page) => page.getByRole('region', {name: 'Selection properties'});
/** The panel element itself, found even while it is hidden from the accessibility tree. */
const panelElement = (page: Page) => page.locator('.selection-panel');

/** The panel's on-screen box must not cover the document rectangle from (x1, y1) to (x2, y2). */
async function expectBeside(page: Page, x1: number, y1: number, x2: number, y2: number) {
    const box = (await panel(page).boundingBox())!;
    const top = await canvasPoint(page, x1, y1);
    const bottom = await canvasPoint(page, x2, y2);
    expect(box.y + box.height <= top.y || box.y >= bottom.y).toBe(true);
}

test.describe('selection panel', () => {
    test('appears beside the selection only while something is selected', async ({page}) => {
        const errors = await openEditor(page);
        await clickCanvas(page, 400, 400);
        await expect(panel(page)).toHaveCount(0);
        await clickCanvas(page, 200, 200);
        await expect(panel(page)).toBeVisible();
        await expect(panel(page).getByRole('tab')).toHaveText(['Fill', 'Stroke', 'Corners']);
        await expectBeside(page, 170, 170, 230, 230);
        await page.keyboard.press('Escape');
        await clickCanvas(page, 400, 400);
        await expect(panel(page)).toHaveCount(0);
        expect(errors).toEqual([]);
    });

    test('fades out while a shape is dragged and returns beside it afterwards', async ({page}) => {
        await openEditor(page);
        await clickCanvas(page, 200, 200);
        // A plain click on the selected shape is not a drag: the panel stays.
        await clickCanvas(page, 200, 200);
        await expect(panel(page)).not.toHaveAttribute('data-hidden');

        const start = await canvasPoint(page, 200, 200);
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + 40, start.y + 30, {steps: 4});
        await expect(panelElement(page)).toHaveAttribute('data-hidden', 'true');
        await expect(panelElement(page)).toHaveCSS('opacity', '0');
        // While hidden it can't be clicked or reached by assistive technology.
        await expect(page.getByRole('region', {name: 'Selection properties'})).toHaveCount(0);
        await page.mouse.move(start.x + 80, start.y + 60, {steps: 4});
        await page.mouse.up();
        await expect(panel(page)).not.toHaveAttribute('data-hidden');
        await expect(panel(page)).toHaveCSS('opacity', '1');
        await expectBeside(page, 250, 230, 310, 290);

        // Escape during a drag cancels it, and the panel comes back too.
        const moved = await canvasPoint(page, 280, 260);
        await page.mouse.move(moved.x, moved.y);
        await page.mouse.down();
        await page.mouse.move(moved.x + 50, moved.y, {steps: 4});
        await expect(panelElement(page)).toHaveAttribute('data-hidden', 'true');
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(panel(page)).not.toHaveAttribute('data-hidden');
        await expect(property(page, 'Center x')).toHaveValue('280');
    });

    test('edits the same values as the inspector', async ({page}) => {
        await openEditor(page);
        await clickCanvas(page, 50, 50);
        await panel(page).getByRole('tab', {name: 'Stroke'}).click();
        const width = panel(page).getByRole('spinbutton', {name: 'Stroke width'});
        await width.fill('7');
        await width.press('Enter');
        await expect(property(page, 'Stroke width')).toHaveValue('7');
        await panel(page).getByRole('tab', {name: 'Corners'}).click();
        await panel(page).getByRole('spinbutton', {name: 'radius'}).fill('20');
        await panel(page).getByRole('spinbutton', {name: 'radius'}).press('Enter');
        await expect(property(page, 'radius')).toHaveValue('20');
        await page.keyboard.press('ControlOrMeta+z');
        await expect(property(page, 'radius')).toHaveValue('10');
        await expect(property(page, 'Stroke width')).toHaveValue('7');
    });

    test('tabs work from the keyboard', async ({page}) => {
        await openEditor(page);
        await clickCanvas(page, 50, 50);
        await panel(page).getByRole('tab', {name: 'Fill'}).focus();
        await page.keyboard.press('ArrowRight');
        await expect(panel(page).getByRole('tab', {name: 'Stroke'})).toBeFocused();
        await expect(panel(page).getByRole('tab', {name: 'Stroke'})).toHaveAttribute('aria-selected', 'true');
        await expect(panel(page).getByRole('spinbutton', {name: 'Stroke width'})).toBeVisible();
        await page.keyboard.press('End');
        await expect(panel(page).getByRole('tab', {name: 'Corners'})).toHaveAttribute('aria-selected', 'true');
    });

    test('aligns several shapes with the same commands as the context menu', async ({page}) => {
        await openEditor(page);
        await clickCanvas(page, 50, 50);
        await clickCanvas(page, 200, 200, {modifiers: ['Shift']});
        await expect(panel(page).getByRole('tab')).toHaveText(['Fill', 'Stroke', 'Align']);
        await panel(page).getByRole('tab', {name: 'Align'}).click();
        await expect(panel(page).getByRole('button', {name: 'Distribute Horizontally'})).toBeDisabled();
        await panel(page).getByRole('button', {name: 'Align Top'}).click();
        // The circle's top moves up to the rectangle's, y = 0. Clicking a shape already in the
        // selection keeps the selection, so clear it first.
        await clickCanvas(page, 400, 400);
        await clickCanvas(page, 200, 30);
        await expect(property(page, 'Center y')).toHaveValue('30');
        await page.keyboard.press('ControlOrMeta+z');
        await expect(property(page, 'Center y')).toHaveValue('200');
    });
});
