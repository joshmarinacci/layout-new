import type {Bounds, PixelImageData} from '../model/types';

export interface DecodedPixels {width: number; height: number; rgba: Uint8ClampedArray}
export interface TileSize {width: number; height: number}
export interface ImportedPixels {image: PixelImageData; regions: Bounds[]; columns: number; rows: number}
function dimensions(width: number, height: number, limit = 2048) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > limit || height > limit)
        throw new Error(`PNG dimensions must be between 1 and ${limit} pixels.`);
}
/** Exact conversion only: no quantization, dithering, scaling, or alpha threshold. */
export function convertImportedPixels(source: DecodedPixels, name: string, tile?: TileSize, originalName: string | null = null): ImportedPixels {
    const {width, height, rgba} = source;
    dimensions(width, height);
    if (rgba.length !== width * height * 4) throw new Error('Invalid decoded pixel count.');
    const tw = tile?.width ?? width, th = tile?.height ?? height;
    if (!tile && (width > 256 || height > 256)) throw new Error('Enable tile splitting for PNGs larger than 256 pixels.');
    dimensions(tw, th, 256);
    if (width % tw || height % th) throw new Error('Tile dimensions must divide the PNG dimensions exactly; no pixels will be cropped.');
    const palette: string[] = [], indices = new Map<string, number>(), pixels: number[] = [];
    for (let i = 0; i < rgba.length; i += 4) {
        const alpha = rgba[i + 3];
        if (alpha === 0) { pixels.push(-1); continue; }
        if (alpha !== 255) throw new Error('This PNG contains partially transparent pixels. Export with fully opaque or fully transparent pixels.');
        const color = '#' + Array.from(rgba.slice(i, i + 3), channel => channel.toString(16).padStart(2, '0')).join('');
        if (!indices.has(color)) {
            if (palette.length === 256) throw new Error('This PNG uses more than 256 opaque colors. Export with a palette of 256 colors or fewer.');
            indices.set(color, palette.length); palette.push(color);
        }
        pixels.push(indices.get(color)!);
    }
    // A transparent image still needs one editable palette color.
    if (!palette.length) palette.push('#000000');
    const columns = width / tw, rows = height / th, regions: Bounds[] = [];
    if (columns * rows > 1024) throw new Error('A single import supports up to 1024 tiles. Choose larger tiles.');
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
        regions.push({x: col * tw, y: row * th, width: tw, height: th});
    }
    const image = {id: crypto.randomUUID(), name, originalName, width, height, palette, pixels};
    return {image, regions, columns, rows};
}

/** Check signature/header before asking the browser to allocate a decoded bitmap. */
export function inspectPng(bytes: Uint8Array): {width: number; height: number} {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 33 || signature.some((byte, i) => bytes[i] !== byte)) throw new Error('Choose a valid PNG file.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('Invalid PNG header.');
    if (bytes[24] === 16) throw new Error('16-bit PNGs are not supported. Export with 8-bit color channels.');
    const width = view.getUint32(16), height = view.getUint32(20);
    dimensions(width, height);
    let ended = false;
    for (let offset = 8; offset < bytes.length;) {
        if (offset + 12 > bytes.length) throw new Error('Truncated PNG file.');
        const length = view.getUint32(offset);
        if (offset + length + 12 > bytes.length) throw new Error('Truncated PNG chunk.');
        const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
        if (type === 'acTL') throw new Error('Animated PNGs are not supported. Export a single frame.');
        offset += length + 12;
        if (type === 'IEND') { ended = true; break; }
    }
    if (!ended) throw new Error('Incomplete PNG file.');
    return {width, height};
}

export async function decodePng(file: File): Promise<DecodedPixels> {
    if (file.size > 10 * 1024 * 1024) throw new Error('Choose a PNG smaller than 10 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const {width, height} = inspectPng(bytes);
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(new Blob([bytes], {type: 'image/png'}), {colorSpaceConversion: 'none', premultiplyAlpha: 'none', imageOrientation: 'none'}); }
    catch { throw new Error('The PNG could not be decoded. It may be damaged.'); }
    try {
        if (bitmap.width !== width || bitmap.height !== height) throw new Error('PNG dimensions do not match its header.');
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d', {willReadFrequently: true});
        if (!ctx) throw new Error('Pixel decoding is unavailable in this browser.');
        ctx.drawImage(bitmap, 0, 0);
        return {width, height, rgba: ctx.getImageData(0, 0, width, height).data};
    } finally { bitmap.close(); }
}
