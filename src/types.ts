
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

export type ShapeComponent = ResizableBoundsComponent | FillComponent | RoundedCornerComponent | StrokeComponent | CircleLikeComponent;

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

/* ========== document ======== */

export type Shape = RectangleShape | CircleShape | OvalShape;

export interface Document {
    version: 0
    title: string
    shapes: Shape[];
}

export type DrawDocument = Document;