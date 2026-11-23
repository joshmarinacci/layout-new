import {describe, expect, it} from 'vitest';
import {EditorStore, emptyDocument} from '../src/model/EditorStore';
import type {Document, PhotoAsset, PhotoShape} from '../src/model/types';
import {deserializeDocument, serializeDocument, withoutUnusedPhotos} from '../src/io/serialization';
import {
    actualSize,
    cropTo,
    cropToFrame,
    panPhoto,
    photoPlacement,
    photoRect,
    resetCrop,
    wholePhoto,
} from '../src/shapes/photos';
import {bytesToBase64, photoMimeType, storedSize} from '../src/io/photoImport';
import {artworkSvg} from '../src/io/exportArtwork';
import {cropHandleAt, dragFrame} from '../src/editor/usePhotoCrop';

const photo = (overrides: Partial<PhotoAsset> = {}): PhotoAsset => ({
    id: 'photo-1',
    name: 'Beach',
    originalName: 'beach.jpg',
    mimeType: 'image/jpeg',
    width: 400,
    height: 300,
    data: btoa('not really a jpeg'),
    ...overrides,
});

const photoShapes = (store: EditorStore) =>
    store.getSnapshot().document.shapes.filter((shape): shape is PhotoShape => shape.type === 'photo');

describe('photo documents', () => {
    it('migrates version 9 documents to version 10 with no photos', () => {
        const v9: Record<string, unknown> = {...emptyDocument(), version: 9};
        delete v9.photos;
        const loaded = deserializeDocument(JSON.stringify(v9));
        expect(loaded.version).toBe(10);
        expect(loaded.photos).toEqual([]);
    });

    it('round trips photo assets and shapes', () => {
        const store = new EditorStore(emptyDocument());
        store.addPhotoShape(photo(), {x: 10, y: 20, width: 200, height: 150});
        const json = store.toJSON();
        const loaded = deserializeDocument(json);
        expect(loaded.photos).toEqual([photo()]);
        expect(loaded.shapes[0]).toMatchObject({
            type: 'photo',
            components: {photo: {photoId: 'photo-1', crop: {x: 0, y: 0, width: 400, height: 300}}},
        });
        expect(serializeDocument(loaded)).toBe(json);
    });

    it.each([
        ['an unsupported type', (doc: Document) => (doc.photos[0].mimeType = 'image/svg+xml' as 'image/png')],
        ['data that is not base64', (doc: Document) => (doc.photos[0].data = 'not base64!')],
        ['oversized dimensions', (doc: Document) => (doc.photos[0].width = 5000)],
        ['a duplicate photo ID', (doc: Document) => doc.photos.push({...doc.photos[0]})],
        [
            'a crop outside the photo',
            (doc: Document) => ((doc.shapes[0] as PhotoShape).components.photo.crop.width = 401),
        ],
        ['a missing photo', (doc: Document) => ((doc.shapes[0] as PhotoShape).components.photo.photoId = 'gone')],
        ['photo shapes in an older version', (doc: Document) => ((doc as {version: number}).version = 9)],
    ])('rejects %s', (_, corrupt) => {
        const store = new EditorStore(emptyDocument());
        store.addPhotoShape(photo(), {x: 0, y: 0, width: 400, height: 300});
        const doc = JSON.parse(store.toJSON()) as Document;
        corrupt(doc);
        expect(() => deserializeDocument(JSON.stringify(doc))).toThrow();
    });

    it('leaves photos no shape uses out of saved documents, but keeps them for undo', () => {
        const store = new EditorStore(emptyDocument());
        const id = store.addPhotoShape(photo(), {x: 0, y: 0, width: 400, height: 300});
        store.removeShape(id);
        expect(store.getSnapshot().document.photos).toHaveLength(1);
        expect(JSON.parse(store.toJSON()).photos).toEqual([]);
        expect(withoutUnusedPhotos(store.getSnapshot().document).photos).toEqual([]);
        store.undo();
        expect(photoShapes(store)).toHaveLength(1);
        expect(JSON.parse(store.toJSON()).photos).toHaveLength(1);
    });
});

