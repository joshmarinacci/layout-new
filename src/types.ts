export type Tool = "select" | "rectangle" | "pan";
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

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

export interface ShapeComponent extends Record<string, unknown> {
    kind: string
}

export interface ResizableBoundsComponent extends ShapeComponent {
    kind: 'resizable-bounds-component'
    bounds: Bounds;
}

export interface FillComponent extends ShapeComponent {
    kind: 'fill-component'
    fill: Fill;
}

export interface RoundedCornerComponent extends ShapeComponent {
    kind: 'rounded-corner-component'
    radius: number;
}

export interface StrokeComponent extends ShapeComponent {
    kind: 'stroke-component'
    color: string;
    width: number;
    // position: "inside" | "center" | "outside"
}

export interface CircleLikeComponent extends ShapeComponent {
    kind: 'circle-like-component'
    center: Point;
    radius: number;
}

/* =============== shapes ============ */

export interface Shape {
    id: string;
    name: string;
    type: string;
    // parentId?: string | null;
    components: Record<string, ShapeComponent>;
}

export interface RectangleShape extends Shape {
    type: "rectangle";
    components: {
        rect: ResizableBoundsComponent;
        fill: FillComponent;
        stroke: StrokeComponent;
        cornerRadius: RoundedCornerComponent;
    };
}

// export interface GroupShape extends Shape {
//   type: "group";
//   components: {
//     group: Record<string, never>;
//   };
// }
//
// export interface TextShape extends Shape {
//   type: "text";
//   components: {
//     rect: ResizableBoundsComponent;
//     fill: FillComponent;
//     text: TextComponent;
//   };
// }

export interface CircleShape extends Shape {
    type: "circle";
    components: {
        circle: CircleLikeComponent;
        fill: FillComponent;
        stroke: StrokeComponent;
    };
}

export interface OvalShape extends Shape {
    type: "oval";
    components: {
        oval: ResizableBoundsComponent;
        fill: FillComponent;
        stroke: StrokeComponent;
    };
}

// export interface PolygonShape extends Shape {
//   type: "polygon";
//   components: {
//     polygon: PolygonComponent;
//     fill: FillComponent;
//     stroke: StrokeComponent;
//   };
// }
//
// export interface StarShape extends Shape {
//   type: "star";
//   components: {
//     star: StarComponent;
//     fill: FillComponent;
//     stroke: StrokeComponent;
//   };
// }
//
// export interface ImageShape extends Shape {
//   type: "image";
//   components: {
//     rect: Bounds;
//     image: ImageComponent;
//   };
// }

/* ========== document ======== */

// export interface AssetCollections {
//   colors: Record<string, ColorAsset>;
//   gradients: Record<string, GradientAsset>;
//   hatched: Record<string, HatchedAsset>;
//   images: Record<string, ImageAsset>;
// }
//
export interface DrawDocument {
    version: number
    title: string
    shapes: Shape[];
}

// export interface SnapGuide {
//   axis: "x" | "y";
//   position: number;
// }

// export interface Viewport {
//   panX: number;
//   panY: number;
//   zoom: number;
// }
//
// export const MIN_SHAPE_SIZE = 8;
// export const MIN_TYPED_SHAPE_SIZE = 0;

/* ======= Actions =========== */

export type ActionIconName =
    | "file-plus-2"
    | "folder-open"
    | "circle-plus"
    | "image-plus"
    | "scissors"
    | "trash-2"
    | "copy"
    | "clipboard-paste"
    | "files"
    | "undo-2"
    | "redo-2"
    | "search"
    | "zoom-in"
    | "zoom-out"
    | "maximize-2"
    | "save";
export type PowerupActionLocation =
    | "menu-file"
    | "menu-edit"
    | "menu-shapes"
    | "menu-view"
    | "tree-layer-context"
    | "tree-shape-context"
    | "canvas-shape-context";

export interface PowerupAction {
    name: string;
    title: string;
    description: string;
    tags: string[];
    icon: ActionIconName;
    locations: PowerupActionLocation[];
    // isVisible?: (state: AppState) => boolean;
    // isEnabled?: (state: AppState) => boolean;
    // run: (appState: AppStateStore) => void;
}

export interface ExporterAction extends PowerupAction {
    kind: "exporter";
    fileExtension: string;
    mimeType: string;
}

export interface SingleComponentEditorArgs {
    shape: Shape;
    document: DrawDocument
    updateShape: (updater: (shape: Shape) => Shape) => void;
}

export interface MultiComponentEditorArgs {
    shapes: Shape[];
    document: DrawDocument;
    bounds: Bounds | null;
    updateShapes: (updater: (shape: Shape) => Shape) => void;
}

export interface PowerupComponentDefinition {
    key: string;
    title: string;
    // renderSingle: (args: SingleComponentEditorArgs) => ReactNode;
    // renderMulti?: (args: MultiComponentEditorArgs) => ReactNode;
}

// export interface PowerupShapeDefinition {
//   type: string;
//   components: PowerupComponentDefinition[];
//   drawShape: (context: CanvasRenderingContext2D, shape: Shape, options: DrawShapeOptions) => void;
//   getBounds: (shape: Shape, document: DocumentV1) => Bounds | null;
//   hitTest: (point: Point, shape: Shape, document: DocumentV1) => boolean;
//   sanitizeShape?: (shape: Shape) => Shape;
//   resizeShape?: (shape: Shape, handle: string, point: Point) => Shape;
//   translateShape?: (shape: Shape, delta: Point) => Shape;
//   getSelectionHandles?: (shape: Shape) => SelectionHandle[];
//   describeShape?: (shape: Shape) => string;
//   normalizeSerializedShape?: (item: Record<string, unknown>) => Shape | null;
//   serializeShape?: (shape: Shape) => Record<string, unknown>;
//   createShapeAt?: (start: Point, current: Point) => Shape;
//   createDefaultShape?: (state: AppState) => Shape;
// }

export interface Powerup {
    id: string;
    name: string;
    description: string;
    type: string;
    // shapes: PowerupShapeDefinition[];
    actions: PowerupAction[];
}
