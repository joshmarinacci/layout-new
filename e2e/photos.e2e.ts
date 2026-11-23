import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {expect, test, type Page} from '@playwright/test';
import {canvas, canvasCamera, canvasPoint, clickCanvas, inspector, layers, openEditor, property} from './helpers';

const fixture = (name: string) => join(import.meta.dirname, '..', 'test', 'fixtures', name);

async function runCommand(page: Page, text: string) {
    await page.keyboard.press('ControlOrMeta+Shift+p');
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
}

/** Imports a fixture through Import Image… and the file picker. */
async function importImage(page: Page, name: string) {
    const chooser = page.waitForEvent('filechooser');
    await runCommand(page, 'import image');
    await (await chooser).setFiles(fixture(name));
    await expect(inspector(page).getByText(/\d+ × \d+ px/)).toBeVisible();
}

const numberValue = async (page: Page, label: string) => Number(await property(page, label).inputValue());

async function shapeRect(page: Page) {
    return {
        x: await numberValue(page, 'x'),
        y: await numberValue(page, 'y'),
        width: await numberValue(page, 'width'),
        height: await numberValue(page, 'height'),
    };
}

/** The saved-documents list the web app keeps in IndexedDB. */
const storedDocuments = (page: Page) =>
    page.evaluate(
        () =>
            new Promise<{name: string; json: string}[] | undefined>((resolve, reject) => {
                const open = indexedDB.open('layout-new', 1);
                open.onsuccess = () => {
                    const request = open.result
                        .transaction('saved-documents')
                        .objectStore('saved-documents')
                        .get('records');
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                };
                open.onerror = () => reject(open.error);
            }),
    );

