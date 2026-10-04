import type {Document} from './types';

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Expected a plain object');
    return value as ObjectValue;
}
function keys(value: ObjectValue, expected: string[]) {
    if (Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key)))
        throw new Error(`Expected fields: ${expected.join(', ')}`);
}
function text(value: unknown) { if (typeof value !== 'string') throw new Error('Expected text'); }
function number(value: unknown, nonnegative = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (nonnegative && value < 0))
        throw new Error('Expected a finite valid dimension');
}
function component(value: unknown, kind: string, fields: string[]) {
    const c = object(value); keys(c, ['kind', ...fields]);
    if (c.kind !== kind) throw new Error(`Expected ${kind}`);
    return c;
}
export function validateDocument(value: unknown): asserts value is Document {
    const doc = object(value); keys(doc, ['version', 'title', 'shapes', 'images']);
    if (doc.version !== 1) throw new Error('Unsupported document version');
    text(doc.title);
    if (!Array.isArray(doc.shapes)) throw new Error('Expected shapes array');
    if (!Array.isArray(doc.images)) throw new Error('Expected images array');
    const imageIds = new Set<string>();
    for (const item of doc.images) {
        const image = object(item);
        keys(image, ['id', 'name', 'width', 'height', 'palette', 'pixels']);
        text(image.id); text(image.name);
        if (!image.id || imageIds.has(image.id as string)) throw new Error('Image IDs must be nonempty and unique');
        imageIds.add(image.id as string);
        for (const size of [image.width, image.height]) {
            if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > 256)
                throw new Error('Pixel image dimensions must be integers from 1 to 256');
        }
        if (!Array.isArray(image.palette) || image.palette.length < 1 || image.palette.length > 256)
            throw new Error('Expected 1–256 hex palette colors');
        for (const color of image.palette) {
            if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Invalid palette color');
        }
        if (!Array.isArray(image.pixels) || image.pixels.length !== (image.width as number) * (image.height as number))
            throw new Error('Pixel count must match image dimensions');
        const paletteSize = image.palette.length;
        for (const pixel of image.pixels) {
            if (typeof pixel !== 'number' || !Number.isInteger(pixel) || pixel < -1 || pixel >= paletteSize)
                throw new Error('Invalid pixel palette index');
        }
    }
    const ids = new Set<string>();
    for (const item of doc.shapes) {
        const s = object(item); keys(s, ['id', 'name', 'type', 'components']);
        text(s.id); text(s.name);
        if (!s.id || ids.has(s.id as string)) throw new Error('Shape IDs must be nonempty and unique');
        ids.add(s.id as string);
        const c = object(s.components);
        if (s.type === 'pixel-image') {
            keys(c, ['image', 'rect']);
            const reference = component(c.image, 'pixel-image-reference', ['imageId']);
            if (!imageIds.has(reference.imageId as string)) throw new Error('Missing pixel image data');
            const bounds = object(component(c.rect, 'resizable-bounds-component', ['bounds']).bounds);
            keys(bounds, ['x', 'y', 'width', 'height']);
            number(bounds.x); number(bounds.y); number(bounds.width, true); number(bounds.height, true);
            continue;
        }
        if (s.type === 'rectangle') keys(c, ['rect', 'fill', 'stroke', 'cornerRadius']);
        else if (s.type === 'circle') keys(c, ['circle', 'fill', 'stroke']);
        else if (s.type === 'oval') keys(c, ['oval', 'fill', 'stroke']);
        else throw new Error('Unsupported shape type');
        const fill = object(component(c.fill, 'fill-component', ['fill']).fill);
        keys(fill, ['kind', 'color']);
        if (fill.kind !== 'solid') throw new Error('Unsupported fill');
        text(fill.color);
        const stroke = component(c.stroke, 'stroke-component', ['width', 'color']);
        text(stroke.color); number(stroke.width, true);
        if (s.type === 'circle') {
            const circle = component(c.circle, 'circle-like-component', ['center', 'radius']);
            const center = object(circle.center); keys(center, ['x', 'y']);
            number(center.x); number(center.y); number(circle.radius, true);
        } else {
            const bounds = object(component(c[s.type === 'rectangle' ? 'rect' : 'oval'], 'resizable-bounds-component', ['bounds']).bounds);
            keys(bounds, ['x', 'y', 'width', 'height']);
            number(bounds.x); number(bounds.y); number(bounds.width, true); number(bounds.height, true);
        }
        if (s.type === 'rectangle') number(component(c.cornerRadius, 'rounded-corner-component', ['radius']).radius, true);
    }
}
export function serializeDocument(document: Document): string {
    validateDocument(document);
    return JSON.stringify(document, null, 2);
}
export function deserializeDocument(json: string): Document {
    const value: unknown = JSON.parse(json);
    const source = object(value);
    if (source.version === 0) {
        keys(source, ['version', 'title', 'shapes']);
        // Version 0 had no image collection or image references.
        if (!Array.isArray(source.shapes) || source.shapes.some(shape => object(shape).type === 'pixel-image'))
            throw new Error('Invalid version-0 shapes');
        const migrated = {...source, version: 1, images: []};
        validateDocument(migrated);
        return migrated;
    }
    validateDocument(value);
    return value;
}
