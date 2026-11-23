import {applyPatches, type Draft, enablePatches, freeze, type Patch, produceWithPatches} from 'immer';
import {makeImageShape, makePixelImage} from '../shapes/pixelImages';
import {convertImportedPixels, type DecodedPixels, type TileSize} from '../io/pngImport';
import {deserializeDocument, serializeDocument, validateDocument} from '../io/serialization';
import type {Document, FontAsset, PixelImageData, Shape, VectorNetwork, VectorShape} from './types';
import {centeredBounds, type Point} from '../editor/camera';
import {reconcileRegions} from '../shapes/vectorNetworks';

enablePatches();

interface HistoryEntry {
    label: string;
    patches: Patch[];
    inversePatches: Patch[];
}

export interface EditorSnapshot {
    readonly document: Document;
    readonly selectedId: string | null;
    readonly selectedIds: readonly string[];
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly transactionActive: boolean;
    readonly selectedPageId: string;
}

export const emptyDocument = (): Document => ({
    version: 9,
    images: [],
    palettes: [],
    fonts: [],
    title: 'Untitled',
    shapes: [],
    pages: [{id: 'page_1', name: 'Page 1', groups: []}],
});

export class EditorStore {
    private document: Document;
    private selectedId: string | null = null;
    private selectedIds: string[] = [];
    private selectedPageId: string;
    private past: HistoryEntry[] = [];
    private future: HistoryEntry[] = [];
    private transaction: {
        label: string;
        before: Document;
        selectedId: string | null;
        selectedIds: string[];
    } | null = null;
    private listeners = new Set<() => void>();
    private snapshot!: EditorSnapshot;

    constructor(
        document: Document = emptyDocument(),
        private readonly historyLimit = 100,
    ) {
        if (!Number.isInteger(historyLimit) || historyLimit < 1) throw new Error('History limit must be positive');
        const normalized = structuredClone(document) as Document;
        const legacyPage = normalized.pages?.[0] ?? {
            id: 'page_1',
            name: 'Page 1',
            groups: [],
        };
        if (!normalized.pages?.length) normalized.pages = [legacyPage];
        normalized.shapes.forEach(shape => {
            if (!shape.pageId || !normalized.pages.some(page => page.id === shape.pageId)) shape.pageId = legacyPage.id;
        });
        validateDocument(normalized);
        this.document = freeze(normalized, true);
        this.selectedPageId = this.document.pages[0].id;
        this.publish();
    }

    getSnapshot = (): EditorSnapshot => this.snapshot;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    select(id: string | null) {
        if (id !== null && !this.document.shapes.some(s => s.id === id)) throw new Error('Unknown shape');
        const ids = id ? [id] : [];
        this.setSelection(ids);
    }

    setSelection(ids: readonly string[]) {
        const unique = [...new Set(ids)];
        if (unique.some(id => !this.document.shapes.some(shape => shape.id === id))) throw new Error('Unknown shape');
        const primary = unique.at(-1) ?? null;
        if (
            this.selectedId === primary &&
            this.selectedIds.length === unique.length &&
            this.selectedIds.every((id, index) => id === unique[index])
        )
            return;
        this.selectedIds = unique;
        this.selectedId = primary;
        this.publish();
    }

    toggleSelection(id: string) {
        if (!this.document.shapes.some(shape => shape.id === id)) throw new Error('Unknown shape');
        this.setSelection(
            this.selectedIds.includes(id) ? this.selectedIds.filter(item => item !== id) : [...this.selectedIds, id],
        );
    }

    selectPage(id: string) {
        if (!this.document.pages.some(page => page.id === id)) throw new Error('Unknown page');
        this.selectedPageId = id;
        this.setSelection([]);
    }

    createPage(name = `Page ${this.document.pages.length + 1}`) {
        const page = {id: crypto.randomUUID(), name, groups: []};
        this.edit('Create page', draft => {
            draft.pages.push(page);
        });
        this.selectedPageId = page.id;
        this.setSelection([]);
        this.publish();
        return page.id;
    }

