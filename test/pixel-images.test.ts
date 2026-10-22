import {describe, expect, it} from 'vitest';
import {EditorStore, emptyDocument} from '../src/model/EditorStore';
import {makeExampleDocument} from '../src/model/exampleDocument';
import {deserializeDocument, serializeDocument} from '../src/io/serialization';
import {
    floodFillPixels,
    makePixelImage,
    paintPixelLine,
    PALETTES,
    samplePixel
} from '../src/shapes/pixelImages';
import type {Document, PixelImageShape} from '../src/model/types';

function setup() {
    const store = new EditorStore();
    const id = store.createPixelImage(8, 8, PALETTES['Pocket 4']);
    const shape = store.getSnapshot().document.shapes[0] as PixelImageShape;
    return {store, id, imageId: shape.components.image.imageId};
}

describe('pixel image document model', () => {
    it('creates data and a referencing shape atomically with one undo entry', () => {
        const {store, id, imageId} = setup();
        const document = store.getSnapshot().document;
        expect(document.images).toHaveLength(1);
        expect(document.images[0]).toMatchObject({id: imageId, width: 8, height: 8, pixels: Array(64).fill(-1)});
        expect(document.shapes[0].id).toBe(id);
        store.undo();
        expect(store.getSnapshot().document).toEqual(emptyDocument());
        expect(store.getSnapshot().canUndo).toBe(false);
        store.redo();
        expect(store.getSnapshot().document).toEqual(document);
    });
    it('shares pixels across linked shapes but keeps placement and display size independent', () => {
        const {store, id, imageId} = setup();
        const copyId = store.linkImageShape(id);
        const originalShape = store.getSnapshot().document.shapes[0];
        store.updateShape(copyId, shape => {
            if (shape.type === 'pixel-image') shape.components.rect.bounds = {x: 400, y: 500, width: 20, height: 90};
        });
        store.updatePixelImage(imageId, image => paintPixelLine(image, {x: 0, y: 0}, {x: 7, y: 7}, 2));
        const {document} = store.getSnapshot();
        expect(document.images).toHaveLength(1);
        expect(document.images[0].width).toBe(8);
        expect(document.images[0].height).toBe(8);
        expect(document.shapes[0]).toEqual(originalShape);
        for (const shape of document.shapes) {
            expect(shape.type).toBe('pixel-image');
            if (shape.type === 'pixel-image') {
                const image = document.images.find(item => item.id === shape.components.image.imageId)!;
                expect(image.id).toBe(imageId);
                expect(samplePixel(image, {x: 5, y: 5})).toBe(2);
            }
        }
        store.undo();
        expect(store.getSnapshot().document.images[0].pixels).toEqual(Array(64).fill(-1));
        expect(store.getSnapshot().document.shapes).toEqual(document.shapes);
    });
    it('groups a pixel stroke and restores shared pixels with undo, redo and cancellation', () => {
        const {store, id, imageId} = setup();
        store.linkImageShape(id);
        const before = store.getSnapshot().document;
        store.beginTransaction('stroke');
        for (let x = 0; x < 8; x++) store.updatePixelImage(imageId, image => paintPixelLine(image, {x, y: 2}, {x, y: 2}, 1));
        store.commitTransaction();
        const after = store.getSnapshot().document;
        expect(after.images[0].pixels.slice(16, 24)).toEqual(Array(8).fill(1));
        expect(before.images[0].pixels).toEqual(Array(64).fill(-1));
        store.undo(); expect(store.getSnapshot().document).toEqual(before);
        store.redo(); expect(store.getSnapshot().document).toEqual(after);
        store.undo();
        store.beginTransaction('cancel stroke');
        store.updatePixelImage(imageId, image => floodFillPixels(image, {x: 0, y: 0}, 3));
        store.cancelTransaction();
        expect(store.getSnapshot().document).toEqual(before);
        expect(store.getSnapshot().canRedo).toBe(true);
        store.beginTransaction('no-op stroke');
        store.updatePixelImage(imageId, image => paintPixelLine(image, {x: 0, y: 0}, {x: 0, y: 0}, 1));
        store.updatePixelImage(imageId, image => paintPixelLine(image, {x: 0, y: 0}, {x: 0, y: 0}, -1));
        store.commitTransaction();
        expect(store.getSnapshot().document).toEqual(before);
        expect(store.getSnapshot().canRedo).toBe(true);
    });
    it('reconciles creation of image data inside a transaction', () => {
        const store = new EditorStore();
        store.beginTransaction('create');
        store.createPixelImage(2, 3, PALETTES.Grayscale);
        store.commitTransaction();
        const result = store.getSnapshot().document;
        expect(result.images).toHaveLength(1);
        store.undo(); expect(store.getSnapshot().document).toEqual(emptyDocument());
        store.redo(); expect(store.getSnapshot().document).toEqual(result);
    });
    it('retains shared data when a shape is deleted and restores its reference on undo', () => {
        const {store, id} = setup();
        const copy = store.linkImageShape(id);
        const before = store.getSnapshot().document;
        store.removeShape(id);
        expect(store.getSnapshot().document.images).toEqual(before.images);
        expect(store.getSnapshot().document.shapes.map(shape => shape.id)).toEqual([copy]);
        store.undo(); expect(store.getSnapshot().document).toEqual(before);
    });
    it('round trips references and pixels without duplicating the shared data', () => {
        const {store, id, imageId} = setup();
        store.linkImageShape(id);
        store.updatePixelImage(imageId, image => floodFillPixels(image, {x: 0, y: 0}, 0));
        const document = deserializeDocument(store.toJSON());
        expect(document).toEqual(store.getSnapshot().document);
        expect(document.images).toHaveLength(1);
        const second = new EditorStore(document);
        const untouched = store.getSnapshot();
        second.updatePixelImage(imageId, image => paintPixelLine(image, {x: 0, y: 0}, {x: 7, y: 7}, -1));
        expect(store.getSnapshot()).toBe(untouched);
        expect(second.getSnapshot().document.images).not.toEqual(document.images);
    });
    it.each([
        (doc: Document) => { doc.images[0].pixels.pop(); },
        (doc: Document) => { doc.images[0].pixels[0] = 4; },
        (doc: Document) => { doc.images[0].pixels[0] = -2; },
        (doc: Document) => { doc.images[0].pixels[0] = 0.5; },
        (doc: Document) => { doc.images[0].width = 0; },
        (doc: Document) => { doc.images[0].height = 257; },
        (doc: Document) => { doc.images[0].palette = []; },
        (doc: Document) => { doc.images[0].palette[0] = 'invalid'; },
        (doc: Document) => { doc.images.push(doc.images[0]); },
        (doc: Document) => { doc.images = []; },
    ])('rejects invalid image data/references atomically (%#)', corrupt => {
        const {store} = setup();
        const before = store.getSnapshot();
        const invalid = structuredClone(before.document);
        corrupt(invalid);
        expect(() => store.loadJSON(JSON.stringify(invalid))).toThrow();
        expect(store.getSnapshot()).toBe(before);
    });
    it('rejects invalid edits and image ID changes without publishing them', () => {
        const {store, imageId} = setup();
        const before = store.getSnapshot();
        expect(() => store.updatePixelImage(imageId, image => { image.pixels[0] = Infinity; })).toThrow();
        expect(() => store.updatePixelImage(imageId, image => { image.id = 'changed'; })).toThrow();
        expect(() => store.updatePixelImage('missing', () => {})).toThrow();
        expect(store.getSnapshot()).toBe(before);
    });
    it('copies input palettes and validates dimensions before allocating pixels', () => {
        const palette = [...PALETTES['Pocket 4']];
        const image = makePixelImage(1, 1, palette);
        palette[0] = '#ffffff';
        expect(image.palette[0]).toBe('#0f380f');
        for (const size of [0, -1, 1.5, 257, Infinity, NaN]) expect(() => makePixelImage(size, 1, palette)).toThrow();
        expect(() => makePixelImage(1, 1, [])).toThrow();
    });
});

