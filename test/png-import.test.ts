import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {convertImportedPixels, type DecodedPixels, inspectPng} from '../src/io/pngImport';
import {EditorStore} from '../src/model/EditorStore';
import {fillImageRegion, paintImageRegion, PALETTES, readImageRegion} from '../src/shapes/pixelImages';

function source(width: number, height: number, pixel = [10, 20, 30, 255]): DecodedPixels {
    return {width, height, rgba: new Uint8ClampedArray(Array.from({length: width * height}, () => pixel).flat())};
}
// Decode only this known, non-interlaced, 8-bit RGBA fixture for a model regression test.
// Production uses the browser decoder for all supported PNG encodings.
function terrainFixture(): DecodedPixels {
    const bytes = readFileSync(new URL('./fixtures/terrain.png', import.meta.url));
    const {width, height} = inspectPng(bytes);
    expect([...bytes.subarray(24, 29)]).toEqual([8, 6, 0, 0, 0]);
    const chunks: Buffer[] = [];
    for (let p = 8; p < bytes.length;) {
        const length = bytes.readUInt32BE(p);
        if (bytes.toString('ascii', p + 4, p + 8) === 'IDAT') chunks.push(bytes.subarray(p + 8, p + 8 + length));
        p += length + 12;
    }
    const raw = inflateSync(Buffer.concat(chunks)),
        stride = width * 4;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        for (let x = 0; x < stride; x++) {
            const i = y * stride + x;
            const a = x >= 4 ? rgba[i - 4] : 0,
                b = y ? rgba[i - stride] : 0,
                c = y && x >= 4 ? rgba[i - stride - 4] : 0;
            const prediction = a + b - c;
            const distances = [Math.abs(prediction - a), Math.abs(prediction - b), Math.abs(prediction - c)];
            const paeth = [a, b, c][distances.indexOf(Math.min(...distances))];
            rgba[i] = (raw[y * (stride + 1) + 1 + x] + [0, a, b, Math.floor((a + b) / 2), paeth][filter]) % 256;
        }
    }
    return {width, height, rgba};
}