    renamePage(id: string, name: string) {
        this.edit('Rename page', draft => {
            const page = draft.pages.find(item => item.id === id);
            if (!page) throw new Error('Unknown page');
            page.name = name;
        });
    }

    reorderPage(id: string, targetId: string, position: 'before' | 'after' = 'before') {
        if (id === targetId) return;
        this.edit('Reorder pages', draft => {
            const from = draft.pages.findIndex(page => page.id === id);
            const to = draft.pages.findIndex(page => page.id === targetId);
            if (from < 0 || to < 0) throw new Error('Unknown page');
            const [page] = draft.pages.splice(from, 1);
            const targetIndex = draft.pages.findIndex(item => item.id === targetId);
            draft.pages.splice(targetIndex + (position === 'after' ? 1 : 0), 0, page);
        });
    }

    reorderShapes(
        pageId: string,
        id: string,
        targetId: string,
        position: 'before' | 'after' = 'before',
        sourceGroupId: string | null = null,
        targetGroupId: string | null = sourceGroupId,
    ) {
        if (id === targetId) return;
        this.edit('Reorder shapes', draft => {
            const from = draft.shapes.findIndex(shape => shape.id === id && shape.pageId === pageId);
            const to = draft.shapes.findIndex(shape => shape.id === targetId && shape.pageId === pageId);
            if (from < 0 || to < 0) throw new Error('Shapes must be on the same page');
            const page = draft.pages.find(item => item.id === pageId);
            const parentGroup = (shapeId: string) =>
                page?.groups.find(group => group.shapeIds.includes(shapeId))?.id ?? null;
            if (parentGroup(id) !== sourceGroupId || parentGroup(targetId) !== targetGroupId)
                throw new Error('Shape layer changed during drag');
            const [shape] = draft.shapes.splice(from, 1);
            const targetIndex = draft.shapes.findIndex(item => item.id === targetId);
            draft.shapes.splice(targetIndex + (position === 'after' ? 1 : 0), 0, shape);
            if (sourceGroupId)
                page!.groups.find(item => item.id === sourceGroupId)!.shapeIds = page!.groups
                    .find(item => item.id === sourceGroupId)!
                    .shapeIds.filter(shapeId => shapeId !== id);
            if (targetGroupId) page!.groups.find(item => item.id === targetGroupId)!.shapeIds.push(id);
            for (const group of page?.groups ?? [])
                group.shapeIds = draft.shapes
                    .filter(item => item.pageId === pageId && group.shapeIds.includes(item.id))
                    .map(item => item.id);
        });
    }

    deletePage(id: string) {
        if (this.document.pages.length <= 1) throw new Error('A document must keep at least one page');
        const page = this.document.pages.find(item => item.id === id);
        if (!page) return;
        const target = this.document.pages.find(item => item.id !== id)!;
        this.edit('Delete page', draft => {
            for (const shape of draft.shapes) if (shape.pageId === id) shape.pageId = target.id;
            for (const item of draft.pages)
                if (item.id !== id) {
                    for (const group of page.groups)
                        item.groups.push(
                            ...group.shapeIds.map(shapeId => ({
                                id: crypto.randomUUID(),
                                name: group.name,
                                shapeIds: [shapeId],
                            })),
                        );
                }
            draft.pages = draft.pages.filter(item => item.id !== id);
        });
        if (this.selectedPageId === id) this.selectedPageId = target.id;
        this.publish();
    }

    createGroup(pageId: string, shapeIds: readonly string[], name = 'Group') {
        const ids = [...new Set(shapeIds)].filter(id => this.document.shapes.some(shape => shape.id === id));
        if (!ids.length) return null;
        const group = {id: crypto.randomUUID(), name, shapeIds: ids};
        this.edit('Group selection', draft => {
            for (const page of draft.pages)
                page.groups = page.groups.filter(item => !ids.some(id => item.shapeIds.includes(id)));
            for (const id of ids) {
                const shape = draft.shapes.find(item => item.id === id);
                if (shape) shape.pageId = pageId;
            }
            const page = draft.pages.find(item => item.id === pageId);
            if (!page) throw new Error('Unknown page');
            page.groups.push(group);
        });
        return group.id;
    }

