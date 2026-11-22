import {describe} from 'vitest';
import {EditorStore} from '../src/model/EditorStore';
import {shapeAlignmentOffsets} from '../src/model/shapeAlignment';
import {layoutText} from '../src/shapes/text';
import type {TextComponent} from '../src/model/types';
import {fixedWidthMeasure, makeLargeDocument, measure} from './fixtures';

const document = makeLargeDocument();
const ids = document.shapes.map(shape => shape.id);
const firstPageIds = ids.slice(0, 60);

describe('editor store', () => {
    measure('100 shape edits, then undo all and redo all', () => {
        const store = new EditorStore(document);
        for (let i = 0; i < 100; i++)
            store.updateShape(ids[i], shape => {
                shape.name = `Edited ${i}`;
            });
        for (let i = 0; i < 100; i++) store.undo();
        for (let i = 0; i < 100; i++) store.redo();
    });

    measure('100 edits inside one transaction (a property drag)', () => {
        const store = new EditorStore(document);
        store.beginTransaction('Drag');
        for (let i = 0; i < 100; i++)
            store.updateShape(ids[0], shape => {
                shape.name = `Step ${i}`;
            });
        store.commitTransaction();
    });

    measure('duplicate a 60-shape page selection', () => {
        const store = new EditorStore(document);
        store.duplicateShapes(firstPageIds);
    });
});

describe('layout math', () => {
    measure('align 600 shapes to the left', () => {
        shapeAlignmentOffsets(document.shapes, 'left');
    });
    measure('distribute 600 shapes horizontally', () => {
        shapeAlignmentOffsets(document.shapes, 'distribute-horizontal');
    });

    const paragraph: TextComponent = {
        kind: 'text-component',
        text: 'The quick brown fox jumps over the lazy dog. '.repeat(40) + '\n' + 'Second paragraph. '.repeat(30),
        fontId: null,
        fontSize: 16,
        fontWeight: 400,
        italic: false,
        color: '#111111',
        align: 'left',
        verticalAlign: 'middle',
        lineHeight: 1.3,
    };
    measure('wrap and lay out a long text block', () => {
        layoutText(fixedWidthMeasure, paragraph, {x: 0, y: 0, width: 320, height: 2000});
    });
});