describe('sharing one photo between shapes', () => {
    it('adds a photo once, however many shapes show it', () => {
        const store = new EditorStore(emptyDocument());
        store.addPhotoShape(photo(), {x: 0, y: 0, width: 40, height: 30});
        store.addPhotoShape(photo(), {x: 100, y: 0, width: 40, height: 30});
        expect(store.getSnapshot().document.photos).toHaveLength(1);
        expect(photoShapes(store)).toHaveLength(2);
    });

    it('duplicates shapes without copying the photo', () => {
        const store = new EditorStore(emptyDocument());
        const id = store.addPhotoShape(photo(), {x: 0, y: 0, width: 40, height: 30});
        const [copyId] = store.duplicateShapes([id]);
        const copy = photoShapes(store).find(shape => shape.id === copyId)!;
        expect(copy.components.photo.photoId).toBe('photo-1');
        expect(copy.components.rect.bounds).toMatchObject({x: 20, y: 20});
        expect(store.getSnapshot().document.photos).toHaveLength(1);
        expect(JSON.parse(store.toJSON()).photos).toHaveLength(1);
    });

    it('pastes into the same document without another copy of the photo', () => {
        const store = new EditorStore(emptyDocument());
        const id = store.addPhotoShape(photo(), {x: 0, y: 0, width: 40, height: 30});
        const shape = photoShapes(store).find(item => item.id === id)!;
        store.pasteShapes([shape], [], [], undefined, [photo()]);
        store.pasteShapes([shape], [], [], undefined, [photo()]);
        expect(photoShapes(store)).toHaveLength(3);
        expect(store.getSnapshot().document.photos).toHaveLength(1);
    });

    it('pastes into another document with the photo added once', () => {
        const source = new EditorStore(emptyDocument());
        const a = source.addPhotoShape(photo(), {x: 0, y: 0, width: 40, height: 30});
        const b = source.addPhotoShape(photo(), {x: 50, y: 0, width: 40, height: 30});
        const shapes = photoShapes(source).filter(shape => [a, b].includes(shape.id));
        const target = new EditorStore(emptyDocument());
        target.pasteShapes(shapes, [], [], undefined, source.getSnapshot().document.photos);
        expect(target.getSnapshot().document.photos).toEqual([photo()]);
        expect(photoShapes(target).map(shape => shape.components.photo.photoId)).toEqual(['photo-1', 'photo-1']);
        expect(() => new EditorStore(emptyDocument()).pasteShapes(shapes, [], [], undefined, [])).toThrow(
            'Clipboard is missing a photo',
        );
    });

    it('keeps photos added during a transaction when it commits', () => {
        const store = new EditorStore(emptyDocument());
        const id = store.addPhotoShape(photo(), {x: 0, y: 0, width: 40, height: 30});
        store.beginTransaction('Move');
        store.updateShape(id, shape => {
            if (shape.type === 'photo') shape.components.rect.bounds.x = 99;
        });
        store.commitTransaction();
        expect(store.getSnapshot().document.photos).toHaveLength(1);
        expect(photoShapes(store)[0].components.rect.bounds.x).toBe(99);
    });

    it('replaces the photo a shape shows, keeping its width and position', () => {
        const store = new EditorStore(emptyDocument());
        const id = store.addPhotoShape(photo(), {x: 5, y: 6, width: 200, height: 150});
        store.replacePhoto(id, photo({id: 'photo-2', width: 100, height: 200}));
        const shape = photoShapes(store)[0];
        expect(shape.components.rect.bounds).toEqual({x: 5, y: 6, width: 200, height: 400});
        expect(shape.components.photo).toEqual({
            kind: 'photo-reference',
            photoId: 'photo-2',
            crop: {x: 0, y: 0, width: 100, height: 200},
        });
    });

    it('only deletes photos that no shape shows', () => {
        const store = new EditorStore(emptyDocument());
        const id = store.addPhotoShape(photo(), {x: 0, y: 0, width: 40, height: 30});
        expect(() => store.deletePhoto('photo-1')).toThrow('still used');
        store.removeShape(id);
        store.deletePhoto('photo-1');
        expect(store.getSnapshot().document.photos).toEqual([]);
    });

    it('renames photos', () => {
        const store = new EditorStore(emptyDocument());
        store.addPhotoShape(photo(), {x: 0, y: 0, width: 40, height: 30});
        store.renamePhoto('photo-1', 'Sunset');
        expect(store.getSnapshot().document.photos[0].name).toBe('Sunset');
    });
});

