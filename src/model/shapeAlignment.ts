import type {Bounds, Shape} from './types';
import {selectionBounds} from '../editor/VisualEditor';
import {intersects, type Point} from '../editor/camera';

export type ShapeAlignment =
    'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute-horizontal' | 'distribute-vertical';

export interface ShapeOffset {
    x: number;
    y: number;
}

function unionBounds(bounds: readonly Bounds[]): Bounds {
    const left = Math.min(...bounds.map(item => item.x));
    const top = Math.min(...bounds.map(item => item.y));
    const right = Math.max(...bounds.map(item => item.x + item.width));
    const bottom = Math.max(...bounds.map(item => item.y + item.height));
    return {x: left, y: top, width: right - left, height: bottom - top};
}

export function shapeAlignmentOffsets(shapes: readonly Shape[], alignment: ShapeAlignment): Map<string, ShapeOffset> {
    const offsets = new Map(shapes.map(shape => [shape.id, {x: 0, y: 0}]));
    if (shapes.length < 2) return offsets;

    const bounds = shapes.map(selectionBounds);
    const selection = unionBounds(bounds);
    if (alignment === 'left' || alignment === 'center' || alignment === 'right') {
        shapes.forEach((shape, index) => {
            const box = bounds[index];
            const x =
                alignment === 'left'
                    ? selection.x - box.x
                    : alignment === 'center'
                      ? selection.x + selection.width / 2 - (box.x + box.width / 2)
                      : selection.x + selection.width - box.x - box.width;
            offsets.set(shape.id, {x, y: 0});
        });
        return offsets;
    }
    if (alignment === 'top' || alignment === 'middle' || alignment === 'bottom') {
        shapes.forEach((shape, index) => {
            const box = bounds[index];
            const y =
                alignment === 'top'
                    ? selection.y - box.y
                    : alignment === 'middle'
                      ? selection.y + selection.height / 2 - (box.y + box.height / 2)
                      : selection.y + selection.height - box.y - box.height;
            offsets.set(shape.id, {x: 0, y});
        });
        return offsets;
    }

    const horizontal = alignment === 'distribute-horizontal';
    const ordered = shapes
        .map((shape, index) => ({shape, box: bounds[index]}))
        .sort((a, b) => (horizontal ? a.box.x - b.box.x : a.box.y - b.box.y));
    const start = horizontal ? ordered[0].box.x : ordered[0].box.y;
    const endBox = ordered[ordered.length - 1].box;
    const end = horizontal ? endBox.x + endBox.width : endBox.y + endBox.height;
    const totalSize = ordered.reduce((sum, item) => sum + (horizontal ? item.box.width : item.box.height), 0);
    const gap = (end - start - totalSize) / (ordered.length - 1);
    let cursor = start;
    for (const {shape, box} of ordered) {
        const coordinate = horizontal ? box.x : box.y;
        offsets.set(shape.id, horizontal ? {x: cursor - coordinate, y: 0} : {x: 0, y: cursor - coordinate});
        cursor += (horizontal ? box.width : box.height) + gap;
    }
    return offsets;
}

export function translateShape(shape: Shape, x: number, y: number) {
    if (shape.type === 'vector') {
        shape.components.network.origin.x += x;
        shape.components.network.origin.y += y;
    } else if (shape.type === 'circle') {
        shape.components.circle.center.x += x;
        shape.components.circle.center.y += y;
    } else {
        const bounds = shape.type === 'oval' ? shape.components.oval.bounds : shape.components.rect.bounds;
        bounds.x += x;
        bounds.y += y;
    }
}

/** Moves shapes together so the middle of their combined bounds sits at `center`, in whole units. */
export function centerShapesAt(shapes: readonly Shape[], center: Point) {
    if (!shapes.length) return;
    const box = unionBounds(shapes.map(selectionBounds));
    const dx = Math.round(center.x - (box.x + box.width / 2));
    const dy = Math.round(center.y - (box.y + box.height / 2));
    for (const shape of shapes) translateShape(shape, dx, dy);
}

/** Leaves shapes alone when any of them is visible in `view`; otherwise centers them in it. */
export function bringShapesIntoView(shapes: readonly Shape[], view: Bounds) {
    if (!shapes.length || intersects(unionBounds(shapes.map(selectionBounds)), view)) return;
    centerShapesAt(shapes, {x: view.x + view.width / 2, y: view.y + view.height / 2});
}