    importVectorNetworks(shapes: readonly VectorShape[], pageId: string, groupName = 'Imported SVG') {
        this.requireIdle();
        if (!this.document.pages.some(page => page.id === pageId)) throw new Error('Unknown page');
        if (!shapes.length) return [];
        const copies = structuredClone(shapes);
        copies.forEach(shape => {
            shape.pageId = pageId;
        });
        const ids = copies.map(shape => shape.id);
        this.edit('Import SVG', draft => {
            draft.shapes.push(...copies);
            if (copies.length > 1)
                draft.pages
                    .find(page => page.id === pageId)!
                    .groups.push({
                        id: crypto.randomUUID(),
                        name: groupName,
                        shapeIds: ids,
                    });
        });
        this.setSelection(ids);
        return ids;
    }

    ungroup(id: string) {
        this.edit('Ungroup', draft => {
            for (const page of draft.pages) page.groups = page.groups.filter(group => group.id !== id);
        });
    }

    ungroupSelection(ids: readonly string[]) {
        const selected = new Set(ids);
        this.edit('Ungroup selection', draft => {
            for (const page of draft.pages) {
                page.groups = page.groups.flatMap(group => {
                    const remaining = group.shapeIds.filter(id => !selected.has(id));
                    return remaining.length
                        ? [
                              {
                                  ...group,
                                  shapeIds: remaining,
                              },
                          ]
                        : [];
                });
            }
        });
    }

    renameGroup(id: string, name: string) {
        this.edit('Rename group', draft => {
            const group = draft.pages.flatMap(page => page.groups).find(item => item.id === id);
            if (!group) throw new Error('Unknown group');
            group.name = name;
        });
    }

    moveShapesToPage(ids: readonly string[], pageId: string) {
        this.edit('Move shapes to page', draft => {
            if (!draft.pages.some(page => page.id === pageId)) throw new Error('Unknown page');
            for (const id of ids) {
                const shape = draft.shapes.find(item => item.id === id);
                if (shape) shape.pageId = pageId;
            }
            for (const page of draft.pages)
                page.groups = page.groups.filter(group => {
                    group.shapeIds = group.shapeIds.filter(id => !ids.includes(id));
                    return group.shapeIds.length > 0;
                });
        });
    }

    edit(label: string, recipe: (document: Draft<Document>) => void) {
        const [next, patches, inversePatches] = produceWithPatches(this.document, recipe);
        validateDocument(next);
        if (!patches.length) return;
        this.document = next;
        if (!this.transaction) this.record({label, patches, inversePatches});
        this.publish();
    }

    setTitle(title: string) {
        this.edit('Document title', draft => {
            draft.title = title;
        });
    }

    addShape(shape: Shape) {
        const copy = structuredClone(shape);
        copy.pageId = this.selectedPageId;
        this.edit('Add shape', draft => {
            draft.shapes.push(copy);
        });
    }