describe('crop maths', () => {
    const asset = {width: 400, height: 300};
    // Shown at half size: 400×300 photo pixels over a 200×150 rect at (100, 100).
    const half = {rect: {x: 100, y: 100, width: 200, height: 150}, crop: wholePhoto(asset)};

    it('crops by moving the frame while the photo stays put', () => {
        const next = cropToFrame(half, asset, {x: 150, y: 125, width: 100, height: 50});
        expect(next.rect).toEqual({x: 150, y: 125, width: 100, height: 50});
        expect(next.crop).toEqual({x: 100, y: 50, width: 200, height: 100});
        expect(photoRect(next, asset)).toEqual(photoRect(half, asset));
    });

    it('keeps the frame inside the photo and at least one photo pixel big', () => {
        const outside = cropToFrame(half, asset, {x: 0, y: 0, width: 1000, height: 1000});
        expect(outside.rect).toEqual(half.rect);
        expect(outside.crop).toEqual(half.crop);
        const tiny = cropToFrame(half, asset, {x: 150, y: 150, width: -40, height: 0});
        expect(tiny.crop.width).toBeCloseTo(1);
        expect(tiny.crop.height).toBeCloseTo(1);
    });

    it('slides the photo under the frame, stopping at its edges', () => {
        const cropped = cropToFrame(half, asset, {x: 150, y: 125, width: 100, height: 50});
        const moved = panPhoto(cropped, asset, -10, 5);
        expect(moved.rect).toEqual(cropped.rect);
        expect(moved.crop).toEqual({x: 120, y: 40, width: 200, height: 100});
        expect(panPhoto(cropped, asset, -1000, -1000).crop).toMatchObject({x: 200, y: 200});
        expect(panPhoto(cropped, asset, 1000, 1000).crop).toMatchObject({x: 0, y: 0});
    });

    it('sets the crop from photo-pixel values, clamped', () => {
        const next = cropTo(half, asset, {x: 100, y: 50, width: 200, height: 100});
        expect(next.rect).toEqual({x: 150, y: 125, width: 100, height: 50});
        expect(cropTo(half, asset, {x: 300, y: 0, width: 500, height: 300}).crop).toEqual({
            x: 300,
            y: 0,
            width: 100,
            height: 300,
        });
    });

    it('resets the crop and sizes to one photo pixel per unit', () => {
        const cropped = cropToFrame(half, asset, {x: 150, y: 125, width: 100, height: 50});
        expect(resetCrop(cropped, asset)).toEqual(half);
        expect(actualSize(cropped).rect).toEqual({x: 150, y: 125, width: 200, height: 100});
    });

    it('drags only the edges a crop handle owns', () => {
        const frame = {x: 0, y: 0, width: 100, height: 80};
        expect(dragFrame(frame, {x: 1, y: 1}, 10, 5)).toEqual({x: 0, y: 0, width: 110, height: 85});
        expect(dragFrame(frame, {x: -1, y: 0}, 10, 5)).toEqual({x: 10, y: 0, width: 90, height: 80});
        expect(dragFrame(frame, {x: 0, y: -1}, 10, 5)).toEqual({x: 0, y: 5, width: 100, height: 75});
        expect(cropHandleAt(frame, {x: 101, y: 41}, 4)).toEqual({x: 1, y: 0});
        expect(cropHandleAt(frame, {x: 50, y: 40}, 4)).toBeNull();
    });

    it('places new photos centered, scaled down to fit 80% of the view', () => {
        expect(photoPlacement(asset, {x: 0, y: 0})).toEqual({x: -200, y: -150, width: 400, height: 300});
        expect(photoPlacement(asset, {x: 500, y: 500}, {width: 200, height: 1000})).toEqual({
            x: 420,
            y: 440,
            width: 160,
            height: 120,
        });
    });
});

describe('photo import', () => {
    it('caps the longest side at 4096 px, keeping proportions', () => {
        expect(storedSize(1200, 800)).toEqual({width: 1200, height: 800});
        expect(storedSize(8000, 6000)).toEqual({width: 4096, height: 3072});
        expect(storedSize(3000, 9000)).toEqual({width: 1365, height: 4096});
        expect(storedSize(100_000, 1)).toEqual({width: 4096, height: 1});
    });

    it('recognizes image types by MIME type or file extension', () => {
        expect(photoMimeType('image/webp', 'x')).toBe('image/webp');
        expect(photoMimeType('', 'IMG_0001.JPG')).toBe('image/jpeg');
        expect(photoMimeType('', 'scan.gif')).toBe('image/gif');
        expect(photoMimeType('image/svg+xml', 'logo.svg')).toBeNull();
        expect(photoMimeType('', 'notes.txt')).toBeNull();
    });

    it('base64-encodes large files', () => {
        const bytes = new Uint8Array(200_000).map((_, i) => (i * 7) % 256);
        expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    });
});

describe('photo SVG export', () => {
    it('embeds each photo once and clips every shape to its crop', () => {
        const store = new EditorStore(emptyDocument());
        const a = store.addPhotoShape(photo(), {x: 100, y: 100, width: 200, height: 150});
        store.addPhotoShape(photo(), {x: 400, y: 100, width: 400, height: 300});
        store.updateShape(a, shape => {
            if (shape.type !== 'photo') return;
            const next = cropToFrame({rect: shape.components.rect.bounds, crop: shape.components.photo.crop}, photo(), {
                x: 150,
                y: 125,
                width: 100,
                height: 50,
            });
            shape.components.rect.bounds = next.rect;
            shape.components.photo.crop = next.crop;
        });
        const doc = store.getSnapshot().document;
        const svg = artworkSvg(doc, doc.shapes);
        expect(svg.match(/<image /g)).toHaveLength(1);
        expect(svg).toContain(`href="data:image/jpeg;base64,${photo().data}"`);
        expect(svg.match(/<use href="#photo-photo-1"/g)).toHaveLength(2);
        // The cropped shape: the whole photo at half scale, clipped to the 100×50 frame.
        expect(svg).toContain('<rect x="150" y="125" width="100" height="50"/>');
        expect(svg).toContain('transform="translate(100 100) scale(0.5 0.5)"');
        expect(svg).toContain('transform="translate(400 100) scale(1 1)"');
    });
});