describe('lossless PNG import', () => {
    it('preserves exact colors and treats invisible RGB values as transparency', () => {
        const input = source(3, 1);
        input.rgba.set([255, 0, 0, 255, 1, 2, 3, 0, 10, 20, 30, 255]);
        const {image} = convertImportedPixels(input, 'test');
        expect(image).toMatchObject({width: 3, height: 1, palette: ['#ff0000', '#0a141e'], pixels: [0, -1, 1]});
    });
    it('keeps completely transparent images editable', () => {
        const image = convertImportedPixels(source(2, 2, [9, 8, 7, 0]), 'empty').image;
        expect(image.palette).toEqual(['#000000']);
        expect(image.pixels).toEqual([-1, -1, -1, -1]);
    });
    it('splits non-square tiles in row-major order without losing edge pixels', () => {
        const input = source(4, 4);
        for (let i = 0; i < 16; i++) input.rgba[i * 4] = i;
        const result = convertImportedPixels(input, 'tiles', {width: 2, height: 1});
        expect(result.columns).toBe(2);
        expect(result.rows).toBe(4);
        expect(result.regions.map(region => readImageRegion(result.image, region).pixels)).toEqual([
            [0, 1],
            [2, 3],
            [4, 5],
            [6, 7],
            [8, 9],
            [10, 11],
            [12, 13],
            [14, 15],
        ]);
        expect(result.image.width).toBe(4);
        expect(result.image.height).toBe(4);
        expect(result.regions[7]).toEqual({x: 2, y: 3, width: 2, height: 1});
    });
    it('imports the supplied terrain PNG whole or as twenty exact 8×8 tiles', () => {
        const input = terrainFixture();
        const whole = convertImportedPixels(input, 'terrain').image;
        expect([whole.width, whole.height]).toEqual([160, 8]);
        expect(whole.palette).toHaveLength(15);
        expect(whole.palette.every(color => PALETTES['PICO-8'].includes(color))).toBe(true);
        expect(whole.pixels.filter(pixel => pixel === -1)).toHaveLength(189);
        const sliced = convertImportedPixels(input, 'terrain', {width: 8, height: 8});
        const tiles = sliced.regions.map(region => readImageRegion(sliced.image, region));
        expect(tiles).toHaveLength(20);
        for (let y = 0; y < 8; y++)
            for (let x = 0; x < 160; x++) {
                expect(tiles[Math.floor(x / 8)].pixels[y * 8 + (x % 8)]).toBe(whole.pixels[y * 160 + x]);
            }
    });
    it('rejects partial alpha, incomplete pixels, oversized images and uneven tile dimensions', () => {
        expect(() => convertImportedPixels(source(1, 1, [0, 0, 0, 128]), 'bad')).toThrow(/partially transparent/);
        expect(() => convertImportedPixels({...source(1, 1), rgba: new Uint8ClampedArray(3)}, 'bad')).toThrow(
            /pixel count/,
        );
        expect(() => convertImportedPixels(source(2049, 1), 'bad')).toThrow(/dimensions/);
        expect(() => convertImportedPixels(source(10, 8), 'bad', {width: 8, height: 8})).toThrow(/divide/);
    });
    it('allows 256 opaque colors but rejects a 257th', () => {
        const input = source(256, 2);
        for (let i = 0; i < 512; i++) input.rgba[i * 4] = i % 256;
        expect(convertImportedPixels(input, 'colors').image.palette).toHaveLength(256);
        input.rgba[256 * 4 + 1] = 99;
        expect(() => convertImportedPixels(input, 'too many')).toThrow(/more than 256/);
    });
    it('adds all tiles atomically with one undo, isolated from other documents', () => {
        const store = new EditorStore(),
            other = new EditorStore();
        store.setTitle('existing');
        const before = store.getSnapshot().document,
            untouched = other.getSnapshot();
        const ids = store.importPixelImages(terrainFixture(), 'terrain', {width: 8, height: 8});
        const after = store.getSnapshot().document;
        expect(ids).toHaveLength(20);
        expect(after.shapes).toHaveLength(20);
        expect(after.images).toHaveLength(1);
        expect(
            new Set(after.shapes.map(shape => shape.type === 'pixel-image' && shape.components.image.imageId)).size,
        ).toBe(1);
        store.undo();
        expect(store.getSnapshot().document).toEqual(before);
        store.redo();
        expect(store.getSnapshot().document).toEqual(after);
        expect(other.getSnapshot()).toBe(untouched);
        const loaded = new EditorStore();
        loaded.loadJSON(store.toJSON());
        expect(loaded.getSnapshot().document).toEqual(after);
        store.updatePixelImage(after.images[0].id, image => {
            image.pixels[0] = -1;
        });
        expect(store.getSnapshot().document.shapes).toEqual(after.shapes);
    });
    it('failed imports leave document, selection and redo unchanged', () => {
        const store = new EditorStore();
        store.setTitle('redo');
        store.undo();
        const before = store.getSnapshot();
        expect(() => store.importPixelImages(source(9, 8), 'bad', {width: 8, height: 8})).toThrow();
        expect(store.getSnapshot()).toBe(before);
        store.beginTransaction('active');
        expect(() => store.importPixelImages(source(8, 8), 'bad')).toThrow();
        store.cancelTransaction();
    });
    it('rejects bad signatures, oversized headers, truncated files and animation before decoding', () => {
        const png = readFileSync(new URL('./fixtures/terrain.png', import.meta.url));
        expect(() => inspectPng(new Uint8Array(40))).toThrow(/valid PNG/);
        expect(() => inspectPng(png.subarray(0, 40))).toThrow(/Truncated/);
        const deep = Buffer.from(png);
        deep[24] = 16;
        expect(() => inspectPng(deep)).toThrow(/16-bit/);
        const oversized = Buffer.from(png);
        oversized.writeUInt32BE(100000, 16);
        expect(() => inspectPng(oversized)).toThrow(/dimensions/);
        const animated = Buffer.from(png);
        animated.write('acTL', 37, 'ascii');
        expect(() => inspectPng(animated)).toThrow(/Animated/);
    });
});