    duplicateShapes(ids: readonly string[]) {
        this.requireIdle();
        const originals = this.document.shapes.filter(shape => ids.includes(shape.id));
        const imageIds = new Map<string, string>();
        const copies = originals.map(original => {
            const copy = structuredClone(original);
            copy.id = crypto.randomUUID();
            copy.pageId = this.selectedPageId;
            copy.name = `${copy.name} copy`;
            if (copy.type === 'pixel-image' || copy.type === 'repeating-image') {
                const oldId = copy.components.image.imageId;
                let newId = imageIds.get(oldId);
                if (!newId) {
                    newId = crypto.randomUUID();
                    imageIds.set(oldId, newId);
                }
                copy.components.image.imageId = newId;
                copy.components.rect.bounds.x += 20;
                copy.components.rect.bounds.y += 20;
            } else if (copy.type === 'vector') {
                copy.components.network.origin.x += 20;
                copy.components.network.origin.y += 20;
            } else if (copy.type === 'circle') {
                copy.components.circle.center.x += 20;
                copy.components.circle.center.y += 20;
            } else if (copy.type === 'rectangle') {
                const bounds = copy.components.rect.bounds;
                bounds.x += 20;
                bounds.y += 20;
            } else if (copy.type === 'oval') {
                const bounds = copy.components.oval.bounds;
                bounds.x += 20;
                bounds.y += 20;
            } else if (copy.type === 'text') {
                copy.components.rect.bounds.x += 20;
                copy.components.rect.bounds.y += 20;
            }
            return copy;
        });
        if (!copies.length) return [];
        const sourceImages = this.document.images
            .filter(image => imageIds.has(image.id))
            .map(image => {
                const copy = structuredClone(image);
                copy.id = imageIds.get(image.id)!;
                copy.name += ' copy';
                return copy;
            });
        this.edit('Duplicate selection', draft => {
            draft.images.push(...sourceImages);
            draft.shapes.push(...copies);
        });
        this.setSelection(copies.map(shape => shape.id));
        return copies.map(shape => shape.id);
    }

    pasteShapes(shapes: readonly Shape[], images: readonly PixelImageData[], fonts: readonly FontAsset[] = []) {
        this.requireIdle();
        const referencedImageIds = new Set(
            shapes
                .filter(
                    (
                        shape,
                    ): shape is Extract<
                        Shape,
                        {
                            type: 'pixel-image' | 'repeating-image';
                        }
                    > => shape.type === 'pixel-image' || shape.type === 'repeating-image',
                )
                .map(shape => shape.components.image.imageId),
        );
        const requiredImages = images.filter(image => referencedImageIds.has(image.id));
        const imageMap = new Map(requiredImages.map(image => [image.id, crypto.randomUUID()]));
        const imageCopies = requiredImages.map(image => ({
            ...structuredClone(image),
            id: imageMap.get(image.id)!,
        }));
        const referencedFontIds = new Set(
            shapes
                .filter((shape): shape is Extract<Shape, {type: 'text'}> => shape.type === 'text')
                .map(shape => shape.components.text.fontId)
                .filter((id): id is string => !!id),
        );
        const requiredFonts = fonts.filter(font => referencedFontIds.has(font.id));
        const fontMap = new Map(requiredFonts.map(font => [font.id, crypto.randomUUID()]));
        const fontCopies = requiredFonts.map(font => ({...structuredClone(font), id: fontMap.get(font.id)!}));
        const copies = shapes.map(original => {
            const copy = structuredClone(original);
            copy.id = crypto.randomUUID();
            copy.name = `${copy.name} copy`;
            copy.pageId = this.selectedPageId;
            if (copy.type === 'pixel-image' || copy.type === 'repeating-image') {
                const mapped = imageMap.get(copy.components.image.imageId);
                if (!mapped) throw new Error('Clipboard is missing a pixel image asset');
                copy.components.image.imageId = mapped;
            }
            if (copy.type === 'text' && copy.components.text.fontId) {
                const mapped = fontMap.get(copy.components.text.fontId);
                if (!mapped) throw new Error('Clipboard is missing a font asset');
                copy.components.text.fontId = mapped;
            }
            if (copy.type === 'vector') {
                copy.components.network.origin.x += 20;
                copy.components.network.origin.y += 20;
            } else if (copy.type === 'circle') {
                copy.components.circle.center.x += 20;
                copy.components.circle.center.y += 20;
            } else if (copy.type === 'rectangle') {
                copy.components.rect.bounds.x += 20;
                copy.components.rect.bounds.y += 20;
            } else if (copy.type === 'oval') {
                copy.components.oval.bounds.x += 20;
                copy.components.oval.bounds.y += 20;
            } else {
                copy.components.rect.bounds.x += 20;
                copy.components.rect.bounds.y += 20;
            }
            return copy;
        });
        if (!copies.length) return [];
        this.edit('Paste shapes', draft => {
            draft.images.push(...imageCopies);
            draft.fonts.push(...fontCopies);
            draft.shapes.push(...copies);
        });
        this.setSelection(copies.map(shape => shape.id));
        return copies.map(shape => shape.id);
    }

