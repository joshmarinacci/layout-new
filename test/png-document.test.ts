import {describe, expect, it} from 'vitest';
import {emptyDocument} from '../src/model/EditorStore';
import {decodeDocumentPng, DOCUMENT_CHUNK_KEYWORD, encodeDocumentPng} from '../src/io/pngDocument';
import {deserializeDocument, serializeDocument} from '../src/io/serialization';
import type {Document} from '../src/model/types';

// A tiny valid PNG with one IDAT chunk; payload bytes are opaque to metadata tests.
const tinyPng = Uint8Array.from([
    137,80,78,71,13,10,26,10,
    0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,
    0,0,0,12,73,68,65,84,120,156,99,0,1,0,0,5,0,1,
    13,10,45,180,
    0,0,0,0,73,69,78,68,174,66,96,130
]);

function readKeyword(bytes: Uint8Array): string | null {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
        const length = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
        const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
        if (type === 'tEXt') {
            const separator = bytes.indexOf(0, offset + 8);
            if (separator >= 0 && separator < offset + 8 + length) return new TextDecoder().decode(bytes.subarray(offset + 8, separator));
        }
        offset += 12 + length;
    }
    return null;
}

describe('document PNG metadata', () => {
    it('embeds and decodes a document in a PNG text chunk', () => {
        const document: Document = {...emptyDocument(), title: 'Résumé ✨'};
        const encoded = encodeDocumentPng(tinyPng, document);
        expect(readKeyword(encoded)).toBe(DOCUMENT_CHUNK_KEYWORD);
        expect(decodeDocumentPng(encoded)).toEqual(document);
    });

    it('rejects PNGs without Draw document metadata and invalid PNG bytes', () => {
        expect(() => decodeDocumentPng(tinyPng)).toThrow(/no DrawDocument metadata/);
        expect(() => encodeDocumentPng(new Uint8Array([1, 2, 3]), emptyDocument())).toThrow(/valid PNG/);
    });

    it('upgrades version 6 documents to version 8 when loading', () => {
        const version6 = {...emptyDocument(), version: 6} as unknown as Record<string, unknown>;
        delete version6.fonts;
        const loaded = deserializeDocument(JSON.stringify(version6));
        expect(loaded.version).toBe(8);
        expect(JSON.parse(serializeDocument(loaded)).version).toBe(8);
    });
});