describe('shared sprite sheets', () => {
    it('imports a large sheet once with small source regions', () => {
        const store = new EditorStore();
        const ids = store.importPixelImages(source(512, 256), 'large', {width: 32, height: 32});
        const doc = store.getSnapshot().document;
        expect(ids).toHaveLength(128);
        expect(doc.images).toHaveLength(1);
        expect(doc.images[0]).toMatchObject({width: 512, height: 256});
        expect(doc.images[0].pixels).toHaveLength(512 * 256);
        expect(doc.shapes[127]).toMatchObject({
            components: {
                image: {
                    imageId: doc.images[0].id,
                    source: {x: 480, y: 224, width: 32, height: 32},
                },
            },
        });
        expect(() => store.importPixelImages(source(512, 1), 'whole')).toThrow(/splitting/);
    });
    it('confines fill and pencil to a tile, updates overlapping copies, and undoes shared edits', () => {
        const store = new EditorStore();
        const [first, second] = store.importPixelImages(source(16, 8), 'sheet', {width: 8, height: 8});
        const copy = store.linkImageShape(second);
        const before = store.getSnapshot().document;
        const shape = before.shapes.find(s => s.id === second)!;
        if (shape.type !== 'pixel-image') throw new Error('Expected image');
        const {imageId, source: region} = shape.components.image;
        expect(before.shapes.find(s => s.id === copy)).toMatchObject({components: {image: shape.components.image}});
        store.beginTransaction('paint tile');
        store.updatePixelImage(imageId, image => fillImageRegion(image, region, {x: 0, y: 0}, -1));
        store.updatePixelImage(imageId, image => paintImageRegion(image, region, {x: 0, y: 0}, {x: 7, y: 7}, 0));
        store.commitTransaction();
        const after = store.getSnapshot().document;
        for (const s of after.shapes) {
            if (s.type !== 'pixel-image') throw new Error('Expected image');
            const tile = readImageRegion(after.images[0], s.components.image.source);
            expect(tile.pixels.filter(p => p === 0)).toHaveLength(s.id === first ? 64 : 8);
        }
        store.undo();
        expect(store.getSnapshot().document).toEqual(before);
        store.redo();
        expect(store.getSnapshot().document).toEqual(after);
        store.beginTransaction('cancel');
        store.updatePixelImage(imageId, image => fillImageRegion(image, region, {x: 1, y: 0}, 0));
        store.cancelTransaction();
        expect(store.getSnapshot().document).toEqual(after);
        const loaded = new EditorStore();
        loaded.loadJSON(store.toJSON());
        expect(loaded.getSnapshot().document).toEqual(after);
        expect(loaded.getSnapshot().document.images).toHaveLength(1);
    });
    it('moves and resizes a tile without changing its region, and keeps the sheet when deleting tiles', () => {
        const store = new EditorStore();
        const [id] = store.importPixelImages(source(16, 8), 'sheet', {width: 8, height: 8});
        const before = store.getSnapshot().document;
        store.updateShape(id, s => {
            if (s.type === 'pixel-image') s.components.rect.bounds = {x: 500, y: 400, width: 80, height: 40};
        });
        expect(store.getSnapshot().document.shapes[0].components).toMatchObject({
            image: before.shapes[0].type === 'pixel-image' && before.shapes[0].components.image,
        });
        expect(store.getSnapshot().document.images).toEqual(before.images);
        store.removeShape(id);
        expect(store.getSnapshot().document.images).toEqual(before.images);
        store.undo();
        expect(store.getSnapshot().document.shapes).toHaveLength(2);
    });
    it.each([
        {x: -1, y: 0, width: 8, height: 8},
        {x: 9, y: 0, width: 8, height: 8},
        {x: 0, y: 1, width: 8, height: 8},
        {x: 0.5, y: 0, width: 8, height: 8},
        {x: 0, y: 0, width: 0, height: 8},
    ])('rejects invalid source region %j atomically', region => {
        const store = new EditorStore();
        const [id] = store.importPixelImages(source(16, 8), 'sheet', {width: 8, height: 8});
        const before = store.getSnapshot();
        expect(() =>
            store.updateShape(id, s => {
                if (s.type === 'pixel-image') s.components.image.source = region;
            }),
        ).toThrow();
        expect(() => readImageRegion(before.document.images[0], region)).toThrow();
        expect(store.getSnapshot()).toBe(before);
    });
    it('migrates version-1 image references to full-image regions preserving IDs and pixels', () => {
        const store = new EditorStore();
        const id = store.createPixelImage(16, 16, PALETTES['PICO-8']);
        store.linkImageShape(id);
        const current = JSON.parse(store.toJSON());
        const legacy = {
            ...current,
            version: 1,
            pages: undefined,
            palettes: undefined,
            fonts: undefined,
            photos: undefined,
            settings: undefined,
            images: current.images.map((image: Record<string, unknown>) => {
                const {originalName, ...rest} = image;
                void originalName;
                return rest;
            }),
            shapes: current.shapes.map((shape: {pageId: string; components: {image: {source?: unknown}}}) => {
                const {pageId, ...rest} = shape;
                void pageId;
                return rest;
            }),
        };
        for (const shape of legacy.shapes) delete shape.components.image.source;
        const loaded = new EditorStore();
        loaded.loadJSON(JSON.stringify(legacy));
        expect(loaded.getSnapshot().document).toEqual(store.getSnapshot().document);
        expect(loaded.getSnapshot().document.images).toHaveLength(1);
        legacy.shapes[0].components.image.source = {x: 0, y: 0, width: 1, height: 1};
        expect(() => loaded.loadJSON(JSON.stringify(legacy))).toThrow();
    });
});
