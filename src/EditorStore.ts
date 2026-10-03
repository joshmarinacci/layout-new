import {applyPatches, enablePatches, freeze, produceWithPatches, type Draft, type Patch} from 'immer';
import type {Document, Shape} from './types';
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
export const emptyDocument = (): Document => ({version: 0, title: 'Untitled', shapes: []});

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
        // Reconcile once against the baseline: bounded by changed shapes, not pointer events.
        const [next, patches, inversePatches] = produceWithPatches(transaction.before, draft => {
            draft.title = final.title;
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
