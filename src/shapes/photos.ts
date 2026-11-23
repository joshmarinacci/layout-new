import type {Bounds, PhotoAsset, PhotoShape} from '../model/types';

/** The smallest crop, in photo pixels, so a crop never collapses to nothing. */
export const MIN_CROP = 1;

export function makePhotoShape(photo: PhotoAsset, bounds: Bounds, name = photo.name): PhotoShape {
    return {
        id: crypto.randomUUID(),
        name,
        type: 'photo',
        components: {
            photo: {kind: 'photo-reference', photoId: photo.id, crop: wholePhoto(photo)},
            rect: {kind: 'resizable-bounds-component', bounds},
        },
    };
}

/**
 * Where a newly placed photo goes: centered on `center` at one photo pixel per unit,
 * scaled down if it would fill more than 80% of the visible canvas.
 */
export function photoPlacement(
    photo: Pick<PhotoAsset, 'width' | 'height'>,
    center: {x: number; y: number},
    view?: {width: number; height: number},
): Bounds {
    const scale = view ? Math.min(1, (0.8 * view.width) / photo.width, (0.8 * view.height) / photo.height) : 1;
    const width = photo.width * scale;
    const height = photo.height * scale;
    return {x: Math.round(center.x - width / 2), y: Math.round(center.y - height / 2), width, height};
}

export const wholePhoto = (photo: Pick<PhotoAsset, 'width' | 'height'>): Bounds => ({
    x: 0,
    y: 0,
    width: photo.width,
    height: photo.height,
});

export const photoDataUrl = (photo: Pick<PhotoAsset, 'mimeType' | 'data'>) =>
    `data:${photo.mimeType};base64,${photo.data}`;

/* ---------- crop maths ----------
 * A photo shape shows `crop` (photo pixels) stretched over `rect` (document units),
 * so its scale is rect / crop on each axis. Cropping moves the frame over the photo
 * at that same scale, so the photo itself never appears to move or resize.
 */

interface Placement {
    rect: Bounds;
    crop: Bounds;
}

const scaleOf = ({rect, crop}: Placement) => ({x: rect.width / crop.width, y: rect.height / crop.height});

/** Where the whole photo would be, in document units, at the shape's current scale. */
export function photoRect(placement: Placement, photo: Pick<PhotoAsset, 'width' | 'height'>): Bounds {
    const scale = scaleOf(placement);
    return {
        x: placement.rect.x - placement.crop.x * scale.x,
        y: placement.rect.y - placement.crop.y * scale.y,
        width: photo.width * scale.x,
        height: photo.height * scale.y,
    };
}

/**
 * Crops to `frame` (document units): the frame is kept inside the photo and at
 * least MIN_CROP photo pixels in size, and the crop follows it at the same scale.
 */
export function cropToFrame(
    placement: Placement,
    photo: Pick<PhotoAsset, 'width' | 'height'>,
    frame: Bounds,
): Placement {
    const scale = scaleOf(placement);
    const full = photoRect(placement, photo);
    const minWidth = MIN_CROP * scale.x;
    const minHeight = MIN_CROP * scale.y;
    const left = clamp(frame.x, full.x, full.x + full.width - minWidth);
    const top = clamp(frame.y, full.y, full.y + full.height - minHeight);
    const right = clamp(frame.x + frame.width, left + minWidth, full.x + full.width);
    const bottom = clamp(frame.y + frame.height, top + minHeight, full.y + full.height);
    const rect = {x: left, y: top, width: right - left, height: bottom - top};
    return {
        rect,
        crop: {
            x: (left - full.x) / scale.x,
            y: (top - full.y) / scale.y,
            width: rect.width / scale.x,
            height: rect.height / scale.y,
        },
    };
}

