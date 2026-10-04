import {applyPatches, enablePatches, freeze, produceWithPatches, type Draft, type Patch} from 'immer';
import type {Document, Shape, PixelImageData} from './types';
import {convertImportedPixels, type DecodedPixels, type TileSize} from './pngImport';
import {makeImageShape, makePixelImage} from './pixelImages';
import {deserializeDocument, serializeDocument, validateDocument} from './serialization';

enablePatches();
interface HistoryEntry { label: string; patches: Patch[]; inversePatches: Patch[] }
export interface EditorSnapshot {
    readonly document: Document;
    readonly selectedId: string | null;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly transactionActive: boolean;
}
export const emptyDocument = (): Document => ({version: 3, images: [], title: 'Untitled', shapes: []});

export class EditorStore {
    private document: Document;
    private selectedId: string | null = null;
    private past: HistoryEntry[] = [];
    private future: HistoryEntry[] = [];
    private transaction: {label: string; before: Document; selectedId: string | null} | null = null;
    private listeners = new Set<() => void>();
    private snapshot!: EditorSnapshot;
    constructor(document: Document = emptyDocument(), private readonly historyLimit = 100) {
        if (!Number.isInteger(historyLimit) || historyLimit < 1) throw new Error('History limit must be positive');
        validateDocument(document);
        this.document = freeze(structuredClone(document), true);
        this.publish();
    }
    getSnapshot = (): EditorSnapshot => this.snapshot;
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    private publish() {
        if (this.selectedId && !this.document.shapes.some(s => s.id === this.selectedId)) this.selectedId = null;
        this.snapshot = Object.freeze({document: this.document, selectedId: this.selectedId,
            canUndo: !this.transaction && this.past.length > 0, canRedo: !this.transaction && this.future.length > 0,
            transactionActive: !!this.transaction});
        this.listeners.forEach(listener => listener());
    }
    select(id: string | null) {
        if (id !== null && !this.document.shapes.some(s => s.id === id)) throw new Error('Unknown shape');
        if (this.selectedId === id) return;
        this.selectedId = id; this.publish();
    }
    private requireIdle() { if (this.transaction) throw new Error('Finish the active transaction first'); }
    private record(entry: HistoryEntry) {
        if (!entry.patches.length) return;
        this.past.push(entry);
        if (this.past.length > this.historyLimit) this.past.shift();
        this.future = [];
    }
    edit(label: string, recipe: (document: Draft<Document>) => void) {
        const [next, patches, inversePatches] = produceWithPatches(this.document, recipe);
        validateDocument(next);
        if (!patches.length) return;
        this.document = next;
        if (!this.transaction) this.record({label, patches, inversePatches});
        this.publish();
    }
    setTitle(title: string) { this.edit('Document title', draft => { draft.title = title; }); }
    addShape(shape: Shape) {
        const copy = structuredClone(shape);
        this.edit('Add shape', draft => { draft.shapes.push(copy); });
    }
    updateShape(id: string, recipe: (shape: Draft<Shape>) => void) {
        this.edit('Edit shape', draft => {
            const shape = draft.shapes.find(s => s.id === id);
            if (!shape) throw new Error('Unknown shape');
            recipe(shape);
            if (shape.id !== id) throw new Error('Shape IDs cannot be edited');
        });
    }
    createPixelImage(width: number, height: number, palette: readonly string[]) {
        const image = makePixelImage(width, height, palette);
        const scale = Math.max(1, Math.floor(128 / Math.max(width, height)));
        const shape = makeImageShape(image.id, {x: 50, y: 50, width: width * scale, height: height * scale}, {x: 0, y: 0, width, height});
        this.edit('Create pixel image', draft => { draft.images.push(image); draft.shapes.push(shape); });
        return shape.id;
    }
    renameShape(id: string, name: string) {
        this.updateShape(id, shape => { shape.name = name; });
    }
    renamePixelImage(id: string, name: string) {
        this.edit('Rename image asset', draft => {
            const image = draft.images.find(item => item.id === id);
            if (!image) throw new Error('Unknown image asset');
            image.name = name;
        });
    }
    importPixelImages(source: DecodedPixels, name: string, tile?: TileSize, originalName: string | null = null) {
        this.requireIdle();
        const {image, regions, columns, rows} = convertImportedPixels(source, name, tile, originalName);
        const gap = 8;
        const scale = Math.max(1, Math.min(8, Math.floor(Math.min(
            (900 - gap * (columns - 1)) / source.width,
            (900 - gap * (rows - 1)) / source.height))));
        const shapes = regions.map((region, i) => makeImageShape(image.id, {
            x: 30 + (i % columns) * (region.width * scale + gap),
            y: 30 + Math.floor(i / columns) * (region.height * scale + gap),
            width: region.width * scale, height: region.height * scale,
        }, region, tile ? `${name} (${i % columns + 1}, ${Math.floor(i / columns) + 1})` : name));
        this.edit('Import PNG', draft => { draft.images.push(image); draft.shapes.push(...shapes); });
        return shapes.map(shape => shape.id);
    }
    linkImageShape(id: string) {
        const source = this.document.shapes.find(shape => shape.id === id);
        if (source?.type !== 'pixel-image') throw new Error('Expected an image shape');
        const bounds = source.components.rect.bounds;
        const shape = makeImageShape(source.components.image.imageId, {...bounds, x: bounds.x + 20, y: bounds.y + 20}, source.components.image.source, `${source.name} copy`);
        this.addShape(shape);
        return shape.id;
    }
    updatePixelImage(id: string, recipe: (image: Draft<PixelImageData>) => void) {
        this.edit('Edit pixels', draft => {
            const image = draft.images.find(item => item.id === id);
            if (!image) throw new Error('Unknown image');
            recipe(image);
            if (image.id !== id) throw new Error('Image IDs cannot be edited');
        });
    }
    removeShape(id: string) {
        this.edit('Delete shape', draft => {
            const index = draft.shapes.findIndex(s => s.id === id);
            if (index < 0) throw new Error('Unknown shape');
            draft.shapes.splice(index, 1);
        });
    }
    beginTransaction(label: string) {
        this.requireIdle();
        this.transaction = {label, before: this.document, selectedId: this.selectedId}; this.publish();
    }
    commitTransaction() {
        const transaction = this.transaction;
        if (!transaction) throw new Error('No active transaction');
        const final = this.document;
        // Reconcile once against the baseline: bounded by changed shapes/images, not pointer events.
        const [next, patches, inversePatches] = produceWithPatches(transaction.before, draft => {
            draft.title = final.title;
            draft.images.length = final.images.length;
            final.images.forEach((image, i) => {
                if (JSON.stringify(transaction.before.images[i]) !== JSON.stringify(image)) draft.images[i] = image;
            });
            draft.shapes.length = final.shapes.length;
            final.shapes.forEach((shape, i) => {
                if (JSON.stringify(transaction.before.shapes[i]) !== JSON.stringify(shape)) draft.shapes[i] = shape;
            });
        });
        this.transaction = null; this.document = next;
        this.record({label: transaction.label, patches, inversePatches}); this.publish();
    }
    cancelTransaction() {
        if (!this.transaction) throw new Error('No active transaction');
        this.document = this.transaction.before; this.selectedId = this.transaction.selectedId;
        this.transaction = null; this.publish();
    }
    undo() {
        this.requireIdle(); const entry = this.past.pop(); if (!entry) return;
        this.document = applyPatches(this.document, entry.inversePatches); this.future.push(entry); this.publish();
    }
    redo() {
        this.requireIdle(); const entry = this.future.pop(); if (!entry) return;
        this.document = applyPatches(this.document, entry.patches); this.past.push(entry); this.publish();
    }
    toJSON() { return serializeDocument(this.document); }
    loadJSON(json: string) { this.replaceDocument(deserializeDocument(json)); }
    replaceDocument(document: Document) {
        this.requireIdle(); validateDocument(document);
        this.document = freeze(structuredClone(document), true);
        this.selectedId = null; this.past = []; this.future = []; this.publish();
    }
}