describe('pixel tools', () => {
    it.each([
        [{x: 0, y: 0}, {x: 4, y: 0}],
        [{x: 4, y: 0}, {x: 0, y: 0}],
        [{x: 2, y: 0}, {x: 2, y: 4}],
        [{x: 0, y: 0}, {x: 4, y: 4}],
        [{x: 4, y: 4}, {x: 0, y: 0}],
    ])('interpolates continuous pencil strokes in both directions (%#)', (start, end) => {
        const image = makePixelImage(5, 5, PALETTES['Pocket 4']);
        paintPixelLine(image, start, end, 0);
        expect(image.pixels.filter(pixel => pixel === 0)).toHaveLength(5);
        expect(samplePixel(image, start)).toBe(0);
        expect(samplePixel(image, end)).toBe(0);
        paintPixelLine(image, start, end, -1);
        expect(image.pixels).toEqual(Array(25).fill(-1));
    });
    it('fills only four-connected matching pixels, without wrapping across rows', () => {
        const image = makePixelImage(3, 3, PALETTES['Pocket 4']);
        image.pixels = [-1, 0, -1, 0, -1, 0, -1, 0, -1];
        floodFillPixels(image, {x: 0, y: 0}, 1);
        expect(image.pixels).toEqual([1, 0, -1, 0, -1, 0, -1, 0, -1]);
        image.pixels = [0, 0, -1, -1, 0, 0, 0, 0, 0];
        floodFillPixels(image, {x: 2, y: 0}, 2);
        expect(image.pixels).toEqual([0, 0, 2, -1, 0, 0, 0, 0, 0]);
    });
    it('fills a large transparent image iteratively and supports transparent fill', () => {
        const image = makePixelImage(256, 256, PALETTES.Grayscale);
        floodFillPixels(image, {x: 255, y: 255}, 0);
        expect(image.pixels.every(pixel => pixel === 0)).toBe(true);
        floodFillPixels(image, {x: 0, y: 0}, 0);
        floodFillPixels(image, {x: 0, y: 0}, -1);
        expect(image.pixels.every(pixel => pixel === -1)).toBe(true);
    });
    it('samples colors and transparency and rejects invalid drawing coordinates/colors', () => {
        const image = makePixelImage(2, 2, PALETTES['Pocket 4']);
        expect(samplePixel(image, {x: 0, y: 0})).toBe(-1);
        paintPixelLine(image, {x: 1, y: 1}, {x: 1, y: 1}, 2);
        expect(samplePixel(image, {x: 1, y: 1})).toBe(2);
        expect(samplePixel(image, {x: 2, y: 0})).toBeUndefined();
        expect(() => paintPixelLine(image, {x: 0, y: 0}, {x: 2, y: 0}, 0)).toThrow();
        expect(() => floodFillPixels(image, {x: -1, y: 0}, 0)).toThrow();
        expect(() => floodFillPixels(image, {x: 0, y: 0}, 4)).toThrow();
    });
});

describe('document migration', () => {
    it('migrates version 0 without changing shape IDs, ordering or geometry', () => {
        const current = makeExampleDocument();
        const legacy = {version: 0, title: current.title, shapes: current.shapes};
        const migrated = deserializeDocument(JSON.stringify(legacy));
        expect(migrated.shapes.map(shape => shape.id)).toEqual(current.shapes.map(shape => shape.id));
        expect(JSON.parse(serializeDocument(migrated)).version).toBe(7);
    });
    it('rejects unknown versions, unknown legacy fields, and image shapes in legacy documents', () => {
        const {store} = setup();
        const {shapes} = store.getSnapshot().document;
        expect(() => deserializeDocument(JSON.stringify({version: 0, title: 'bad', shapes}))).toThrow();
        expect(() => deserializeDocument('{"version":0,"title":"bad","shapes":[],"extra":true}')).toThrow();
        expect(() => deserializeDocument('{"version":99,"title":"bad","shapes":[],"images":[]}')).toThrow();
    });
});
