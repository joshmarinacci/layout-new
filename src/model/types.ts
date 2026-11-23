/* ========= primitives ========== */
export interface Point {
    x: number;
    y: number;
}

export interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface SolidFill {
    kind: 'solid';
    color: string;
}

export type Fill = SolidFill;

export interface ColorAsset {
    id: string;
    kind: 'color';
    name: string;
    value: string;
}

export interface GradientStop {
    id: string;
    offset: number;
    color: string;
}

export interface GradientAsset {
    id: string;
    kind: 'gradient';
    name: string;
    type: 'linear';
    angle: number;
    stops: GradientStop[];
}

/** The image formats a photo asset can hold; anything else is converted on import. */
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type PhotoMimeType = (typeof PHOTO_MIME_TYPES)[number];

/**
 * A photo or other ordinary bitmap, stored once per document however many shapes
 * show it. `data` is the encoded file (base64, without a `data:` prefix), already
 * upright (EXIF orientation applied) and no larger than 4096 px on its longest side.
 */
export interface PhotoAsset {
    id: string;
    name: string;
    originalName: string | null;
    mimeType: PhotoMimeType;
    width: number;
    height: number;
    data: string;
}

export interface PaletteColor {
    id: string;
    name?: string;
    space: 'srgb' | 'rgb' | 'hsl' | 'oklab' | 'oklch';
    /** CSS color value in `space`; converted on demand for display and use. */
    value: string;
}

export interface ColorPalette {
    id: string;
    name: string;
    colors: PaletteColor[];
}

/** A self-contained Google Fonts stylesheet with its WOFF2 sources embedded. */
export interface FontAsset {
    id: string;
    family: string;
    css: string;
}

/* ========== components ========= */

export type ShapeComponent =
    | VectorNetwork
    | ResizableBoundsComponent
    | FillComponent
    | RoundedCornerComponent
    | StrokeComponent
    | CircleLikeComponent
    | PixelImageReferenceComponent
    | PatternSizeComponent
    | TextComponent;

export interface ResizableBoundsComponent {
    kind: 'resizable-bounds-component';
    bounds: Bounds;
}

export interface FillComponent {
    kind: 'fill-component';
    fill: Fill;
}

export interface RoundedCornerComponent {
    kind: 'rounded-corner-component';
    radius: number;
}

export interface StrokeComponent {
    kind: 'stroke-component';
    color: string;
    width: number;
}

export interface CircleLikeComponent {
    kind: 'circle-like-component';
    center: Point;
    radius: number;
}

/* =============== shapes ============ */

interface BaseShape {
    id: string;
    name: string;
    pageId?: string;
}

export interface RectangleShape extends BaseShape {
    type: 'rectangle';
    components: {
        rect: ResizableBoundsComponent;
        fill: FillComponent;
        stroke: StrokeComponent;
        cornerRadius: RoundedCornerComponent;
    };
}

export interface CircleShape extends BaseShape {
    type: 'circle';
    components: {
        circle: CircleLikeComponent;
        fill: FillComponent;
        stroke: StrokeComponent;
    };
}

export interface OvalShape extends BaseShape {
    type: 'oval';
    components: {
        oval: ResizableBoundsComponent;
        fill: FillComponent;
        stroke: StrokeComponent;
    };
}

export interface PixelImageData {
    id: string;
    name: string;
    originalName: string | null;
    width: number;
    height: number;
    palette: string[];
    /** Row-major palette indices; -1 is transparent. */
    pixels: number[];
}

export interface PixelImageReferenceComponent {
    kind: 'pixel-image-reference';
    imageId: string;
    /** Pixel rectangle in the shared image, independent of display bounds. */
    source: Bounds;
}

export interface PatternSizeComponent {
    kind: 'pattern-size-component';
    width: number;
    height: number;
}

export interface PixelImageShape extends BaseShape {
    type: 'pixel-image';
    components: {
        image: PixelImageReferenceComponent;
        rect: ResizableBoundsComponent;
    };
}

export interface RepeatingImageShape extends BaseShape {
    type: 'repeating-image';
    components: {
        image: PixelImageReferenceComponent;
        rect: ResizableBoundsComponent;
        pattern: PatternSizeComponent;
    };
}

export interface PhotoReferenceComponent {
    kind: 'photo-reference';
    photoId: string;
    /** The visible part of the photo, in its pixels; the whole photo when uncropped. */
    crop: Bounds;
}

export interface PhotoShape extends BaseShape {
    type: 'photo';
    components: {
        photo: PhotoReferenceComponent;
        rect: ResizableBoundsComponent;
    };
}

export interface TextComponent {
    kind: 'text-component';
    text: string;
    fontId: string | null;
    fontSize: number;
    fontWeight: number;
    italic: boolean;
    color: string;
    align: 'left' | 'center' | 'right';
    verticalAlign: 'top' | 'middle' | 'bottom';
    lineHeight: number;
}

export interface TextShape extends BaseShape {
    type: 'text';
    components: {
        rect: ResizableBoundsComponent;
        text: TextComponent;
    };
}

/* ========== document ======== */

export type Shape =
    | VectorShape
    | RectangleShape
    | CircleShape
    | OvalShape
    | PixelImageShape
    | RepeatingImageShape
    | TextShape
    | PhotoShape;

export interface ShapeGroup {
    id: string;
    name: string;
    shapeIds: string[];
}

export interface Page {
    id: string;
    name: string;
    groups: ShapeGroup[];
}

export interface Document {
    version: 10;
    title: string;
    shapes: Shape[];
    images: PixelImageData[];
    photos: PhotoAsset[];
    palettes: ColorPalette[];
    fonts: FontAsset[];
    pages: Page[];
}

export type DrawDocument = Document;

/** Points and controls are local to origin. IDs are scoped to this network. */
export interface VectorPoint extends Point {
    id: string;
}

export interface VectorSegment {
    id: string;
    a: string;
    b: string;
    c1: Point | null;
    c2: Point | null;
}

export interface VectorSpan {
    segment: string;
    from: number;
    to: number;
}

export interface VectorRegion {
    key: string;
    loops: VectorSpan[][];
    fill: string | null;
}

export interface VectorNetwork {
    kind: 'vector-network';
    origin: Point;
    points: VectorPoint[];
    segments: VectorSegment[];
    regions: VectorRegion[];
    smooth: {point: string; segments: [string, string]}[];
}

export interface VectorShape extends BaseShape {
    type: 'vector';
    components: {network: VectorNetwork; stroke: StrokeComponent};
}
