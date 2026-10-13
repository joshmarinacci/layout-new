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
function validateSchema(value: unknown, version: 1 | 2 | 3 | 4): asserts value is Document {
    const doc = object(value); keys(doc, version === 4 ? ['version', 'title', 'shapes', 'images', 'pages'] : ['version', 'title', 'shapes', 'images']);
    if (doc.version !== version) throw new Error('Unsupported document version');
    text(doc.title);
    if (!Array.isArray(doc.shapes)) throw new Error('Expected shapes array');
    if (!Array.isArray(doc.images)) throw new Error('Expected images array');
    const imageIds = new Set<string>();
    for (const item of doc.images) {
        const image = object(item);
        const imageFields = ['id', 'name', 'width', 'height', 'palette', 'pixels'];
        if (version >= 3 || (version === 1 && Object.hasOwn(image, 'originalName'))) imageFields.splice(2, 0, 'originalName');
        keys(image, imageFields);
        text(image.id); text(image.name);
        if (version >= 3 && image.originalName !== null) text(image.originalName);
        if (!image.id || imageIds.has(image.id as string)) throw new Error('Image IDs must be nonempty and unique');
        imageIds.add(image.id as string);
        for (const size of [image.width, image.height]) {
            if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > (version === 1 ? 256 : 2048))
                throw new Error('Invalid pixel image dimensions');
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
    if (version === 4) {
        if (!Array.isArray(doc.pages) || !doc.pages.length) throw new Error('Documents must contain at least one page');
        const pageIds = new Set<string>(); const groupIds = new Set<string>(); const membership = new Set<string>();
        for (const pageValue of doc.pages) {
            const page = object(pageValue); keys(page, ['id', 'name', 'groups']); text(page.id); text(page.name);
            if (!page.id || pageIds.has(page.id as string) || !Array.isArray(page.groups)) throw new Error('Invalid or duplicate page');
            pageIds.add(page.id as string);
            for (const groupValue of page.groups) {
                const group = object(groupValue); keys(group, ['id', 'name', 'shapeIds']); text(group.id); text(group.name);
                if (!group.id || groupIds.has(group.id as string) || !Array.isArray(group.shapeIds)) throw new Error('Invalid or duplicate group');
                groupIds.add(group.id as string);
                for (const id of group.shapeIds) {
                    text(id);
                    if (membership.has(id as string)) throw new Error('A shape can belong to only one group');
                    membership.add(id as string);
                }
            }
        }
    }
    const ids = new Set<string>();
    for (const item of doc.shapes) {
        const s = object(item);
        if (s.type === 'repeating-image' && version !== 4) throw new Error('Repeating image shapes require document version 4');
        const expectedShapeKeys = version === 4 ? ['id', 'name', 'type', 'components', 'pageId'] : ['id', 'name', 'type', 'components'];
        if (version < 4 && Object.hasOwn(s, 'pageId')) expectedShapeKeys.push('pageId');
        keys(s, expectedShapeKeys);
        text(s.id); text(s.name);
        if (version === 4) { text(s.pageId); if (!(doc.pages as ObjectValue[]).some(page => page.id === s.pageId)) throw new Error('Shape references a missing page'); }
        if (!s.id || ids.has(s.id as string)) throw new Error('Shape IDs must be nonempty and unique');
        ids.add(s.id as string);
        const c = object(s.components);
        if (s.type === 'pixel-image' || s.type === 'repeating-image') {
            if (s.type === 'pixel-image') keys(c, ['image', 'rect']);
            else keys(c, ['image', 'rect', 'pattern']);
            const reference = component(c.image, 'pixel-image-reference', version === 1 ? ['imageId'] : ['imageId', 'source']);
            if (!imageIds.has(reference.imageId as string)) throw new Error('Missing pixel image data');
            if (version >= 2) {
                const region = object(reference.source); keys(region, ['x', 'y', 'width', 'height']);
                const asset = doc.images.map(object).find(image => image.id === reference.imageId)!;
                for (const field of ['x', 'y', 'width', 'height']) {
                    if (typeof region[field] !== 'number' || !Number.isInteger(region[field])) throw new Error('Image source must use integer pixels');
                }
                const {x, y, width, height} = region as unknown as {x: number; y: number; width: number; height: number};
                if (x < 0 || y < 0 || width < 1 || height < 1 || x + width > (asset.width as number) || y + height > (asset.height as number))
                    throw new Error('Image source region must be inside its asset');
            }
            const bounds = object(component(c.rect, 'resizable-bounds-component', ['bounds']).bounds);
            keys(bounds, ['x', 'y', 'width', 'height']);
            number(bounds.x); number(bounds.y); number(bounds.width, true); number(bounds.height, true);
            if (s.type === 'repeating-image') {
                const pattern = component(c.pattern, 'pattern-size-component', ['width', 'height']);
                number(pattern.width); number(pattern.height);
                if (!Number.isInteger(pattern.width) || !Number.isInteger(pattern.height) || (pattern.width as number) <= 0 || (pattern.height as number) <= 0)
                    throw new Error('Pattern dimensions must be positive integer pixel sizes');
            }
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
    if (version === 4) {
        const ids = new Set((doc.shapes as ObjectValue[]).map(shape => shape.id as string));
        for (const pageValue of doc.pages as unknown[]) for (const groupValue of object(pageValue).groups as unknown[]) {
            for (const id of object(groupValue).shapeIds as unknown[]) if (!ids.has(id as string)) throw new Error('Group references a missing shape');
        }
    }
}
export function validateDocument(value: unknown): asserts value is Document {
    validateSchema(value, 4);
}
export function serializeDocument(document: Document): string {
    const normalized = structuredClone(document) as Document;
    const legacyPage = normalized.pages?.[0] ?? {id: 'page_1', name: 'Page 1', groups: []};
    if (!normalized.pages?.length) normalized.pages = [legacyPage];
    normalized.shapes.forEach(shape => { if (!shape.pageId || !normalized.pages.some(page => page.id === shape.pageId)) shape.pageId = legacyPage.id; });
    validateDocument(normalized);
    return JSON.stringify(normalized, null, 2);
}
export function deserializeDocument(json: string): Document {
    const value: unknown = JSON.parse(json);
    let source = object(value);
    if (source.version === 0) {
        keys(source, ['version', 'title', 'shapes']);
        if (!Array.isArray(source.shapes) || source.shapes.some(shape => object(shape).type === 'pixel-image'))
            throw new Error('Invalid version-0 shapes');
        source = {...source, version: 1, images: []};
    }
    if (source.version === 1 || source.version === 2 || source.version === 3) {
        const fromVersion = source.version;
        if (fromVersion < 4 && Object.hasOwn(source, 'pages')) delete source.pages;
        validateSchema(source, fromVersion);
        const legacy = source as unknown as Document;
        const originalImages = (source.images as unknown as Record<string, unknown>[]).map(image => ({...image, originalName: source.version === 3 ? image.originalName : image.originalName ?? null}));
        const page = {id: 'page_1', name: 'Page 1', groups: []};
        const sourcePages = (source.pages as unknown as Document['pages'] | undefined) ?? [page];
        source = {...legacy, version: 4, pages: sourcePages, images: originalImages,
            shapes: legacy.shapes.map(shape => {
                if (shape.type === 'pixel-image' && fromVersion === 1) {
                    const image = legacy.images.find(image => image.id === shape.components.image.imageId)!;
                    return {...shape, pageId: shape.pageId ?? page.id, components: {...shape.components, image: {...shape.components.image,
                        source: {x: 0, y: 0, width: image.width, height: image.height}}}};
                }
                return {...shape, pageId: shape.pageId ?? page.id};
            })};
    }
    validateDocument(source);
    return source;
}
