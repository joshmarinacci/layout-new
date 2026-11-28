import type {Bounds, Document, GridSettings} from './types';

export const DEFAULT_GRID: GridSettings = {size: 10, style: 'lines'};
export const MIN_GRID_SIZE = 1;
export const MAX_GRID_SIZE = 1000;
/** Drawn grid lines or dots closer than this on screen are thinned out. */
export const MIN_GRID_SCREEN_SPACING = 8;

export const isValidGridSize = (size: number) =>
    Number.isFinite(size) && size >= MIN_GRID_SIZE && size <= MAX_GRID_SIZE;

/** The grid that applies on a page: its own override, else the document's. */
export function effectiveGrid(document: Document, pageId: string): GridSettings {
    return document.pages.find(page => page.id === pageId)?.grid ?? document.settings.grid;
}

export const snapValue = (value: number, size: number) => Math.round(value / size) * size;

/**
 * The drag offset that puts the top-left corner of everything being moved on the grid.
 * `bounds` are the shapes' bounds when the drag started; they move together, so their
 * spacing is kept and only the group's corner snaps.
 */
export function snapMoveDelta(bounds: readonly Bounds[], dx: number, dy: number, size: number) {
    if (!bounds.length) return {dx, dy};
    const left = Math.min(...bounds.map(b => b.x));
    const top = Math.min(...bounds.map(b => b.y));
    return {dx: snapValue(left + dx, size) - left, dy: snapValue(top + dy, size) - top};
}

/** The resize offset that puts the dragged bottom-right corner on the grid. */
export function snapResizeDelta(bounds: Bounds, dx: number, dy: number, size: number) {
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    return {dx: snapValue(right + dx, size) - right, dy: snapValue(bottom + dy, size) - bottom};
}

/** A circle's radius rounded so its diameter is a whole number of grid cells (at least one). */
export const snapRadius = (radius: number, size: number) => Math.max(1, Math.round((radius * 2) / size)) * (size / 2);

/**
 * Spacing for drawing the grid at a zoom: the grid size times the smallest of 1, 2, 5, 10, 20, 50…
 * that keeps lines at least {@link MIN_GRID_SCREEN_SPACING} px apart, so every drawn line is a real grid line.
 */
export function gridDrawStep(size: number, zoom: number) {
    for (let scale = 1; ; scale *= 10)
        for (const factor of [1, 2, 5]) {
            const step = size * factor * scale;
            if (step * zoom >= MIN_GRID_SCREEN_SPACING) return step;
        }
}
