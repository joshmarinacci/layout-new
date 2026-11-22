import type {Bounds, PixelImageData, PixelImageShape, Point, RepeatingImageShape} from '../model/types';

export const PALETTES = {
    'PICO-8': [
        '#000000',
        '#1d2b53',
        '#7e2553',
        '#008751',
        '#ab5236',
        '#5f574f',
        '#c2c3c7',
        '#fff1e8',
        '#ff004d',
        '#ffa300',
        '#ffec27',
        '#00e436',
        '#29adff',
        '#83769c',
        '#ff77a8',
        '#ffccaa',
    ],
    'Classic 16': [
        '#000000',
        '#ffffff',
        '#880000',
        '#aaffee',
        '#cc44cc',
        '#00cc55',
        '#0000aa',
        '#eeee77',
        '#dd8855',
        '#664400',
        '#ff7777',
        '#333333',
        '#777777',
        '#aaff66',
        '#0088ff',
        '#bbbbbb',
    ],
    Grayscale: ['#000000', '#242424', '#484848', '#6d6d6d', '#929292', '#b6b6b6', '#dadada', '#ffffff'],
    'Pocket 4': ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
};
export function makePixelImage(
    width: number,
    height: number,
    palette: readonly string[],
    name = 'Pixel art',
): PixelImageData {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 256 || height > 256)
        throw new Error('Choose dimensions from 1 to 256 pixels');
    if (!palette.length || palette.length > 256 || palette.some(color => !/^#[0-9a-f]{6}$/i.test(color)))
        throw new Error('Invalid palette');
    return {
        id: crypto.randomUUID(),
        name,
        originalName: null,
        width,
        height,
        palette: [...palette],
        pixels: Array(width * height).fill(-1),
    };
}
export function makeImageShape(imageId: string, bounds: Bounds, source: Bounds, name = 'Pixel art'): PixelImageShape {
    return {
        id: crypto.randomUUID(),
        pageId: 'page_1',
        name,
        type: 'pixel-image',
        components: {
            image: {kind: 'pixel-image-reference', imageId, source: {...source}},
            rect: {kind: 'resizable-bounds-component', bounds: {...bounds}},
        },
    };
}
export function makeRepeatingImageShape(
    imageId: string,
    source: Bounds,
    bounds: Bounds,
    name = 'Repeating pixel art',
): RepeatingImageShape {
    return {
        id: crypto.randomUUID(),
        pageId: 'page_1',
        name,
        type: 'repeating-image',
        components: {
            image: {kind: 'pixel-image-reference', imageId, source: {...source}},
            rect: {kind: 'resizable-bounds-component', bounds: {...bounds}},
            pattern: {kind: 'pattern-size-component', width: source.width, height: source.height},
        },
    };
}
function inside(image: Pick<PixelImageData, 'width' | 'height'>, p: Point) {
    return (
        Number.isInteger(p.x) &&
        Number.isInteger(p.y) &&
        p.x >= 0 &&
        p.y >= 0 &&
        p.x < image.width &&
        p.y < image.height
    );
}
function checkColor(image: PixelImageData, color: number) {
    if (!Number.isInteger(color) || color < -1 || color >= image.palette.length)
        throw new Error('Invalid palette index');
}
export function samplePixel(image: PixelImageData, point: Point): number | undefined {
    return inside(image, point) ? image.pixels[point.y * image.width + point.x] : undefined;
}
// Mutates an Immer draft (or an explicitly owned image), never a store snapshot.
export function paintPixelLine(image: PixelImageData, from: Point, to: Point, color: number) {
    checkColor(image, color);
    if (!inside(image, from) || !inside(image, to)) throw new Error('Pixel coordinates are out of bounds');
    let {x, y} = from;
    const dx = Math.abs(to.x - x),
        dy = -Math.abs(to.y - y);
    const sx = x < to.x ? 1 : -1,
        sy = y < to.y ? 1 : -1;
    let error = dx + dy;
    for (;;) {
        image.pixels[y * image.width + x] = color;
        if (x === to.x && y === to.y) break;
        const twice = 2 * error;
        if (twice >= dy) {
            error += dy;
            x += sx;
        }
        if (twice <= dx) {
            error += dx;
            y += sy;
        }
    }
}
export function floodFillPixels(image: PixelImageData, point: Point, color: number) {
    checkColor(image, color);
    const target = samplePixel(image, point);
    if (target === undefined) throw new Error('Pixel coordinates are out of bounds');
    if (target === color) return;
    const stack = [point.y * image.width + point.x];
    image.pixels[stack[0]] = color;
    while (stack.length) {
        const index = stack.pop()!;
        const x = index % image.width,
            y = Math.floor(index / image.width);
        const visit = (next: number) => {
            if (image.pixels[next] === target) {
                image.pixels[next] = color;
                stack.push(next);
            }
        };
        if (x > 0) visit(index - 1);
        if (x < image.width - 1) visit(index + 1);
        if (y > 0) visit(index - image.width);
        if (y < image.height - 1) visit(index + image.width);
    }
}

export function drawPixelImage(ctx: CanvasRenderingContext2D, image: PixelImageData) {
    ctx.clearRect(0, 0, image.width, image.height);
    image.pixels.forEach((index, offset) => {
        if (index < 0) return;
        ctx.fillStyle = image.palette[index];
        ctx.fillRect(offset % image.width, Math.floor(offset / image.width), 1, 1);
    });
}

/** Resize from the initial bounds; the dominant proportional drag controls a locked ratio. */
export function resizeImageBounds(bounds: Bounds, dx: number, dy: number, lockAspect: boolean): Bounds {
    if (lockAspect && bounds.width > 0 && bounds.height > 0) {
        const change =
            Math.abs(dx / bounds.width) >= Math.abs(dy / bounds.height) ? dx / bounds.width : dy / bounds.height;
        const scale = Math.max(1 / bounds.width, 1 / bounds.height, 1 + change);
        return {...bounds, width: bounds.width * scale, height: bounds.height * scale};
    }
    return {...bounds, width: Math.max(1, bounds.width + dx), height: Math.max(1, bounds.height + dy)};
}

export function validateImageRegion(image: PixelImageData, region: Bounds) {
    if (
        ![region.x, region.y, region.width, region.height].every(Number.isInteger) ||
        region.x < 0 ||
        region.y < 0 ||
        region.width < 1 ||
        region.height < 1 ||
        region.x + region.width > image.width ||
        region.y + region.height > image.height
    )
        throw new Error('Image source region must be an integer rectangle inside its asset');
}
export function readImageRegion(image: PixelImageData, region: Bounds): PixelImageData {
    validateImageRegion(image, region);
    const pixels: number[] = [];
    for (let y = 0; y < region.height; y++) {
        const start = (region.y + y) * image.width + region.x;
        pixels.push(...image.pixels.slice(start, start + region.width));
    }
    return {...image, width: region.width, height: region.height, pixels, palette: [...image.palette]};
}
export function paintImageRegion(image: PixelImageData, region: Bounds, from: Point, to: Point, color: number) {
    validateImageRegion(image, region);
    const view = {width: region.width, height: region.height};
    if (!inside(view, from) || !inside(view, to)) throw new Error('Pixel coordinates are out of bounds');
    paintPixelLine(
        image,
        {x: region.x + from.x, y: region.y + from.y},
        {x: region.x + to.x, y: region.y + to.y},
        color,
    );
}
export function fillImageRegion(image: PixelImageData, region: Bounds, point: Point, color: number) {
    const view = readImageRegion(image, region);
    floodFillPixels(view, point, color);
    for (let y = 0; y < region.height; y++)
        for (let x = 0; x < region.width; x++) {
            const destination = (region.y + y) * image.width + region.x + x;
            const value = view.pixels[y * region.width + x];
            if (image.pixels[destination] !== value) image.pixels[destination] = value;
        }
}
