import {test} from 'vitest';
import {EditorStore, emptyDocument} from '../src/model/EditorStore';
import {makeCircle, makeRect, makeText} from '../src/model/reducer';
import type {Document, Shape} from '../src/model/types';

/** Sizes for a large but realistic document. Keep them stable so results stay comparable over time. */
export const PAGES = 10;
export const SHAPES_PER_PAGE = 60;
export const PIXEL_IMAGE_SIZE = 128;

/**
 * A large document: PAGES pages, each with rectangles, circles and wrapped text, plus one
 * PIXEL_IMAGE_SIZE² pixel image. Deterministic, so every run measures the same work.
 */
export function makeLargeDocument(): Document {
    const store = new EditorStore(emptyDocument());
    for (let p = 1; p < PAGES; p++) store.createPage();
    const shapes: Shape[] = [];
    store.getSnapshot().document.pages.forEach((page, pageIndex) => {
        for (let i = 0; i < SHAPES_PER_PAGE; i++) {
            const x = (i % 10) * 90 + 10,
                y = Math.floor(i / 10) * 140 + 10;
            const shape =
                i % 3 === 0
                    ? makeRect(`Box ${pageIndex}.${i}`, {x, y, width: 80, height: 60})
                    : i % 3 === 1
                      ? makeCircle(`Dot ${pageIndex}.${i}`, {x: x + 40, y: y + 30}, 25)
                      : makeText(`Label ${pageIndex}.${i}`, {x, y, width: 160, height: 120});
            shapes.push({...shape, id: `shape_${pageIndex}_${i}`, pageId: page.id} as Shape);
        }
    });
    store.edit('Add shapes', draft => {
        draft.shapes.push(...shapes);
    });
    store.createPixelImage(PIXEL_IMAGE_SIZE, PIXEL_IMAGE_SIZE, ['#000000', '#ffffff', '#ff004d', '#29adff']);
    return structuredClone(store.getSnapshot().document);
}

/** An SVG with many paths, rects and circles, to stress the importer. */
export function makeLargeSvg(count = 300): string {
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
        const x = (i % 20) * 50,
            y = Math.floor(i / 20) * 50;
        if (i % 3 === 0) parts.push(`<rect x="${x}" y="${y}" width="40" height="30" fill="#c33"/>`);
        else if (i % 3 === 1) parts.push(`<circle cx="${x + 20}" cy="${y + 20}" r="15" fill="#33c"/>`);
        else
            parts.push(
                `<path d="M${x} ${y} C ${x + 10} ${y - 10}, ${x + 30} ${y + 40}, ${x + 40} ${y} L ${x + 40} ${y + 40} Z" ` +
                    `fill="#3c3" transform="rotate(${i % 45} ${x} ${y})"/>`,
            );
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800">${parts.join('')}</svg>`;
}

/** A canvas-free text measurer: a fixed advance per character, enough to exercise wrapping. */
export const fixedWidthMeasure = {
    measureText: (text: string) => ({width: text.length * 9}) as TextMetrics,
};

/** A tiny valid PNG used as the thumbnail when embedding a document. */
export const tinyPng = Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196,
    137, 0, 0, 0, 12, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68,
    174, 66, 96, 130,
]);

/** Where each benchmark's latest result is written, for `npm run metrics` to collect. */
export const RESULTS_DIR = 'bench/results';

export function slug(name: string) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * One benchmark as one test, using Vitest 5's test-context `bench`. Its result is written to
 * RESULTS_DIR/<slug>.json so results can be compared across runs and over time.
 */
export function measure(name: string, fn: () => void) {
    test(name, async ({bench}) => {
        await bench(name, {writeResult: `${RESULTS_DIR}/${slug(name)}.json`}, fn).run();
    });
}
