import {EditorStore} from "./EditorStore";
import {makeCircle, makeRect} from "./reducer";
import type {Shape} from "./types";

export interface PageAction {
    title: string
    description?: string
    shortcut?: string
    perform: (store: EditorStore, pageId: string) => void
}


export const new_page_rectangle: PageAction = {
    title: 'New Rectangle x',
    perform: (store: EditorStore, pageId: string) => {
        store.selectPage(pageId);
        const shape = makeRect('Rectangle', {
            x: 50,
            y: 50,
            width: 100,
            height: 80
        });
        store.addShape(shape);
        store.select(shape.id);
    }
}
export const new_page_circle: PageAction = {
    title: 'New Circle x',
    perform: (store: EditorStore, pageId: string) => {
        store.selectPage(pageId);
        const shape = makeCircle('Circle', {x: 100, y: 100}, 40);
        store.addShape(shape);
        store.select(shape.id);
    }
}

export const new_rect: StoreAction = {
    title: 'New Rectangle x',
    perform: store => {
        const shape = makeRect('rect', {x: 50, y: 250, width: 50, height: 50});
        store.addShape(shape);
        store.select(shape.id);
    }
}

export const new_circle: StoreAction = {
    title: 'New Circle x',
    perform: store => {
        const shape = makeCircle('circle', {x: 100, y: 300}, 40);
        store.addShape(shape);
        store.select(shape.id);
    }
}

export const page_menu_actions: PageAction[] = [
    new_page_rectangle,
    new_page_circle
]

export interface StoreAction {
    title: string,
    description?: string,
    shortcut?: string,
    perform: (store: EditorStore) => void
}

export const create_new_page: StoreAction = {
    title: 'New Page',
    perform: (store: EditorStore) => {
        store.createPage();
    }
}

export interface ShapeAction {
    title: string
    description?: string
    shortcut?: string
    perform: (store: EditorStore, shapes: Shape[]) => void
}

export const duplicate_selection: ShapeAction = {
    title: 'Duplicate x',
    perform: (store, shapes) => {
        if (shapes.length) {
            store.duplicateShapes(shapes.map(shape => shape.id))
        }
    }
}

export const delete_selection: ShapeAction = {
    title: 'Delete x',
    perform: (store, shapes) => {
        if (!shapes.length) return;
        store.beginTransaction('Delete selection');
        shapes.forEach(shape => store.removeShape(shape.id));
        store.commitTransaction();
        store.select(null);
    }
}
