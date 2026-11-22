export type Tool = 'select' | 'rectangle' | 'pan';
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
import type {Bounds, DrawDocument, Shape} from './types';

export type ActionIconName =
    | 'file-plus-2'
    | 'folder-open'
    | 'circle-plus'
    | 'image-plus'
    | 'scissors'
    | 'trash-2'
    | 'copy'
    | 'clipboard-paste'
    | 'files'
    | 'undo-2'
    | 'redo-2'
    | 'search'
    | 'zoom-in'
    | 'zoom-out'
    | 'maximize-2'
    | 'save';
export type PowerupActionLocation =
    | 'menu-file'
    | 'menu-edit'
    | 'menu-shapes'
    | 'menu-view'
    | 'tree-layer-context'
    | 'tree-shape-context'
    | 'canvas-shape-context';

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
    kind: 'exporter';
    fileExtension: string;
    mimeType: string;
}

export interface SingleComponentEditorArgs {
    shape: Shape;
    document: DrawDocument;
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
