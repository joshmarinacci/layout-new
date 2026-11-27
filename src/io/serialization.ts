import {deriveFaces} from '../shapes/vectorNetworks';
import {normalizeColor} from '../shapes/palettes';
import {GRID_STYLES, PHOTO_MIME_TYPES, type Document} from '../model/types';
import {DEFAULT_GRID, isValidGridSize} from '../model/grid';

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
    if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
        throw new Error('Expected a plain object');
    return value as ObjectValue;
}
function keys(value: ObjectValue, expected: string[]) {
    if (Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key)))
        throw new Error(`Expected fields: ${expected.join(', ')}`);
}
function text(value: unknown) {
    if (typeof value !== 'string') throw new Error('Expected text');
}
function number(value: unknown, nonnegative = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (nonnegative && value < 0))
        throw new Error('Expected a finite valid dimension');
}
function component(value: unknown, kind: string, fields: string[]) {
    const c = object(value);
    keys(c, ['kind', ...fields]);
    if (c.kind !== kind) throw new Error(`Expected ${kind}`);
    return c;
}
function validateGrid(value: unknown) {
    const grid = object(value);
    keys(grid, ['size', 'style']);
    if (typeof grid.size !== 'number' || !isValidGridSize(grid.size)) throw new Error('Invalid grid size');
    if (!(GRID_STYLES as readonly unknown[]).includes(grid.style)) throw new Error('Invalid grid style');
}
/** Photo assets are capped at 4096 px when imported (see io/photoImport.ts). */
export const MAX_PHOTO_SIZE = 4096;
const MAX_PHOTO_DATA_LENGTH = 100_000_000;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
/**
 * Photos already checked. Documents are validated on every edit (each pointer move
 * of a drag), and Immer keeps unchanged photos as the same objects, so this avoids
 * rescanning megabytes of base64 each time. Assets are frozen, so a checked one stays valid.
 */
const validPhotos = new WeakSet<object>();

function validatePhotos(value: unknown): Map<string, ObjectValue> {
    if (!Array.isArray(value)) throw new Error('Expected photos array');
    const photos = new Map<string, ObjectValue>();
    for (const item of value) {
        const photo = object(item);
        if (validPhotos.has(photo)) {
            if (photos.has(photo.id as string)) throw new Error('Photo IDs must be nonempty and unique');
            photos.set(photo.id as string, photo);
            continue;
        }
        keys(photo, ['id', 'name', 'originalName', 'mimeType', 'width', 'height', 'data']);
        text(photo.id);
        text(photo.name);
        if (photo.originalName !== null) text(photo.originalName);
        text(photo.data);
        if (!photo.id || photos.has(photo.id as string)) throw new Error('Photo IDs must be nonempty and unique');
        if (!(PHOTO_MIME_TYPES as readonly unknown[]).includes(photo.mimeType))
            throw new Error('Unsupported photo type');
        for (const size of [photo.width, photo.height])
            if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > MAX_PHOTO_SIZE)
                throw new Error('Invalid photo dimensions');
        const data = photo.data as string;
        if (!data || data.length > MAX_PHOTO_DATA_LENGTH || data.length % 4 !== 0 || !BASE64.test(data))
            throw new Error('Invalid photo data');
        photos.set(photo.id as string, photo);
        if (Object.isFrozen(photo)) validPhotos.add(photo);
    }
    return photos;
}

