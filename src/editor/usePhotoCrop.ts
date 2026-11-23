import {useRef, type KeyboardEvent} from 'react';
import type {EditorStore} from '../model/EditorStore';
import type {Bounds, PhotoAsset, PhotoShape, Point} from '../model/types';
import {cropToFrame, panPhoto, photoRect} from '../shapes/photos';

/** Which edges a crop handle moves: -1 the left/top edge, 1 the right/bottom edge, 0 neither. */
export interface CropHandle {
    x: -1 | 0 | 1;
    y: -1 | 0 | 1;
}

const HANDLES: CropHandle[] = [
    {x: -1, y: -1},
    {x: 0, y: -1},
    {x: 1, y: -1},
    {x: 1, y: 0},
    {x: 1, y: 1},
    {x: 0, y: 1},
    {x: -1, y: 1},
    {x: -1, y: 0},
];

export const handlePoint = (frame: Bounds, handle: CropHandle): Point => ({
    x: frame.x + ((handle.x + 1) / 2) * frame.width,
    y: frame.y + ((handle.y + 1) / 2) * frame.height,
});

/** The crop handle within `tolerance` of `p`, if any. */
export function cropHandleAt(frame: Bounds, p: Point, tolerance: number): CropHandle | null {
    return (
        HANDLES.find(handle => {
            const at = handlePoint(frame, handle);
            return Math.abs(p.x - at.x) <= tolerance && Math.abs(p.y - at.y) <= tolerance;
        }) ?? null
    );
}

/** The frame after dragging `handle` by (dx, dy): only the edges that handle owns move. */
export function dragFrame(frame: Bounds, handle: CropHandle, dx: number, dy: number): Bounds {
    const left = frame.x + (handle.x === -1 ? dx : 0);
    const right = frame.x + frame.width + (handle.x === 1 ? dx : 0);
    const top = frame.y + (handle.y === -1 ? dy : 0);
    const bottom = frame.y + frame.height + (handle.y === 1 ? dy : 0);
    return {x: left, y: top, width: right - left, height: bottom - top};
}

const contains = (b: Bounds, p: Point) => p.x >= b.x && p.y >= b.y && p.x <= b.x + b.width && p.y <= b.y + b.height;

type CropGesture = {
    pointer: number;
    start: Point;
    rect: Bounds;
    crop: Bounds;
    handle: CropHandle | null;
};

/**
 * Crop mode for a photo shape: the whole photo shows faintly behind the frame.
 * Dragging a handle moves that edge of the frame, and dragging anywhere else on
 * the photo slides it under the frame. The session itself is one store
 * transaction that the app opens and closes (`onFinish`); this hook only edits
 * the shape within it, so pointer moves don't touch React state.
 */
export function usePhotoCrop(
    store: EditorStore,
    shape: PhotoShape | undefined,
    photo: PhotoAsset | undefined,
    zoom: number,
    onFinish: (commit: boolean) => void,
) {
    const gesture = useRef<CropGesture | null>(null);
    const active = !!shape && !!photo;

    const update = (placement: {rect: Bounds; crop: Bounds}) => {
        if (!shape) return;
        store.updateShape(shape.id, draft => {
            if (draft.type !== 'photo') return;
            draft.components.rect.bounds = placement.rect;
            draft.components.photo.crop = placement.crop;
        });
    };

    return {
        active,
        /** Returns true when crop mode handled the press (always, while it is active). */
        pointerDown(p: Point, pointer: number): boolean {
            if (!shape || !photo) return false;
            const rect = shape.components.rect.bounds;
            const crop = shape.components.photo.crop;
            const handle = cropHandleAt(rect, p, 10 / zoom);
            if (!handle && !contains(photoRect({rect, crop}, photo), p)) {
                onFinish(true);
                return true;
            }
            gesture.current = {pointer, start: p, rect, crop, handle};
            return true;
        },
        isDragging: (pointer: number) => gesture.current?.pointer === pointer,
        pointerMove(p: Point, pointer: number) {
            const g = gesture.current;
            if (!g || g.pointer !== pointer || !photo) return;
            const dx = p.x - g.start.x;
            const dy = p.y - g.start.y;
            update(g.handle ? cropToFrame(g, photo, dragFrame(g.rect, g.handle, dx, dy)) : panPhoto(g, photo, dx, dy));
        },
        pointerUp(pointer: number) {
            if (gesture.current?.pointer === pointer) gesture.current = null;
        },
        /** Puts the frame back where the current drag began. */
        cancelDrag() {
            const g = gesture.current;
            if (!g) return;
            gesture.current = null;
            update(g);
        },
        /** Enter finishes, Escape cancels, arrows slide the photo (Shift for 10 units). Returns true if handled. */
        keyDown(event: KeyboardEvent): boolean {
            if (!shape || !photo) return false;
            if (event.key === 'Enter' || event.key === 'Escape') {
                gesture.current = null;
                onFinish(event.key === 'Enter');
                return true;
            }
            const step = event.shiftKey ? 10 : 1;
            const delta = {ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]}[
                event.key
            ];
            if (!delta) return false;
            update(
                panPhoto(
                    {rect: shape.components.rect.bounds, crop: shape.components.photo.crop},
                    photo,
                    delta[0],
                    delta[1],
                ),
            );
            return true;
        },
    };
}

/** Draws a photo shape in crop mode: the whole photo faintly, the crop at full strength, and the frame. */
export function drawCropMode(
    ctx: CanvasRenderingContext2D,
    shape: PhotoShape,
    photo: PhotoAsset,
    bitmap: CanvasImageSource | null,
    zoom: number,
) {
    const rect = shape.components.rect.bounds;
    const crop = shape.components.photo.crop;
    const full = photoRect({rect, crop}, photo);
    if (bitmap) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.drawImage(bitmap, full.x, full.y, full.width, full.height);
        ctx.globalAlpha = 1;
        ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, rect.x, rect.y, rect.width, rect.height);
        ctx.restore();
    }
    ctx.save();
    ctx.lineWidth = 1 / zoom;
    ctx.strokeStyle = '#8888';
    ctx.strokeRect(full.x, full.y, full.width, full.height);
    ctx.lineWidth = 2 / zoom;
    ctx.strokeStyle = '#1684e8';
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.fillStyle = '#ffffff';
    for (const handle of HANDLES) {
        const at = handlePoint(rect, handle);
        const size = 8 / zoom;
        ctx.fillRect(at.x - size / 2, at.y - size / 2, size, size);
        ctx.strokeRect(at.x - size / 2, at.y - size / 2, size, size);
    }
    ctx.restore();
}
