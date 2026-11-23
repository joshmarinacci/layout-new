import {PHOTO_MIME_TYPES, type PhotoAsset, type PhotoMimeType} from '../model/types';
import {isTauri} from '@tauri-apps/api/core';
import {MAX_PHOTO_SIZE} from './serialization';

/** For file inputs: the formats browsers and WebKit can decode. */
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif';
export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

const MIME_BY_EXTENSION: Record<string, PhotoMimeType> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
};

const isPhotoMimeType = (type: string): type is PhotoMimeType => (PHOTO_MIME_TYPES as readonly string[]).includes(type);

/** The image type of a file, from its MIME type or else its name. */
export function photoMimeType(type: string, name: string): PhotoMimeType | null {
    if (isPhotoMimeType(type)) return type;
    return MIME_BY_EXTENSION[name.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

/** The size to store an image at: unchanged, or scaled so its longest side is MAX_PHOTO_SIZE. */
export function storedSize(width: number, height: number): {width: number; height: number} {
    const scale = Math.min(1, MAX_PHOTO_SIZE / Math.max(width, height));
    return {
        width: Math.max(1, Math.min(MAX_PHOTO_SIZE, Math.round(width * scale))),
        height: Math.max(1, Math.min(MAX_PHOTO_SIZE, Math.round(height * scale))),
    };
}

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    // Chunked: String.fromCharCode with one argument per byte overflows the stack on big files.
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
}

/**
 * Turns an image file into a photo asset. EXIF orientation is applied by the
 * decoder, so dimensions are as the photo appears. Images over MAX_PHOTO_SIZE are
 * scaled down and re-encoded (JPEG stays JPEG, others become PNG), and GIFs are
 * re-encoded as PNG so only their first frame is kept. Everything else is stored
 * byte for byte.
 */
export async function importPhotoFile(file: Blob, fileName: string): Promise<PhotoAsset> {
    const mimeType = photoMimeType(file.type, fileName);
    if (!mimeType) throw new Error(`${fileName} is not a JPEG, PNG, WebP or GIF image`);
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
    } catch {
        throw new Error(`${fileName} could not be read as an image`);
    }
    try {
        const size = storedSize(bitmap.width, bitmap.height);
        const resize = size.width !== bitmap.width || size.height !== bitmap.height;
        let encoded: Blob = file;
        let storedType = mimeType;
        if (resize || mimeType === 'image/gif') {
            storedType = mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
            encoded = await encode(bitmap, size, storedType);
        }
        return {
            id: crypto.randomUUID(),
            name: fileName.replace(/\.[^.]+$/, '') || 'Image',
            originalName: fileName,
            mimeType: storedType,
            width: size.width,
            height: size.height,
            data: bytesToBase64(new Uint8Array(await encoded.arrayBuffer())),
        };
    } finally {
        bitmap.close();
    }
}

async function encode(bitmap: ImageBitmap, size: {width: number; height: number}, type: PhotoMimeType): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to resize the image');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.9));
    if (!blob) throw new Error('Unable to resize the image');
    return blob;
}

export interface ChosenFile {
    blob: Blob;
    name: string;
}

/**
 * Asks the user for image files: the native open panel in the desktop app, or a
 * file input in the browser. Resolves with nothing if they cancel.
 */
export async function chooseImageFiles(multiple: boolean): Promise<ChosenFile[]> {
    if (isTauri()) {
        const [{open}, {readFile}] = await Promise.all([
            import('@tauri-apps/plugin-dialog'),
            import('@tauri-apps/plugin-fs'),
        ]);
        const selected = await open({multiple, filters: [{name: 'Images', extensions: PHOTO_EXTENSIONS}]});
        if (!selected) return [];
        const paths = Array.isArray(selected) ? selected : [selected];
        return Promise.all(
            paths.map(async path => {
                const name = path.split(/[\\/]/).pop() ?? 'Image';
                return {blob: new Blob([await readFile(path)], {type: photoMimeType('', name) ?? ''}), name};
            }),
        );
    }
    // A detached input: the browser's file picker is the only way to read local files.
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = PHOTO_ACCEPT;
    input.multiple = multiple;
    return new Promise(resolve => {
        input.addEventListener('change', () =>
            resolve([...(input.files ?? [])].map(file => ({blob: file, name: file.name}))),
        );
        input.addEventListener('cancel', () => resolve([]));
        input.click();
    });
}