/** Sets the crop directly (photo pixels), clamped to the photo, keeping the scale and the photo in place. */
export function cropTo(placement: Placement, photo: Pick<PhotoAsset, 'width' | 'height'>, crop: Bounds): Placement {
    const scale = scaleOf(placement);
    const full = photoRect(placement, photo);
    return cropToFrame(placement, photo, {
        x: full.x + crop.x * scale.x,
        y: full.y + crop.y * scale.y,
        width: crop.width * scale.x,
        height: crop.height * scale.y,
    });
}

/** Slides the photo under a fixed frame by a document-space distance, stopping at its edges. */
export function panPhoto(
    placement: Placement,
    photo: Pick<PhotoAsset, 'width' | 'height'>,
    dx: number,
    dy: number,
): Placement {
    const scale = scaleOf(placement);
    const {crop} = placement;
    return {
        rect: placement.rect,
        crop: {
            ...crop,
            x: clamp(crop.x - dx / scale.x, 0, photo.width - crop.width),
            y: clamp(crop.y - dy / scale.y, 0, photo.height - crop.height),
        },
    };
}

/** Shows the whole photo again at the current scale, keeping it where it was. */
export function resetCrop(placement: Placement, photo: Pick<PhotoAsset, 'width' | 'height'>): Placement {
    return {rect: photoRect(placement, photo), crop: wholePhoto(photo)};
}

/** One photo pixel per document unit, keeping the top-left corner in place. */
export const actualSize = ({rect, crop}: Placement): Placement => ({
    rect: {...rect, width: crop.width, height: crop.height},
    crop,
});

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/* ---------- decoded bitmaps ----------
 * Decoding a photo is slow and asynchronous, and assets never change once created
 * (replacing an image makes a new asset), so each is decoded once per page load and
 * shared by every canvas. Listeners hear when a decode finishes so they can redraw.
 */

type Entry = {status: 'loading'} | {status: 'ready'; bitmap: ImageBitmap} | {status: 'failed'};
const bitmaps = new Map<string, Entry>();
const listeners = new Set<() => void>();

export function decodePhotoData(photo: Pick<PhotoAsset, 'mimeType' | 'data'>): Promise<ImageBitmap> {
    const bytes = Uint8Array.from(atob(photo.data), char => char.charCodeAt(0));
    return createImageBitmap(new Blob([bytes], {type: photo.mimeType}));
}

/** The decoded photo, or null while it is still decoding (or failed); starts decoding on first use. */
export function photoBitmap(photo: PhotoAsset): ImageBitmap | null {
    const entry = bitmaps.get(photo.id);
    if (entry) return entry.status === 'ready' ? entry.bitmap : null;
    bitmaps.set(photo.id, {status: 'loading'});
    decodePhotoData(photo)
        .then(bitmap => bitmaps.set(photo.id, {status: 'ready', bitmap}))
        .catch(() => bitmaps.set(photo.id, {status: 'failed'}))
        .finally(() => listeners.forEach(listener => listener()));
    return null;
}

/** Decodes every photo up front, for renderers that draw in one synchronous pass. */
export async function loadPhotoBitmaps(photos: readonly PhotoAsset[]): Promise<Map<string, ImageBitmap>> {
    const loaded = await Promise.all(
        photos.map(async photo => {
            const entry = bitmaps.get(photo.id);
            if (entry?.status === 'ready') return [photo.id, entry.bitmap] as const;
            const bitmap = await decodePhotoData(photo);
            bitmaps.set(photo.id, {status: 'ready', bitmap});
            return [photo.id, bitmap] as const;
        }),
    );
    return new Map(loaded);
}

export function onPhotoDecoded(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Frees decoded photos that none of `keep` use, such as after closing a document. */
export function releasePhotoBitmaps(keep: ReadonlySet<string>) {
    for (const [id, entry] of bitmaps) {
        if (keep.has(id)) continue;
        if (entry.status === 'ready') entry.bitmap.close();
        if (entry.status !== 'loading') bitmaps.delete(id);
    }
}
