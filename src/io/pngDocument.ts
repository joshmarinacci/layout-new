import type {Document, Shape} from '../model/types';
import {deserializeDocument, serializeDocument} from './serialization';
import {drawTextShape} from '../shapes/text';

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
export const DOCUMENT_CHUNK_KEYWORD = 'DrawDocument';
const CHUNK_TYPE = new Uint8Array([116, 69, 88, 116]); // tEXt
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let value = i;
        for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        table[i] = value;
    }
    return table;
})();

function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function readUint32(bytes: Uint8Array, offset: number): number {
    if (offset + 4 > bytes.length) throw new Error('Truncated PNG chunk');
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
    bytes[offset] = value >>> 24;
    bytes[offset + 1] = value >>> 16;
    bytes[offset + 2] = value >>> 8;
    bytes[offset + 3] = value;
}

function chunkType(bytes: Uint8Array, offset: number): string {
    return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function validatePng(bytes: Uint8Array): number {
    if (bytes.length < 8 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte))
        throw new Error('Not a valid PNG');
    let position = 8;
    while (position + 12 <= bytes.length) {
        const length = readUint32(bytes, position);
        const end = position + 12 + length;
        if (end > bytes.length) throw new Error('Truncated PNG chunk');
        const type = chunkType(bytes, position + 4);
        if (type === 'IDAT') return position;
        position = end;
    }
    throw new Error('Not a valid PNG: no IDAT chunk found');
}

