// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {artworkSvg} from '../src/io/exportArtwork';
import {decodeDocumentPng, encodeDocumentPng} from '../src/io/pngDocument';
import {deserializeDocument, serializeDocument} from '../src/io/serialization';
import {emptyDocument} from '../src/model/EditorStore';
import {makeText} from '../src/model/reducer';
import type {Document, FontAsset, TextShape} from '../src/model/types';

const fontCss = (family: string) =>
    `@font-face{font-family:"${family}";src:url("data:font/woff2;base64,AA==") format("woff2")}`;
const lobster: FontAsset = {id: 'font-lobster', family: 'Lobster', css: fontCss('Lobster')};
const inter: FontAsset = {id: 'font-inter', family: 'Inter', css: fontCss('Inter')};

// A tiny valid PNG with one IDAT chunk; payload bytes are opaque to metadata tests.
const tinyPng = Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196,
    137, 0, 0, 0, 12, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68,
    174, 66, 96, 130,
]);

function styledText(name: string, patch: Partial<TextShape['components']['text']>): TextShape {
    const shape = makeText(name, {x: 10, y: 20, width: 300, height: 200});
    Object.assign(shape.components.text, patch);
    return shape;
}

/** A document with two fonts (one unused), and text shapes covering every style option. */
function textDocument(): Document {
    const document = emptyDocument();
    document.fonts.push(lobster, inter);
    document.shapes.push(
        styledText('Heading', {
            text: 'Hello\nworld',
            fontId: lobster.id,
            fontSize: 48,
            fontWeight: 700,
            italic: true,
            color: '#ff0000',
            align: 'center',
            verticalAlign: 'middle',
            lineHeight: 1.5,
        }),
        styledText('Footer', {text: 'Bottom right', fontId: null, align: 'right', verticalAlign: 'bottom'}),
        styledText('Body', {text: 'Top left', fontId: lobster.id}),
    );
    return document;
}

function serializedObject(document: Document): Record<string, unknown> {
    return JSON.parse(serializeDocument(document)) as Record<string, unknown>;
}

describe('text documents: JSON export and import', () => {
    it('round trips every text style field and all font assets, including unused ones', () => {
        const document = textDocument();
        const loaded = deserializeDocument(serializeDocument(document));
        expect(loaded).toEqual(document);
        expect(loaded.fonts.map(font => font.id)).toEqual([lobster.id, inter.id]);
    });

    it('writes font references by ID and embeds the font CSS once per asset', () => {
        const json = serializeDocument(textDocument());
        const parsed = JSON.parse(json) as Document;
        expect(parsed.shapes.map(shape => (shape.type === 'text' ? shape.components.text.fontId : undefined))).toEqual([
            lobster.id,
            null,
            lobster.id,
        ]);
        expect(json.split('@font-face{font-family:\\"Lobster\\"').length - 1).toBe(1);
    });

    it('refuses to export a document whose text references a missing font', () => {
        const document = textDocument();
        document.fonts = [inter];
        expect(() => serializeDocument(document)).toThrow(/missing font/);
    });

    it('rejects imported text that references a missing font', () => {
        const raw = serializedObject(textDocument());
        raw.fonts = [inter];
        expect(() => deserializeDocument(JSON.stringify(raw))).toThrow(/missing font/);
    });

    it('rejects imported text with an invalid or missing vertical alignment', () => {
        const invalid = serializedObject(textDocument()) as unknown as Document;
        const first = invalid.shapes[0];
        if (first.type !== 'text') throw new Error('Expected text');
        (first.components.text as unknown as Record<string, unknown>).verticalAlign = 'baseline';
        expect(() => deserializeDocument(JSON.stringify(invalid))).toThrow(/Invalid text style/);

        const missing = serializedObject(textDocument()) as unknown as Document;
        const second = missing.shapes[0];
        if (second.type !== 'text') throw new Error('Expected text');
        delete (second.components.text as Partial<TextShape['components']['text']>).verticalAlign;
        expect(() => deserializeDocument(JSON.stringify(missing))).toThrow(/Expected fields/);
    });

    it('rejects duplicate font IDs and font CSS without an @font-face rule', () => {
        const duplicate = serializedObject(textDocument());
        duplicate.fonts = [lobster, {...inter, id: lobster.id}];
        expect(() => deserializeDocument(JSON.stringify(duplicate))).toThrow(/Invalid font asset/);

        const noFace = serializedObject(textDocument());
        noFace.fonts = [{...lobster, css: 'body{color:red}'}, inter];
        expect(() => deserializeDocument(JSON.stringify(noFace))).toThrow(/Invalid font asset/);
    });

    it('migrates version 8 text to top vertical alignment and keeps font references', () => {
        const version8 = serializedObject(textDocument()) as unknown as Document;
        (version8 as unknown as Record<string, unknown>).version = 8;
        delete (version8 as Partial<Document>).photos;
        for (const shape of version8.shapes)
            if (shape.type === 'text')
                delete (shape.components.text as Partial<TextShape['components']['text']>).verticalAlign;
        const loaded = deserializeDocument(JSON.stringify(version8));
        expect(loaded.version).toBe(10);
        expect(loaded.fonts).toEqual([lobster, inter]);
        expect(
            loaded.shapes.map(shape =>
                shape.type === 'text' ? [shape.components.text.fontId, shape.components.text.verticalAlign] : null,
            ),
        ).toEqual([
            [lobster.id, 'top'],
            [null, 'top'],
            [lobster.id, 'top'],
        ]);
        expect(deserializeDocument(serializeDocument(loaded))).toEqual(loaded);
    });

    it('rejects version 8 documents that already contain a vertical alignment field', () => {
        const raw = serializedObject(textDocument());
        raw.version = 8;
        delete raw.photos;
        expect(() => deserializeDocument(JSON.stringify(raw))).toThrow(/Expected fields/);
    });

    it('rejects text shapes in documents older than version 8', () => {
        const raw = serializedObject(textDocument());
        raw.version = 7;
        delete raw.fonts;
        delete raw.photos;
        expect(() => deserializeDocument(JSON.stringify(raw))).toThrow(/Text shapes require document version 8/);
    });
});

