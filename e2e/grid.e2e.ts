import {expect, test, type Page} from '@playwright/test';
import {canvas, clickCanvas, dragOnCanvas, openEditor, property, treeItem} from './helpers';

// The example document: "rect" at (0, 0) 100×100 and "circle" centered at (200, 200), radius 30.

async function runCommand(page: Page, text: string) {
    await page.keyboard.press('ControlOrMeta+Shift+p');
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
}

const gridButton = (page: Page) =>
    page.getByRole('toolbar', {name: 'Canvas tools'}).getByRole('button', {name: 'Grid'});
const settings = (page: Page) => page.getByRole('dialog', {name: 'Document Settings'});

test.describe('grid', () => {
    test('is off by default and toggles from the toolbar and the keyboard', async ({page}) => {
        const errors = await openEditor(page);
        await expect(gridButton(page)).toHaveAttribute('aria-pressed', 'false');
        await expect(canvas(page)).toHaveAttribute('data-grid', 'off');
        await gridButton(page).click();
        await expect(gridButton(page)).toHaveAttribute('aria-pressed', 'true');
        await expect(canvas(page)).toHaveAttribute('data-grid', '10,lines');
        await canvas(page).focus();
        await page.keyboard.press("ControlOrMeta+'");
        await expect(gridButton(page)).toHaveAttribute('aria-pressed', 'false');
        await expect(canvas(page)).toHaveAttribute('data-grid', 'off');
        expect(errors).toEqual([]);
    });

    test('moves and resizes freely while off, and snap to the grid while on', async ({page}) => {
        await openEditor(page);
        await clickCanvas(page, 50, 50);
        await dragOnCanvas(page, {x: 50, y: 50}, {x: 83, y: 77});
        await expect(property(page, 'x')).toHaveValue('33');
        await expect(property(page, 'y')).toHaveValue('27');
        await page.keyboard.press('ControlOrMeta+z');

        await gridButton(page).click();
        await dragOnCanvas(page, {x: 50, y: 50}, {x: 83, y: 77});
        await expect(property(page, 'x')).toHaveValue('30');
        await expect(property(page, 'y')).toHaveValue('30');
        // Resizing snaps the dragged corner, (130, 130), to the nearest grid point.
        await dragOnCanvas(page, {x: 130, y: 130}, {x: 143, y: 136});
        await expect(property(page, 'width')).toHaveValue('110');
        await expect(property(page, 'height')).toHaveValue('110');
        await page.keyboard.press('ControlOrMeta+z');
        await expect(property(page, 'width')).toHaveValue('100');
    });

    test('a moved circle lands on the grid and a resized one keeps a whole-cell diameter', async ({page}) => {
        await openEditor(page);
        await gridButton(page).click();
        await settingsDialog(page);
        await setGrid(page, 'Document grid', '25', 'lines');
        await settings(page).getByRole('button', {name: 'Done'}).click();
        await clickCanvas(page, 200, 200);
        // The circle's box starts at (170, 170); dragging by (+12, +9) snaps it to (175, 175).
        await dragOnCanvas(page, {x: 200, y: 200}, {x: 212, y: 209});
        await expect(property(page, 'Center x')).toHaveValue('205');
        await expect(property(page, 'Center y')).toHaveValue('205');
        // Dragging the right handle (235, 205) out by 12 makes the radius 42; a whole number
        // of 25 unit cells across means a diameter of 75, so a radius of 37.5.
        await dragOnCanvas(page, {x: 235, y: 205}, {x: 247, y: 205});
        await expect(property(page, 'radius')).toHaveValue('37.5');
        await expect(property(page, 'Center x')).toHaveValue('205');
    });

    test('the settings dialog changes the document grid as one undo step, or cancels', async ({page}) => {
        await openEditor(page);
        await gridButton(page).click();
        await settingsDialog(page);
        await setGrid(page, 'Document grid', '25', 'dots');
        // Changes preview on the canvas while the dialog is open.
        await expect(canvas(page)).toHaveAttribute('data-grid', '25,dots');
        await settings(page).getByRole('button', {name: 'Done'}).click();
        await expect(settings(page)).toHaveCount(0);
        await expect(canvas(page)).toHaveAttribute('data-grid', '25,dots');
        await page.keyboard.press('ControlOrMeta+z');
        await expect(canvas(page)).toHaveAttribute('data-grid', '10,lines');

        await settingsDialog(page);
        await setGrid(page, 'Document grid', '50', 'hidden');
        await page.keyboard.press('Escape');
        await expect(settings(page)).toHaveCount(0);
        await expect(canvas(page)).toHaveAttribute('data-grid', '10,lines');
    });

    test('a page can override the document grid', async ({page}) => {
        await openEditor(page);
        await gridButton(page).click();
        await runCommand(page, 'new page');
        await expect(treeItem(page, 'Page 2')).toBeVisible();
        await settingsDialog(page);
        await expect(settings(page).getByText('Page “Page 2”')).toBeVisible();
        await settings(page).getByRole('checkbox', {name: 'Use a different grid on this page'}).check();
        await setGrid(page, 'Page grid', '40', 'dots');
        await settings(page).getByRole('button', {name: 'Done'}).click();
        await expect(canvas(page)).toHaveAttribute('data-grid', '40,dots');
        await treeItem(page, 'Page 1').click();
        await expect(canvas(page)).toHaveAttribute('data-grid', '10,lines');
        await treeItem(page, 'Page 2').click();
        await expect(canvas(page)).toHaveAttribute('data-grid', '40,dots');
    });
});

async function settingsDialog(page: Page) {
    await runCommand(page, 'document settings');
    await expect(settings(page)).toBeVisible();
}

async function setGrid(page: Page, label: string, size: string, style: 'lines' | 'dots' | 'hidden') {
    const input = settings(page).getByRole('spinbutton', {name: `${label} size`});
    await input.fill(size);
    await input.press('Tab');
    await settings(page)
        .getByRole('combobox', {name: `${label} style`})
        .selectOption(style);
}