test.describe('photos', () => {
    test('import puts the photo upright in the middle of the view', async ({page}) => {
        const errors = await openEditor(page);
        await importImage(page, 'quadrants-rotated.jpg');
        // EXIF orientation 6 is applied: the 400×300 pixels show as a 300×400 portrait.
        await expect(inspector(page)).toContainText('300 × 400 px');
        const rect = await shapeRect(page);
        expect(rect.width / rect.height).toBeCloseTo(0.75, 2);
        const box = (await canvas(page).boundingBox())!;
        const camera = await canvasCamera(page);
        const middle = {x: camera.x + box.width / 2 / camera.zoom, y: camera.y + box.height / 2 / camera.zoom};
        expect(Math.abs(rect.x + rect.width / 2 - middle.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(rect.y + rect.height / 2 - middle.y)).toBeLessThanOrEqual(1);
        await expect(layers(page)).toContainText('quadrants-rotated (300 × 400, 1 use)');
        expect(errors).toEqual([]);
    });

    test('selecting a photo in the Assets tree shows its properties, and renames it', async ({page}) => {
        await openEditor(page);
        await importImage(page, 'quadrants.jpg');
        await layers(page)
            .getByRole('button', {name: /^quadrants \(400 × 300/})
            .click();
        const name = inspector(page).getByRole('textbox', {name: 'Asset name'});
        await expect(name).toHaveValue('quadrants');
        await expect(inspector(page)).toContainText('JPEG');
        await expect(inspector(page)).toContainText('1 shape');
        await name.fill('Beach');
        await name.press('Enter');
        await expect(layers(page)).toContainText('Beach (400 × 300, 1 use)');
        await inspector(page).getByRole('button', {name: 'Place on Canvas'}).click();
        await expect(layers(page)).toContainText('Beach (400 × 300, 2 uses)');
        // Selecting a shape on the canvas switches the panel back to shape properties.
        await clickCanvas(page, 50, 50);
        await expect(inspector(page).getByRole('textbox', {name: 'Shape name'})).toHaveValue('rect');
    });

    test('resizing keeps the proportions unless Shift is held', async ({page}) => {
        await openEditor(page);
        await importImage(page, 'quadrants.jpg');
        const before = await shapeRect(page);
        const corner = await canvasPoint(page, before.x + before.width, before.y + before.height);
        await page.mouse.move(corner.x, corner.y);
        await page.mouse.down();
        await page.mouse.move(corner.x - 60, corner.y - 5, {steps: 5});
        await page.mouse.up();
        await expect.poll(async () => (await shapeRect(page)).width).toBeLessThan(before.width);
        const locked = await shapeRect(page);
        expect(locked.width / locked.height).toBeCloseTo(4 / 3, 2);

        const corner2 = await canvasPoint(page, locked.x + locked.width, locked.y + locked.height);
        await page.mouse.move(corner2.x, corner2.y);
        await page.mouse.down();
        await page.keyboard.down('Shift');
        await page.mouse.move(corner2.x - 40, corner2.y + 30, {steps: 5});
        await page.mouse.up();
        await page.keyboard.up('Shift');
        await expect.poll(async () => (await shapeRect(page)).width).toBeLessThan(locked.width);
        const free = await shapeRect(page);
        expect(free.width / free.height).not.toBeCloseTo(4 / 3, 1);
    });

    test('crop mode: drag a handle, Enter applies, Escape cancels, one undo step', async ({page}) => {
        await openEditor(page);
        await importImage(page, 'quadrants.jpg');
        const rect = await shapeRect(page);
        const middle = await canvasPoint(page, rect.x + rect.width / 2, rect.y + rect.height / 2);
        const topLeft = await canvasPoint(page, rect.x, rect.y);

        await page.mouse.dblclick(middle.x, middle.y);
        await expect(inspector(page).getByRole('button', {name: 'Apply Crop'})).toBeVisible();
        await page.mouse.move(topLeft.x, topLeft.y);
        await page.mouse.down();
        await page.mouse.move(topLeft.x + 50, topLeft.y + 40, {steps: 5});
        await page.mouse.up();
        await expect.poll(() => numberValue(page, 'Crop x')).toBeGreaterThan(0);
        await page.keyboard.press('Escape');
        await expect(inspector(page).getByRole('button', {name: 'Crop…'})).toBeVisible();
        await expect(property(page, 'Crop x')).toHaveValue('0');
        await expect.poll(() => shapeRect(page)).toEqual(rect);

        await page.mouse.dblclick(middle.x, middle.y);
        await page.mouse.move(topLeft.x, topLeft.y);
        await page.mouse.down();
        await page.mouse.move(topLeft.x + 50, topLeft.y + 40, {steps: 5});
        await page.mouse.up();
        await page.keyboard.press('Enter');
        await expect(inspector(page).getByRole('button', {name: 'Crop…'})).toBeVisible();
        await expect.poll(() => numberValue(page, 'Crop x')).toBeGreaterThan(0);
        const cropX = await numberValue(page, 'Crop x');
        // The photo stays put: the visible part moved right by the same amount it was cropped.
        expect((await shapeRect(page)).x).toBeCloseTo(rect.x + (cropX * rect.width) / 400, 1);
        await page.keyboard.press('ControlOrMeta+z');
        await expect(property(page, 'Crop x')).toHaveValue('0');
        await page.keyboard.press('ControlOrMeta+Shift+z');
        await expect(property(page, 'Crop x')).toHaveValue(String(cropX));
    });

    test('duplicates share one stored photo, and a document over 5 MB saves and reopens', async ({page}) => {
        await openEditor(page);
        await importImage(page, 'quadrants.jpg');
        await page.keyboard.press('ControlOrMeta+d');
        await expect(layers(page)).toContainText('quadrants (400 × 300, 2 uses)');

        // A large photo of noise (which compresses badly), dropped onto the canvas.
        await page.evaluate(async () => {
            const width = 5000,
                height = 1000;
            const source = document.createElement('canvas');
            source.width = width;
            source.height = height;
            const ctx = source.getContext('2d')!;
            const pixels = ctx.createImageData(width, height);
            for (let i = 0; i < pixels.data.length; i += 65536)
                crypto.getRandomValues(pixels.data.subarray(i, Math.min(i + 65536, pixels.data.length)));
            for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 255;
            ctx.putImageData(pixels, 0, 0);
            const blob = await new Promise<Blob>(resolve => source.toBlob(value => resolve(value!), 'image/png'));
            const transfer = new DataTransfer();
            transfer.items.add(new File([blob], 'noise.png', {type: 'image/png'}));
            const target = document.querySelector('.canvas-viewport canvas')!;
            const box = target.getBoundingClientRect();
            target.dispatchEvent(
                new DragEvent('drop', {
                    dataTransfer: transfer,
                    clientX: box.left + 100,
                    clientY: box.top + 100,
                    bubbles: true,
                    cancelable: true,
                }),
            );
        });
        // Scaled down to 4096 px on its longest side.
        await expect(layers(page)).toContainText('noise (4096 × 819, 1 use)', {timeout: 20_000});

        await page.keyboard.press('ControlOrMeta+s');
        await expect.poll(async () => (await storedDocuments(page))?.length, {timeout: 20_000}).toBe(1);
        const [record] = (await storedDocuments(page))!;
        expect(record.json.length).toBeGreaterThan(5_000_000);
        const saved = JSON.parse(record.json) as {photos: {name: string}[]; shapes: {type: string}[]};
        expect(saved.photos.map(photo => photo.name).sort()).toEqual(['noise', 'quadrants']);
        expect(saved.shapes.filter(shape => shape.type === 'photo')).toHaveLength(3);
        expect(await page.evaluate(() => localStorage.getItem('layout-new:saved-documents:v1'))).toBeNull();

        await page.reload();
        await runCommand(page, 'open from browser');
        await page.getByRole('button', {name: 'Open', exact: true}).click();
        await expect(layers(page)).toContainText('noise (4096 × 819, 1 use)');
        await expect(layers(page)).toContainText('quadrants (400 × 300, 2 uses)');
    });

    test('documents saved to localStorage before the move to IndexedDB are kept', async ({page}) => {
        await page.addInitScript(() => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            const document = {
                version: 9,
                title: 'Old save',
                shapes: [],
                images: [],
                palettes: [],
                fonts: [],
                pages: [{id: 'page_1', name: 'Page 1', groups: []}],
            };
            localStorage.setItem(
                'layout-new:saved-documents:v1',
                JSON.stringify([
                    {id: 'old', name: 'Old save', savedAt: '2026-01-01T00:00:00Z', json: JSON.stringify(document)},
                ]),
            );
        });
        await openEditor(page);
        await runCommand(page, 'open from browser');
        await expect(page.getByText('Old save')).toBeVisible();
        expect((await storedDocuments(page))?.map(record => record.name)).toEqual(['Old save']);
        expect(await page.evaluate(() => localStorage.getItem('layout-new:saved-documents:v1'))).toBeNull();
    });

    test('pasting an image from the clipboard adds it, and SVG export embeds it', async ({page}) => {
        await openEditor(page);
        const bytes = [...readFileSync(fixture('quadrants.jpg'))];
        await canvas(page).focus();
        await page.evaluate(data => {
            const transfer = new DataTransfer();
            transfer.items.add(new File([new Uint8Array(data)], 'pasted.jpg', {type: 'image/jpeg'}));
            document
                .querySelector('.canvas-viewport canvas')!
                .dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
        }, bytes);
        await expect(layers(page)).toContainText('pasted (400 × 300, 1 use)');

        const download = page.waitForEvent('download');
        await runCommand(page, 'export selection as svg');
        const svg = readFileSync((await (await download).path())!, 'utf8');
        expect(svg.match(/<image /g)).toHaveLength(1);
        expect(svg).toContain('href="data:image/jpeg;base64,');
        expect(svg).toMatch(/<use href="#photo-[^"]+" transform="translate\(/);

        // PNG export rasterizes that SVG; an embedded photo must not taint the canvas.
        const pngDownload = page.waitForEvent('download');
        await runCommand(page, 'export selection as png');
        const png = readFileSync((await (await pngDownload).path())!);
        expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
        expect(png.readUInt32BE(16)).toBe(400);
        expect(png.readUInt32BE(20)).toBe(300);

        // So does the .json.png document, whose preview draws the decoded photo.
        const docDownload = page.waitForEvent('download');
        await runCommand(page, 'save as json png');
        const documentPng = await docDownload;
        expect(documentPng.suggestedFilename()).toMatch(/\.json\.png$/);
        // The document rides in a tEXt chunk keyed DrawDocument, as base64 JSON.
        const file = readFileSync((await documentPng.path())!);
        const keyword = file.indexOf('DrawDocument\0', 0, 'latin1');
        const length = file.readUInt32BE(keyword - 8);
        const payload = file.subarray(keyword + 'DrawDocument\0'.length, keyword + length).toString('latin1');
        const embedded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as {photos: {name: string}[]};
        expect(embedded.photos.map(photo => photo.name)).toEqual(['pasted']);
    });
});
