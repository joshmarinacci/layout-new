import {expect, type Locator, type Page} from '@playwright/test';

/** Open the editor on a fresh example document and fail the test on any page error. */
export async function openEditor(page: Page) {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('/');
    await expect(canvas(page)).toBeVisible();
    return errors;
}

export const canvas = (page: Page) => page.locator('.canvas-viewport canvas');
export const layers = (page: Page) => page.getByRole('complementary', {name: 'Layers & assets'});
export const inspector = (page: Page) => page.getByRole('complementary', {name: 'Properties'});
export const treeItem = (page: Page, name: string | RegExp) =>
    layers(page).getByRole('button', {name: typeof name === 'string' ? new RegExp(`^${name}$`) : name});

/** Click (or press) at a point in document coordinates on the canvas, at its current zoom. */
export async function canvasPoint(page: Page, x: number, y: number) {
    const box = await canvas(page).boundingBox();
    if (!box) throw new Error('Canvas is not visible');
    const zoom = box.width / 1024;
    return {x: box.x + x * zoom, y: box.y + y * zoom};
}

export async function clickCanvas(
    page: Page,
    x: number,
    y: number,
    {button, modifiers = []}: {button?: 'left' | 'right'; modifiers?: ('Shift' | 'Alt' | 'ControlOrMeta')[]} = {},
) {
    const point = await canvasPoint(page, x, y);
    // page.mouse.click has no modifiers option; hold the keys down around the click instead.
    for (const key of modifiers) await page.keyboard.down(key);
    await page.mouse.click(point.x, point.y, {button});
    for (const key of [...modifiers].reverse()) await page.keyboard.up(key);
}

export async function dragOnCanvas(page: Page, from: {x: number; y: number}, to: {x: number; y: number}) {
    const start = await canvasPoint(page, from.x, from.y);
    const end = await canvasPoint(page, to.x, to.y);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, {steps: 5});
    await page.mouse.move(end.x, end.y, {steps: 5});
    await page.mouse.up();
}

/** The value of a numeric property field in the inspector (x, y, width, …). */
export const property = (page: Page, label: string): Locator =>
    inspector(page).getByRole('spinbutton', {name: label, exact: true});

export const focusedText = (page: Page) => page.evaluate(() => document.activeElement?.textContent ?? '');
export const focusedLabel = (page: Page) =>
    page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '',
    );