describe('text documents: PNG-embedded export and import', () => {
    it('round trips text shapes and embedded fonts through PNG metadata', () => {
        const document = textDocument();
        expect(decodeDocumentPng(encodeDocumentPng(tinyPng, document))).toEqual(document);
    });
});

describe('text documents: SVG artwork export', () => {
    beforeEach(() => {
        // happy-dom has no canvas text metrics; use a fixed 10px-per-character width.
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
            () =>
                ({
                    font: '',
                    measureText: (value: string) => ({width: value.length * 10}),
                }) as unknown as CanvasRenderingContext2D,
        );
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const tspanYs = (svg: string) => [...svg.matchAll(/<tspan x="[^"]+" y="([^"]+)"/g)].map(match => Number(match[1]));

    it('embeds only the fonts that exported text references', () => {
        const document = textDocument();
        const svg = artworkSvg(document, document.shapes);
        expect(svg).toContain('font-family="Lobster"');
        expect(svg).toContain('font-family="sans-serif"');
        expect(svg.match(/<style>/g)).toHaveLength(1);
        expect(svg).toContain('font-family:"Lobster"');
        expect(svg).not.toContain('font-family:"Inter"');
    });

    it('omits font styles when exported text uses no font asset', () => {
        const document = textDocument();
        const footer = document.shapes.filter(shape => shape.name === 'Footer');
        expect(artworkSvg(document, footer)).not.toContain('<style>');
    });

    it('escapes text content and font names', () => {
        const document = emptyDocument();
        const tricky: FontAsset = {id: 'f', family: 'A "B" <C>', css: fontCss('x')};
        document.fonts.push(tricky);
        document.shapes.push(styledText('Tricky', {text: '<script>&', fontId: tricky.id}));
        const svg = artworkSvg(document, document.shapes);
        expect(svg).toContain('&lt;script&gt;&amp;');
        expect(svg).toContain('font-family="A &quot;B&quot; &lt;C&gt;"');
        expect(svg).not.toContain('<script>');
    });

    it('positions lines according to vertical alignment', () => {
        const at = (verticalAlign: TextShape['components']['text']['verticalAlign']) => {
            const document = emptyDocument();
            document.shapes.push(styledText('T', {text: 'one\ntwo', fontSize: 20, lineHeight: 1.5, verticalAlign}));
            return tspanYs(artworkSvg(document, document.shapes));
        };
        // Box y=20, height=200; block = 20 + 30 + 5 (descent) = 55.
        expect(at('top')).toEqual([40, 70]);
        expect(at('middle')).toEqual([20 + (200 - 55) / 2 + 20, 20 + (200 - 55) / 2 + 50]);
        expect(at('bottom')).toEqual([185, 215]);
    });
});