function validatePhotoShape(c: ObjectValue, photos: Map<string, ObjectValue>) {
    keys(c, ['photo', 'rect']);
    const reference = component(c.photo, 'photo-reference', ['photoId', 'crop']);
    const photo = photos.get(reference.photoId as string);
    if (!photo) throw new Error('Missing photo data');
    const crop = object(reference.crop);
    keys(crop, ['x', 'y', 'width', 'height']);
    for (const field of ['x', 'y', 'width', 'height']) number(crop[field]);
    const {x, y, width, height} = crop as unknown as {x: number; y: number; width: number; height: number};
    // Crops come from floating-point maths, so allow for rounding at the photo's edges.
    const slack = 1e-6;
    if (
        x < -slack ||
        y < -slack ||
        width <= 0 ||
        height <= 0 ||
        x + width > (photo.width as number) + slack ||
        y + height > (photo.height as number) + slack
    )
        throw new Error('Photo crop must be inside its photo');
    const bounds = object(component(c.rect, 'resizable-bounds-component', ['bounds']).bounds);
    keys(bounds, ['x', 'y', 'width', 'height']);
    number(bounds.x);
    number(bounds.y);
    number(bounds.width, true);
    number(bounds.height, true);
}

function validateSchema(
    value: unknown,
    version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11,
): asserts value is Document {
    const doc = object(value);
    keys(
        doc,
        version >= 11
            ? ['version', 'title', 'shapes', 'images', 'photos', 'palettes', 'pages', 'fonts', 'settings']
            : version >= 10
              ? ['version', 'title', 'shapes', 'images', 'photos', 'palettes', 'pages', 'fonts']
              : version >= 8
                ? ['version', 'title', 'shapes', 'images', 'palettes', 'pages', 'fonts']
                : version >= 6
                  ? ['version', 'title', 'shapes', 'images', 'palettes', 'pages']
                  : version >= 4
                    ? ['version', 'title', 'shapes', 'images', 'pages']
                    : ['version', 'title', 'shapes', 'images'],
    );
    if (doc.version !== version) throw new Error('Unsupported document version');
    text(doc.title);
    if (version >= 11) {
        const settings = object(doc.settings);
        keys(settings, ['grid']);
        validateGrid(settings.grid);
    }
    if (!Array.isArray(doc.shapes)) throw new Error('Expected shapes array');
    if (!Array.isArray(doc.images)) throw new Error('Expected images array');
    const photos = version >= 10 ? validatePhotos(doc.photos) : new Map<string, ObjectValue>();
    if (version >= 6) {
        if (!Array.isArray(doc.palettes)) throw new Error('Expected palettes array');
        const paletteIds = new Set<string>();
        for (const value of doc.palettes) {
            const palette = object(value);
            keys(palette, ['id', 'name', 'colors']);
            text(palette.id);
            text(palette.name);
            if (
                !palette.id ||
                paletteIds.has(palette.id as string) ||
                !Array.isArray(palette.colors) ||
                palette.colors.length > 256
            )
                throw new Error('Invalid palette');
            paletteIds.add(palette.id as string);
            const colorIds = new Set<string>();
            for (const colorValue of palette.colors) {
                const color = object(colorValue);
                if (
                    Object.keys(color).length < 3 ||
                    Object.keys(color).length > 4 ||
                    !Object.hasOwn(color, 'id') ||
                    !Object.hasOwn(color, 'space') ||
                    !Object.hasOwn(color, 'value') ||
                    Object.keys(color).some(key => !['id', 'name', 'space', 'value'].includes(key))
                )
                    throw new Error('Invalid palette color');
                text(color.id);
                text(color.value);
                if (Object.hasOwn(color, 'name')) text(color.name);
                if (
                    !color.id ||
                    colorIds.has(color.id as string) ||
                    !['srgb', 'rgb', 'hsl', 'oklab', 'oklch'].includes(color.space as string)
                )
                    throw new Error('Invalid palette color');
                try {
                    normalizeColor(color.value as string);
                } catch {
                    throw new Error('Invalid palette color value');
                }
                colorIds.add(color.id as string);
            }
        }
    }
    const fontIds = new Set<string>();
    if (version >= 8) {
        if (!Array.isArray(doc.fonts) || doc.fonts.length > 256) throw new Error('Expected a valid font asset list');
        for (const value of doc.fonts) {
            const font = object(value);
            keys(font, ['id', 'family', 'css']);
            text(font.id);
            text(font.family);
            text(font.css);
            if (
                !font.id ||
                fontIds.has(font.id as string) ||
                !(font.family as string).trim() ||
                (font.family as string).length > 200 ||
                (font.css as string).length > 20_000_000 ||
                !(font.css as string).includes('@font-face')
            )
                throw new Error('Invalid font asset');
            fontIds.add(font.id as string);
        }
    }
    const imageIds = new Set<string>();
    for (const item of doc.images) {
        const image = object(item);
        const imageFields = ['id', 'name', 'width', 'height', 'palette', 'pixels'];
        if (version >= 3 || (version === 1 && Object.hasOwn(image, 'originalName')))
            imageFields.splice(2, 0, 'originalName');
        keys(image, imageFields);
        text(image.id);
        text(image.name);
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
    if (version >= 4) {
        if (!Array.isArray(doc.pages) || !doc.pages.length) throw new Error('Documents must contain at least one page');
        const pageIds = new Set<string>();
        const groupIds = new Set<string>();
        const membership = new Set<string>();
        for (const pageValue of doc.pages) {
            const page = object(pageValue);
            keys(
                page,
                version >= 11 && Object.hasOwn(page, 'grid')
                    ? ['id', 'name', 'groups', 'grid']
                    : ['id', 'name', 'groups'],
            );
            if (Object.hasOwn(page, 'grid')) validateGrid(page.grid);
            text(page.id);
            text(page.name);
            if (!page.id || pageIds.has(page.id as string) || !Array.isArray(page.groups))
                throw new Error('Invalid or duplicate page');
            pageIds.add(page.id as string);
            for (const groupValue of page.groups) {
                const group = object(groupValue);
                keys(group, ['id', 'name', 'shapeIds']);
                text(group.id);
                text(group.name);
                if (!group.id || groupIds.has(group.id as string) || !Array.isArray(group.shapeIds))
                    throw new Error('Invalid or duplicate group');
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
        if (s.type === 'repeating-image' && version < 4)
            throw new Error('Repeating image shapes require document version 4');
        if (s.type === 'text' && version < 8) throw new Error('Text shapes require document version 8');
        if (s.type === 'photo' && version < 10) throw new Error('Photo shapes require document version 10');
        const expectedShapeKeys =
            version >= 4 ? ['id', 'name', 'type', 'components', 'pageId'] : ['id', 'name', 'type', 'components'];
        if (version < 4 && Object.hasOwn(s, 'pageId')) expectedShapeKeys.push('pageId');
        keys(s, expectedShapeKeys);
        text(s.id);
        text(s.name);
        if (version >= 4) {
            text(s.pageId);
            if (!(doc.pages as ObjectValue[]).some(page => page.id === s.pageId))
                throw new Error('Shape references a missing page');
        }
        if (!s.id || ids.has(s.id as string)) throw new Error('Shape IDs must be nonempty and unique');
        ids.add(s.id as string);
        const c = object(s.components);
        if (s.type === 'vector') {
            if (version < 5) throw new Error('Vectors require document version 5');
            keys(c, ['network', 'stroke']);
            validateNetwork(c.network);
            const stroke = component(c.stroke, 'stroke-component', ['width', 'color']);
            text(stroke.color);
            number(stroke.width, true);
            continue;
        }
        if (s.type === 'photo') {
            validatePhotoShape(c, photos);
            continue;
        }
        if (s.type === 'pixel-image' || s.type === 'repeating-image') {
            if (s.type === 'pixel-image') keys(c, ['image', 'rect']);
            else keys(c, ['image', 'rect', 'pattern']);
            const reference = component(
                c.image,
                'pixel-image-reference',
                version === 1 ? ['imageId'] : ['imageId', 'source'],
            );
            if (!imageIds.has(reference.imageId as string)) throw new Error('Missing pixel image data');
            if (version >= 2) {
                const region = object(reference.source);
                keys(region, ['x', 'y', 'width', 'height']);
                const asset = doc.images.map(object).find(image => image.id === reference.imageId)!;
                for (const field of ['x', 'y', 'width', 'height']) {
                    if (typeof region[field] !== 'number' || !Number.isInteger(region[field]))
                        throw new Error('Image source must use integer pixels');
                }
                const {x, y, width, height} = region as unknown as {
                    x: number;
                    y: number;
                    width: number;
                    height: number;
                };
                if (
                    x < 0 ||
                    y < 0 ||
                    width < 1 ||
                    height < 1 ||
                    x + width > (asset.width as number) ||
                    y + height > (asset.height as number)
                )
                    throw new Error('Image source region must be inside its asset');
            }
            const bounds = object(component(c.rect, 'resizable-bounds-component', ['bounds']).bounds);
            keys(bounds, ['x', 'y', 'width', 'height']);
            number(bounds.x);
            number(bounds.y);
            number(bounds.width, true);
            number(bounds.height, true);
            if (s.type === 'repeating-image') {
                const pattern = component(c.pattern, 'pattern-size-component', ['width', 'height']);
                number(pattern.width);
                number(pattern.height);
                if (
                    !Number.isInteger(pattern.width) ||
                    !Number.isInteger(pattern.height) ||
                    (pattern.width as number) <= 0 ||
                    (pattern.height as number) <= 0
                )
                    throw new Error('Pattern dimensions must be positive integer pixel sizes');
            }
            continue;
        }
        if (s.type === 'text') {
            keys(c, ['rect', 'text']);
            const bounds = object(component(c.rect, 'resizable-bounds-component', ['bounds']).bounds);
            keys(bounds, ['x', 'y', 'width', 'height']);
            number(bounds.x);
            number(bounds.y);
            number(bounds.width, true);
            number(bounds.height, true);
            const textValue = component(
                c.text,
                'text-component',
                version >= 9
                    ? [
                          'text',
                          'fontId',
                          'fontSize',
                          'fontWeight',
                          'italic',
                          'color',
                          'align',
                          'verticalAlign',
                          'lineHeight',
                      ]
                    : ['text', 'fontId', 'fontSize', 'fontWeight', 'italic', 'color', 'align', 'lineHeight'],
            );
            text(textValue.text);
            text(textValue.color);
            if (textValue.fontId !== null && (typeof textValue.fontId !== 'string' || !fontIds.has(textValue.fontId)))
                throw new Error('Text shape references a missing font');
            number(textValue.fontSize);
            number(textValue.fontWeight);
            number(textValue.lineHeight);
            if (
                (textValue.fontSize as number) <= 0 ||
                !Number.isInteger(textValue.fontWeight) ||
                (textValue.fontWeight as number) < 100 ||
                (textValue.fontWeight as number) > 900 ||
                (textValue.lineHeight as number) <= 0 ||
                typeof textValue.italic !== 'boolean' ||
                !['left', 'center', 'right'].includes(textValue.align as string) ||
                (version >= 9 && !['top', 'middle', 'bottom'].includes(textValue.verticalAlign as string))
            )
                throw new Error('Invalid text style');
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
        text(stroke.color);
        number(stroke.width, true);
        if (s.type === 'circle') {
            const circle = component(c.circle, 'circle-like-component', ['center', 'radius']);
            const center = object(circle.center);
            keys(center, ['x', 'y']);
            number(center.x);
            number(center.y);
            number(circle.radius, true);
        } else {
            const bounds = object(
                component(c[s.type === 'rectangle' ? 'rect' : 'oval'], 'resizable-bounds-component', ['bounds']).bounds,
            );
            keys(bounds, ['x', 'y', 'width', 'height']);
            number(bounds.x);
            number(bounds.y);
            number(bounds.width, true);
            number(bounds.height, true);
        }
        if (s.type === 'rectangle')
            number(component(c.cornerRadius, 'rounded-corner-component', ['radius']).radius, true);
    }
    if (version >= 4) {
        const ids = new Set((doc.shapes as ObjectValue[]).map(shape => shape.id as string));
        for (const pageValue of doc.pages as unknown[])
            for (const groupValue of object(pageValue).groups as unknown[]) {
                for (const id of object(groupValue).shapeIds as unknown[])
                    if (!ids.has(id as string)) throw new Error('Group references a missing shape');
            }
    }
}
export function validateDocument(value: unknown): asserts value is Document {
    validateSchema(value, 11);
}

/**
 * Photos no shape uses any more. The live document keeps them so undo can bring a
 * deleted photo back, but they are large, so saves, exports and copies leave them out.
 */
export function withoutUnusedPhotos(document: Document): Document {
    const used = new Set(
        document.shapes.flatMap(shape => (shape.type === 'photo' ? [shape.components.photo.photoId] : [])),
    );
    return document.photos.every(photo => used.has(photo.id))
        ? document
        : {...document, photos: document.photos.filter(photo => used.has(photo.id))};
}

export function serializeDocument(document: Document): string {
    const normalized = structuredClone(withoutUnusedPhotos(document)) as Document;
    const legacyPage = normalized.pages?.[0] ?? {id: 'page_1', name: 'Page 1', groups: []};
    if (!normalized.pages?.length) normalized.pages = [legacyPage];
    normalized.shapes.forEach(shape => {
        if (!shape.pageId || !normalized.pages.some(page => page.id === shape.pageId)) shape.pageId = legacyPage.id;
    });
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
        const originalImages = (source.images as unknown as Record<string, unknown>[]).map(image => ({
            ...image,
            originalName: source.version === 3 ? image.originalName : (image.originalName ?? null),
        }));
        const page = {id: 'page_1', name: 'Page 1', groups: []};
        const sourcePages = (source.pages as unknown as Document['pages'] | undefined) ?? [page];
        source = {
            ...legacy,
            version: 4,
            pages: sourcePages,
            images: originalImages,
            shapes: legacy.shapes.map(shape => {
                if (shape.type === 'pixel-image' && fromVersion === 1) {
                    const image = legacy.images.find(image => image.id === shape.components.image.imageId)!;
                    return {
                        ...shape,
                        pageId: shape.pageId ?? page.id,
                        components: {
                            ...shape.components,
                            image: {
                                ...shape.components.image,
                                source: {x: 0, y: 0, width: image.width, height: image.height},
                            },
                        },
                    };
                }
                return {...shape, pageId: shape.pageId ?? page.id};
            }),
        };
    }
    if (source.version === 4) {
        validateSchema(source, 4);
        source = {...source, version: 5};
    }
    if (source.version === 5) {
        validateSchema(source, 5);
        source = {...source, version: 6, palettes: []};
    }
    if (source.version === 6) {
        validateSchema(source, 6);
        source = {...source, version: 7};
    }
    if (source.version === 7) {
        validateSchema(source, 7);
        source = {...source, version: 8, fonts: []};
    }
    if (source.version === 8) {
        validateSchema(source, 8);
        const legacy = source as unknown as Document;
        source = {
            ...legacy,
            version: 9,
            shapes: legacy.shapes.map(shape =>
                shape.type === 'text'
                    ? {
                          ...shape,
                          components: {
                              ...shape.components,
                              text: {...shape.components.text, verticalAlign: 'top' as const},
                          },
                      }
                    : shape,
            ),
        };
    }
    if (source.version === 9) {
        validateSchema(source, 9);
        source = {...source, version: 10, photos: []};
    }
    if (source.version === 10) {
        validateSchema(source, 10);
        source = {...source, version: 11, settings: {grid: {...DEFAULT_GRID}}};
    }
    validateDocument(source);
    for (const shape of source.shapes)
        if (shape.type === 'vector') {
            const n = shape.components.network,
                faces = deriveFaces(n);
            if (
                faces.length !== n.regions.length ||
                n.regions.some(r => {
                    const face = faces.find(f => f.key === r.key);
                    return (
                        !face ||
                        face.loops.length !== r.loops.length ||
                        face.loops.some(
                            (loop, i) =>
                                loop.length !== r.loops[i].length ||
                                loop.some((span, j) => {
                                    const saved = r.loops[i][j];
                                    return (
                                        span.segment !== saved.segment ||
                                        Math.abs(span.from - saved.from) > 0.002 ||
                                        Math.abs(span.to - saved.to) > 0.002
                                    );
                                }),
                        )
                    );
                })
            )
                throw new Error('Vector regions do not match their boundaries');
        }
    return source;
}

function validateNetwork(value: unknown) {
    const n = component(value, 'vector-network', ['origin', 'points', 'segments', 'regions', 'smooth']);
    const point = (value: unknown) => {
        const p = object(value);
        keys(p, ['x', 'y']);
        number(p.x);
        number(p.y);
    };
    point(n.origin);
    if (!Array.isArray(n.points) || !Array.isArray(n.segments) || !Array.isArray(n.regions))
        throw new Error('Invalid vector arrays');
    if (n.points.length > 1024 || n.segments.length > 2048 || n.regions.length > 4096)
        throw new Error('Vector is too complex');
    const points = new Set<string>(),
        segments = new Map<string, ObjectValue>(),
        regions = new Set<string>();
    for (const value of n.points) {
        const p = object(value);
        keys(p, ['id', 'x', 'y']);
        text(p.id);
        number(p.x);
        number(p.y);
        if (!p.id || points.has(p.id as string)) throw new Error('Invalid vector point ID');
        points.add(p.id as string);
    }
    for (const value of n.segments) {
        const s = object(value);
        keys(s, ['id', 'a', 'b', 'c1', 'c2']);
        text(s.id);
        if (!s.id || segments.has(s.id as string) || !points.has(s.a as string) || !points.has(s.b as string))
            throw new Error('Invalid vector segment reference');
        if (s.c1 !== null) point(s.c1);
        if (s.c2 !== null) point(s.c2);
        segments.set(s.id as string, s);
    }
    if (!Array.isArray(n.smooth)) throw new Error('Invalid smooth pairs');
    const paired = new Set<string>();
    for (const value of n.smooth) {
        const pair = object(value);
        keys(pair, ['point', 'segments']);
        if (
            !points.has(pair.point as string) ||
            !Array.isArray(pair.segments) ||
            pair.segments.length !== 2 ||
            pair.segments[0] === pair.segments[1]
        )
            throw new Error('Invalid smooth pair');
        for (const id of pair.segments) {
            const s = segments.get(id),
                key = `${pair.point}:${id}`;
            if (!s || (s.a !== pair.point && s.b !== pair.point) || paired.has(key))
                throw new Error('Invalid smooth connection');
            paired.add(key);
        }
    }
    for (const value of n.regions) {
        const r = object(value);
        keys(r, ['key', 'loops', 'fill']);
        text(r.key);
        if (regions.has(r.key as string)) throw new Error('Duplicate vector region');
        regions.add(r.key as string);
        if (r.fill !== null && (typeof r.fill !== 'string' || !/^#[0-9a-f]{6}$/i.test(r.fill)))
            throw new Error('Invalid vector fill');
        if (!Array.isArray(r.loops) || !r.loops.length) throw new Error('Invalid region loops');
        for (const loop of r.loops) {
            if (!Array.isArray(loop) || !loop.length) throw new Error('Empty region boundary');
            for (const value of loop) {
                const span = object(value);
                keys(span, ['segment', 'from', 'to']);
                if (!segments.has(span.segment as string)) throw new Error('Missing region segment');
                number(span.from);
                number(span.to);
                if (
                    (span.from as number) < 0 ||
                    (span.from as number) > 1 ||
                    (span.to as number) < 0 ||
                    (span.to as number) > 1 ||
                    span.from === span.to
                )
                    throw new Error('Invalid region interval');
            }
        }
    }
}
