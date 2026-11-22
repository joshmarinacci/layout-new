// @vitest-environment happy-dom
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {importSvg} from '../src/io/svgImport';
import {EditorStore} from '../src/model/EditorStore';
import {makeExampleDocument} from '../src/model/exampleDocument';

const fixture = (name: string) => readFileSync(resolve(process.cwd(), 'test/fixtures/svg', name), 'utf8');

describe('SVG import', () => {
    it('imports basic shapes as separate styled vector networks with filled regions', () => {
        const result = importSvg(fixture('basic-shapes.svg'));
        expect(result.shapes).toHaveLength(3);
        expect(result.shapes.map(shape => shape.name)).toEqual(['box', 'dot', 'triangle']);
        expect(result.shapes.map(shape => shape.components.stroke.color)).toEqual(['#1d3557', '#000000', '#000000']);
        expect(result.shapes[0].components.stroke.width).toBe(2);
        expect(result.shapes.map(shape => shape.components.network.regions.some(region => region.fill))).toEqual([
            true,
            true,
            true,
        ]);
        expect(result.warnings).toEqual([]);
    });

    it('converts cubic, smooth cubic, quadratic, and smooth quadratic paths and applies group transforms', () => {
        const {shapes} = importSvg(fixture('path-transforms.svg'));
        expect(shapes).toHaveLength(2);
        const first = shapes[0];
        expect(first.components.network.segments).toHaveLength(2);
        expect(first.components.network.points[0]).toMatchObject({x: 20, y: 10});
        expect(first.components.stroke).toMatchObject({color: '#222222', width: 6});
        expect(shapes[1].components.network.segments).toHaveLength(2);
        expect(
            shapes.every(shape => shape.components.network.segments.every(segment => segment.c1 && segment.c2)),
        ).toBe(true);
    });

    it('warns and skips unsupported path commands and SVG text while keeping supported geometry', () => {
        const result = importSvg(fixture('unsupported.svg'));
        expect(result.shapes).toHaveLength(1);
        expect(result.warnings.join(' ')).toMatch(/<text>/);
    });

    it('converts rotated, swept, large, relative, and degenerate elliptical arcs to cubics', () => {
        const result = importSvg(fixture('arcs.svg'));
        expect(result.shapes).toHaveLength(2);
        const arc = result.shapes[0].components.network;
        expect(arc.segments).toHaveLength(3);
        expect(arc.segments.slice(0, 2).every(segment => segment.c1 && segment.c2)).toBe(true);
        expect(arc.segments[2].c1).toBeNull();
        expect(arc.points.at(-1)).toMatchObject({x: 100, y: 50});
        const large = result.shapes[1].components.network;
        expect(large.segments.length).toBeGreaterThan(2);
        expect(large.segments.every(segment => segment.c1 && segment.c2)).toBe(true);
        expect(result.warnings).toEqual([]);
    });

    it('applies SVG implicit closure for filled open paths without drawing an extra closing stroke', () => {
        const filled = importSvg(
            '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L20 0 L10 20" fill="#fff000"/></svg>',
        ).shapes[0];
        expect(filled.components.network.regions.some(region => region.fill === '#fff000')).toBe(true);
        expect(filled.components.network.segments).toHaveLength(3);
        expect(filled.components.stroke.width).toBe(0);

        const outlined = importSvg(
            '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L20 0 L10 20" fill="#fff000" stroke="#222"/></svg>',
        );
        expect(outlined.shapes).toHaveLength(2);
        expect(outlined.shapes[0].components.network.regions.some(region => region.fill === '#fff000')).toBe(true);
        expect(outlined.shapes[0].components.stroke.width).toBe(0);
        expect(outlined.shapes[1].components.network.segments).toHaveLength(2);
        expect(outlined.shapes[1].components.stroke.color).toBe('#222');
    });

    it('keeps compound path holes transparent using the SVG fill rule', () => {
        const nonzero = importSvg(
            '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L100 0 L100 100 L0 100 Z M20 20 L20 80 L80 80 L80 20 Z" fill="#000"/></svg>',
        ).shapes[0];
        const regions = nonzero.components.network.regions;
        expect(regions).toHaveLength(2);
        expect(regions.filter(region => region.fill === '#000')).toHaveLength(1);
        expect(regions.find(region => region.loops.length === 2)?.fill).toBe('#000');
        expect(regions.find(region => region.loops.length === 1)?.fill).toBeNull();

        const evenodd = importSvg(
            '<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M0 0 L100 0 L100 100 L0 100 Z M20 20 L80 20 L80 80 L20 80 Z"/></svg>',
        ).shapes[0];
        expect(evenodd.components.network.regions.find(region => region.loops.length === 1)?.fill).toBeNull();
    });

    it('rejects SVG doctypes and documents with no supported geometry', () => {
        expect(() => importSvg('<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>')).toThrow(
            /document types and entities/,
        );
        expect(() => importSvg('<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>')).toThrow(
            /No supported vector geometry/,
        );
    });

    it('groups multi-network imports and undoes them in one step', () => {
        const store = new EditorStore(makeExampleDocument());
        const {shapes} = importSvg(fixture('basic-shapes.svg'));
        const ids = store.importVectorNetworks(shapes, 'page_1', 'example');
        expect(ids).toHaveLength(3);
        expect(store.getSnapshot().document.pages[0].groups).toEqual([
            {id: expect.any(String), name: 'example', shapeIds: ids},
        ]);
        expect(store.getSnapshot().selectedIds).toEqual(ids);
        store.undo();
        expect(store.getSnapshot().document.shapes).toHaveLength(2);
        expect(store.getSnapshot().document.pages[0].groups).toEqual([]);
    });
});
