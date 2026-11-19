import {describe, expect, it} from 'vitest';
import {deserializeDocument, serializeDocument} from '../src/io/serialization';
import {EditorStore, emptyDocument} from '../src/model/EditorStore';
import {makeText} from '../src/model/reducer';
import type {FontAsset} from '../src/model/types';
import {fontFamilyFor} from '../src/shapes/googleFonts';
import {wrapText} from '../src/shapes/text';

const font: FontAsset = {id: 'font-1', family: 'Example Sans', css: '@font-face{font-family:"Example Sans";src:url("data:font/woff2;base64,AA==") format("woff2")}'};

describe('text shapes', () => {
    it('wraps words, preserves explicit newlines, and breaks long words', () => {
        const context = {measureText: (value: string) => ({width: value.length * 10})} as Pick<CanvasRenderingContext2D, 'measureText'>;
        expect(wrapText(context, 'one two three\nextraordinary', 70)).toEqual(['one two', 'three', 'extraor', 'dinary']);
    });

    it('leaves the generic fallback family unquoted', () => {
        expect(fontFamilyFor([], null)).toBe('sans-serif');
        expect(fontFamilyFor([font], 'missing')).toBe('sans-serif');
        expect(fontFamilyFor([font], font.id)).toBe('"Example Sans", sans-serif');
    });

    it('round trips text and embedded font assets', () => {
        const document = emptyDocument();
        document.fonts.push(font);
        const shape = makeText('Greeting', {x: 20, y: 30, width: 240, height: 100});
        shape.components.text.text = 'Hello from a font asset';
        shape.components.text.fontId = font.id;
        document.shapes.push(shape);
        const loaded = deserializeDocument(serializeDocument(document));
        expect(loaded).toEqual(document);
    });

    it('migrates version 7 documents to the current version with no font assets', () => {
        const legacy = {version: 7, title: 'Old', shapes: [], images: [], palettes: [], pages: [{id: 'page_1', name: 'Page 1', groups: []}]};
        const loaded = deserializeDocument(JSON.stringify(legacy));
        expect(loaded.version).toBe(9);
        expect(loaded.fonts).toEqual([]);
    });

    it('copies the referenced font as a new document asset when pasting', () => {
        const shape = makeText('Text', {x: 10, y: 10, width: 200, height: 80});
        shape.components.text.fontId = font.id;
        const store = new EditorStore();
        const [pastedId] = store.pasteShapes([shape], [], [font]);
        const pasted = store.getSnapshot().document.shapes.find(item => item.id === pastedId);
        expect(pasted?.type).toBe('text');
        if (pasted?.type !== 'text') throw new Error('Expected pasted text');
        expect(pasted.components.text.fontId).not.toBe(font.id);
        expect(store.getSnapshot().document.fonts[0].id).toBe(pasted.components.text.fontId);
    });
});