function utf8ToBase64(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (let start = 0; start < bytes.length; start += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
    return btoa(binary);
}

function base64ToUtf8(value: string): string {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}

export function encodeDocumentPng(thumbnailPng: Uint8Array, document: Document): Uint8Array {
    const idatOffset = validatePng(thumbnailPng);
    const key = new TextEncoder().encode(DOCUMENT_CHUNK_KEYWORD);
    const text = new TextEncoder().encode(utf8ToBase64(serializeDocument(document)));
    const data = new Uint8Array(key.length + 1 + text.length);
    data.set(key);
    data[key.length] = 0;
    data.set(text, key.length + 1);
    const typeAndData = new Uint8Array(CHUNK_TYPE.length + data.length);
    typeAndData.set(CHUNK_TYPE);
    typeAndData.set(data, CHUNK_TYPE.length);
    const chunk = new Uint8Array(12 + data.length);
    writeUint32(chunk, 0, data.length);
    chunk.set(typeAndData, 4);
    writeUint32(chunk, 8 + data.length, crc32(typeAndData));
    const result = new Uint8Array(thumbnailPng.length + chunk.length);
    result.set(thumbnailPng.subarray(0, idatOffset));
    result.set(chunk, idatOffset);
    result.set(thumbnailPng.subarray(idatOffset), idatOffset + chunk.length);
    return result;
}

export function decodeDocumentPng(bytes: Uint8Array): Document {
    validatePng(bytes);
    let position = 8;
    while (position + 12 <= bytes.length) {
        const length = readUint32(bytes, position);
        const end = position + 12 + length;
        if (end > bytes.length) throw new Error('Truncated PNG chunk');
        if (chunkType(bytes, position + 4) === 'tEXt') {
            const dataStart = position + 8;
            const dataEnd = dataStart + length;
            let separator = dataStart;
            while (separator < dataEnd && bytes[separator] !== 0) separator++;
            if (separator < dataEnd) {
                const keyword = new TextDecoder('latin1').decode(bytes.subarray(dataStart, separator));
                if (keyword === DOCUMENT_CHUNK_KEYWORD) {
                    const payload = new TextDecoder('latin1').decode(bytes.subarray(separator + 1, dataEnd));
                    return deserializeDocument(base64ToUtf8(payload));
                }
            }
        }
        position = end;
    }
    throw new Error(`Not a Draw document: no ${DOCUMENT_CHUNK_KEYWORD} metadata found`);
}

export const DOCUMENT_PREVIEW_MAX_SIZE = 512;

function shapeBounds(shape: Shape) {
    switch (shape.type) {
        case 'vector': {
            const points = shape.components.network.points;
            if (!points.length) return {x: 0, y: 0, width: 1, height: 1};
            const xs = points.map(point => point.x),
                ys = points.map(point => point.y);
            return {
                x: Math.min(...xs),
                y: Math.min(...ys),
                width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
                height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
            };
        }
        case 'circle': {
            const {center, radius} = shape.components.circle;
            return {x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2};
        }
        case 'rectangle':
            return shape.components.rect.bounds;
        case 'text':
            return shape.components.rect.bounds;
        case 'oval':
            return shape.components.oval.bounds;
        case 'pixel-image':
        case 'repeating-image':
            return shape.components.rect.bounds;
    }
}

function renderShape(ctx: CanvasRenderingContext2D, shape: Shape, document: Document) {
    const bounds = shapeBounds(shape);
    if (shape.type === 'text') {
        drawTextShape(ctx, shape, document.fonts);
        return;
    }
    if (shape.type === 'vector') {
        const {network, stroke} = shape.components;
        ctx.save();
        ctx.translate(network.origin.x, network.origin.y);
        for (const segment of network.segments) {
            const a = network.points.find(point => point.id === segment.a),
                b = network.points.find(point => point.id === segment.b);
            if (!a || !b) continue;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            if (segment.c1 && segment.c2)
                ctx.bezierCurveTo(segment.c1.x, segment.c1.y, segment.c2.x, segment.c2.y, b.x, b.y);
            else ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.width;
            ctx.stroke();
        }
        ctx.restore();
        return;
    }
    if (shape.type === 'pixel-image' || shape.type === 'repeating-image') {
        const image = document.images.find(item => item.id === shape.components.image.imageId);
        if (image) {
            const pixels = globalThis.document.createElement('canvas');
            pixels.width = image.width;
            pixels.height = image.height;
            const imageCtx = pixels.getContext('2d');
            if (imageCtx) {
                const imageData = imageCtx.createImageData(image.width, image.height);
                image.pixels.forEach((index, offset) => {
                    if (index < 0) return;
                    const color = image.palette[index];
                    imageData.data[offset * 4] = parseInt(color.slice(1, 3), 16);
                    imageData.data[offset * 4 + 1] = parseInt(color.slice(3, 5), 16);
                    imageData.data[offset * 4 + 2] = parseInt(color.slice(5, 7), 16);
                    imageData.data[offset * 4 + 3] = 255;
                });
                imageCtx.putImageData(imageData, 0, 0);
                const source = shape.components.image.source;
                if (shape.type === 'pixel-image') {
                    ctx.drawImage(
                        pixels,
                        source.x,
                        source.y,
                        source.width,
                        source.height,
                        bounds.x,
                        bounds.y,
                        bounds.width,
                        bounds.height,
                    );
                } else {
                    const tile = globalThis.document.createElement('canvas');
                    tile.width = shape.components.pattern.width;
                    tile.height = shape.components.pattern.height;
                    const tileCtx = tile.getContext('2d');
                    if (tileCtx) {
                        tileCtx.imageSmoothingEnabled = false;
                        tileCtx.drawImage(
                            pixels,
                            source.x,
                            source.y,
                            source.width,
                            source.height,
                            0,
                            0,
                            tile.width,
                            tile.height,
                        );
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
                        ctx.clip();
                        const pattern = ctx.createPattern(tile, 'repeat');
                        if (pattern) {
                            pattern.setTransform(new DOMMatrix().translate(bounds.x, bounds.y));
                            ctx.fillStyle = pattern;
                            ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
                        }
                        ctx.restore();
                    }
                }
            }
        }
        return;
    }
    ctx.beginPath();
    if (shape.type === 'circle')
        ctx.ellipse(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
            bounds.width / 2,
            bounds.height / 2,
            0,
            0,
            Math.PI * 2,
        );
    else if (shape.type === 'oval')
        ctx.ellipse(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
            bounds.width / 2,
            bounds.height / 2,
            0,
            0,
            Math.PI * 2,
        );
    else ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.fillStyle = shape.components.fill.fill.color;
    ctx.fill();
    if (shape.components.stroke.width > 0) {
        ctx.strokeStyle = shape.components.stroke.color;
        ctx.lineWidth = shape.components.stroke.width;
        ctx.stroke();
    }
}

export function renderDocumentPreview(document: Document, maxSize = DOCUMENT_PREVIEW_MAX_SIZE): Uint8Array {
    const page = document.pages[0];
    if (!page) throw new Error('Document must contain at least one page');
    const contentSize = Math.max(1, maxSize - 40);
    const scale = Math.min(1, contentSize / 1024);
    const innerSize = Math.ceil(1024 * scale);
    const border = 16;
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = innerSize + border * 2;
    canvas.height = innerSize + border * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to render document preview');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(border, border);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1024, 1024);
    document.shapes.filter(shape => shape.pageId === page.id).forEach(shape => renderShape(ctx, shape, document));
    ctx.restore();
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 1;
    ctx.strokeRect(border - 0.5, border - 0.5, innerSize + 1, innerSize + 1);
    ctx.fillStyle = '#666666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Draw', canvas.width - 4, canvas.height - 3);
    const binary = atob(canvas.toDataURL('image/png').split(',')[1]);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function downloadDocumentPng(bytes: Uint8Array, filename: string) {
    const blob = new Blob([bytes.slice().buffer], {type: 'application/octet-stream'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openDocumentPngWithTauri(): Promise<{document: Document; filename: string} | null> {
    const {open} = await import('@tauri-apps/plugin-dialog');
    const {readFile} = await import('@tauri-apps/plugin-fs');
    const selected = await open({
        multiple: false,
        // Native filters match the final extension; `json.png` is treated as one
        // extension by some platforms and can hide valid `.json.png` files.
        filters: [{name: 'Draw document PNG', extensions: ['png']}],
    });
    if (!selected || Array.isArray(selected)) return null;
    const bytes = await readFile(selected);
    const filename = selected.split(/[\\/]/).pop() ?? 'Untitled.json.png';
    return {document: decodeDocumentPng(bytes), filename};
}

export async function saveDocumentPngWithTauri(bytes: Uint8Array, filename: string): Promise<void> {
    const {save} = await import('@tauri-apps/plugin-dialog');
    const {writeFile} = await import('@tauri-apps/plugin-fs');
    const selected = await save({
        defaultPath: filename,
        filters: [{name: 'Draw document PNG', extensions: ['png']}],
    });
    if (!selected) return;
    await writeFile(selected, bytes);
}
