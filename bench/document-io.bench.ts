// @vitest-environment happy-dom
import {describe} from 'vitest';
import {artworkSvg} from '../src/io/exportArtwork';
import {decodeDocumentPng, encodeDocumentPng} from '../src/io/pngDocument';
import {deserializeDocument, serializeDocument} from '../src/io/serialization';
import {importSvg} from '../src/io/svgImport';
import {makeLargeDocument, makeLargeSvg, tinyPng, measure} from './fixtures';

const document = makeLargeDocument();
const json = serializeDocument(document);
const png = encodeDocumentPng(tinyPng, document);
const svg = makeLargeSvg();
const firstPageShapes = document.shapes.filter(shape => shape.pageId === document.pages[0].id);

describe('document save and load', () => {
    measure('serialize a large document to JSON', () => {
        serializeDocument(document);
    });
    measure('deserialize and validate a large document', () => {
        deserializeDocument(json);
    });
    measure('embed a large document in a PNG', () => {
        encodeDocumentPng(tinyPng, document);
    });
    measure('decode a large document from a PNG', () => {
        decodeDocumentPng(png);
    });
});

describe('SVG', () => {
    measure('import an SVG with 300 elements', () => {
        importSvg(svg);
    });
    measure('export a 60-shape page as SVG', () => {
        artworkSvg(document, firstPageShapes, true);
    });
});
