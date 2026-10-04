
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
    kind: "solid";
    color: string;
}

export type Fill = SolidFill

export interface ColorAsset {
    id: string;
    kind: "color";
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
    kind: "gradient";
    name: string;
    type: "linear";
    angle: number;
    stops: GradientStop[];
}

export interface ImageAsset {
    id: string;
    kind: "image";
    name: string;
    mimeType: string;
    dataUrl: string;
    width: number;
    height: number;
}

/* ========== components ========= */

export type ShapeComponent = ResizableBoundsComponent | FillComponent | RoundedCornerComponent | StrokeComponent | CircleLikeComponent | PixelImageReferenceComponent;

export interface ResizableBoundsComponent {
    kind: 'resizable-bounds-component'
    bounds: Bounds;
}

export interface FillComponent {
    kind: 'fill-component'
    fill: Fill;
}

export interface RoundedCornerComponent {
    kind: 'rounded-corner-component'
    radius: number;
}

export interface StrokeComponent {
    kind: 'stroke-component'
    color: string;
    width: number;
}

export interface CircleLikeComponent {
    kind: 'circle-like-component'
    center: Point;
    radius: number;
}

/* =============== shapes ============ */

interface BaseShape {
    id: string;
    name: string;

}

export interface RectangleShape extends BaseShape {
    type: "rectangle";
    components: {
        rect: ResizableBoundsComponent;
        fill: FillComponent;
        stroke: StrokeComponent;
        cornerRadius: RoundedCornerComponent;
    };
}

export interface CircleShape extends BaseShape {
    type: "circle";
    components: {
        circle: CircleLikeComponent;
        fill: FillComponent;
        stroke: StrokeComponent;
    };
}

export interface OvalShape extends BaseShape {
    type: "oval";
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

export interface PixelImageShape extends BaseShape {
    type: 'pixel-image';
    components: {
        image: PixelImageReferenceComponent;
        rect: ResizableBoundsComponent;
    };
}

/* ========== document ======== */

export type Shape = RectangleShape | CircleShape | OvalShape | PixelImageShape;

export interface Document {
    version: 3
    title: string
    shapes: Shape[];
    images: PixelImageData[];
}

export type DrawDocument = Document;