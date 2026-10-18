import type {CircleLikeComponent, Point} from './types';

export function circleContains(circle: CircleLikeComponent, point: Point): boolean {
    return Math.hypot(point.x - circle.center.x, point.y - circle.center.y) <= circle.radius;
}

export function circleHandles({center, radius}: CircleLikeComponent): Point[] {
    return [
        {x: center.x, y: center.y - radius},
        {x: center.x + radius, y: center.y},
        {x: center.x, y: center.y + radius},
        {x: center.x - radius, y: center.y},
    ];
}

// Use the gesture baseline so repeated pointer events never accumulate error.
export function dragCircle(circle: CircleLikeComponent, start: Point, current: Point, resize: boolean): CircleLikeComponent {
    if (!resize) return {
        ...circle, center: {
            x: circle.center.x + current.x - start.x,
            y: circle.center.y + current.y - start.y,
        }
    };
    const distance = (point: Point) => Math.hypot(point.x - circle.center.x, point.y - circle.center.y);
    return {
        ...circle,
        center: {...circle.center},
        radius: Math.max(0, circle.radius + distance(current) - distance(start))
    };
}