    updateShape(id: string, recipe: (shape: Draft<Shape>) => void) {
        this.edit('Edit shape', draft => {
            const shape = draft.shapes.find(s => s.id === id);
            if (!shape) throw new Error('Unknown shape');
            recipe(shape);
            if (shape.id !== id) throw new Error('Shape IDs cannot be edited');
        });
    }

    updateVector(id: string, recipe: (network: VectorNetwork) => void, baseline?: VectorNetwork) {
        const shape = this.document.shapes.find(s => s.id === id);
        if (shape?.type !== 'vector') throw new Error('Expected a vector shape');
        const before = baseline ?? shape.components.network;
        this.updateShape(id, draft => {
            if (draft.type !== 'vector') return;
            recipe(draft.components.network);
            reconcileRegions(draft.components.network, before);
        });
    }

    /** Creates a pixel image and a shape showing it, centered on `center` when given. */
    createPixelImage(width: number, height: number, palette: readonly string[], center?: Point) {
        const image = makePixelImage(width, height, palette);
        const scale = Math.max(1, Math.floor(128 / Math.max(width, height)));
        const shape = makeImageShape(
            image.id,
            center
                ? centeredBounds(center, width * scale, height * scale)
                : {x: 50, y: 50, width: width * scale, height: height * scale},
            {x: 0, y: 0, width, height},
        );
        shape.pageId = this.selectedPageId;
        this.edit('Create pixel image', draft => {
            draft.images.push(image);
            draft.shapes.push(shape);
        });
        return shape.id;
    }

    addFontAsset(font: FontAsset) {
        if (this.document.fonts.some(item => item.family.toLocaleLowerCase() === font.family.toLocaleLowerCase()))
            throw new Error('This Google Fonts family is already in the document');
        this.edit('Add Google Font', draft => {
            draft.fonts.push(structuredClone(font));
        });
    }

    renameShape(id: string, name: string) {
        this.updateShape(id, shape => {
            shape.name = name;
        });
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
        const scale = Math.max(
            1,
            Math.min(
                8,
                Math.floor(
                    Math.min((900 - gap * (columns - 1)) / source.width, (900 - gap * (rows - 1)) / source.height),
                ),
            ),
        );
        const shapes = regions.map((region, i) =>
            makeImageShape(
                image.id,
                {
                    x: 30 + (i % columns) * (region.width * scale + gap),
                    y: 30 + Math.floor(i / columns) * (region.height * scale + gap),
                    width: region.width * scale,
                    height: region.height * scale,
                },
                region,
                tile ? `${name} (${(i % columns) + 1}, ${Math.floor(i / columns) + 1})` : name,
            ),
        );
        shapes.forEach(shape => {
            shape.pageId = this.selectedPageId;
        });
        this.edit('Import PNG', draft => {
            draft.images.push(image);
            draft.shapes.push(...shapes);
        });
        return shapes.map(shape => shape.id);
    }

    linkImageShape(id: string) {
        const source = this.document.shapes.find(shape => shape.id === id);
        if (source?.type !== 'pixel-image') throw new Error('Expected an image shape');
        const bounds = source.components.rect.bounds;
        const shape = makeImageShape(
            source.components.image.imageId,
            {
                ...bounds,
                x: bounds.x + 20,
                y: bounds.y + 20,
            },
            source.components.image.source,
            `${source.name} copy`,
        );
        shape.pageId = this.selectedPageId;
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
            for (const page of draft.pages)
                page.groups = page.groups.flatMap(group => {
                    const shapeIds = group.shapeIds.filter(member => member !== id);
                    return shapeIds.length ? [{...group, shapeIds}] : [];
                });
        });
    }

    beginTransaction(label: string) {
        this.requireIdle();
        this.transaction = {
            label,
            before: this.document,
            selectedId: this.selectedId,
            selectedIds: [...this.selectedIds],
        };
        this.publish();
    }

    commitTransaction() {
        const transaction = this.transaction;
        if (!transaction) throw new Error('No active transaction');
        const final = this.document;
        // Reconcile once against the baseline: bounded by changed shapes/images, not pointer events.
        const [next, patches, inversePatches] = produceWithPatches(transaction.before, draft => {
            draft.title = final.title;
            if (JSON.stringify(transaction.before.pages) !== JSON.stringify(final.pages)) draft.pages = final.pages;
            if (JSON.stringify(transaction.before.palettes) !== JSON.stringify(final.palettes))
                draft.palettes = final.palettes;
            draft.images.length = final.images.length;
            final.images.forEach((image, i) => {
                if (JSON.stringify(transaction.before.images[i]) !== JSON.stringify(image)) draft.images[i] = image;
            });
            draft.shapes.length = final.shapes.length;
            final.shapes.forEach((shape, i) => {
                if (JSON.stringify(transaction.before.shapes[i]) !== JSON.stringify(shape)) draft.shapes[i] = shape;
            });
        });
        this.transaction = null;
        this.document = next;
        this.record({label: transaction.label, patches, inversePatches});
        this.publish();
    }

    cancelTransaction() {
        if (!this.transaction) throw new Error('No active transaction');
        this.document = this.transaction.before;
        this.selectedId = this.transaction.selectedId;
        this.selectedIds = this.transaction.selectedIds;
        this.transaction = null;
        this.publish();
    }

    undo() {
        this.requireIdle();
        const entry = this.past.pop();
        if (!entry) return;
        this.document = applyPatches(this.document, entry.inversePatches);
        this.future.push(entry);
        this.publish();
    }

    redo() {
        this.requireIdle();
        const entry = this.future.pop();
        if (!entry) return;
        this.document = applyPatches(this.document, entry.patches);
        this.past.push(entry);
        this.publish();
    }

    toJSON() {
        return serializeDocument(this.document);
    }

    loadJSON(json: string) {
        this.replaceDocument(deserializeDocument(json));
    }

    replaceDocument(document: Document) {
        this.requireIdle();
        const normalized = structuredClone(document) as Document;
        const legacyPage = normalized.pages?.[0] ?? {
            id: 'page_1',
            name: 'Page 1',
            groups: [],
        };
        if (!normalized.pages?.length) normalized.pages = [legacyPage];
        normalized.shapes.forEach(shape => {
            if (!shape.pageId || !normalized.pages.some(page => page.id === shape.pageId)) shape.pageId = legacyPage.id;
        });
        validateDocument(normalized);
        this.document = freeze(normalized, true);
        this.selectedId = null;
        this.selectedIds = [];
        this.selectedPageId = normalized.pages[0].id;
        this.past = [];
        this.future = [];
        this.publish();
    }

    private publish() {
        const shapeIds = new Set(this.document.shapes.map(shape => shape.id));
        this.selectedIds = this.selectedIds.filter(id => shapeIds.has(id));
        if (this.selectedId && !shapeIds.has(this.selectedId)) this.selectedId = null;
        if (!this.selectedId && this.selectedIds.length) this.selectedId = this.selectedIds.at(-1)!;
        this.snapshot = Object.freeze({
            document: this.document,
            selectedId: this.selectedId,
            selectedIds: Object.freeze([...this.selectedIds]),
            canUndo: !this.transaction && this.past.length > 0,
            canRedo: !this.transaction && this.future.length > 0,
            transactionActive: !!this.transaction,
            selectedPageId: this.selectedPageId,
        });
        this.listeners.forEach(listener => listener());
    }

    private requireIdle() {
        if (this.transaction) throw new Error('Finish the active transaction first');
    }

    private record(entry: HistoryEntry) {
        if (!entry.patches.length) return;
        this.past.push(entry);
        if (this.past.length > this.historyLimit) this.past.shift();
        this.future = [];
    }
}
