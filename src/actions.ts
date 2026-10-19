import {EditorStore} from "./EditorStore";
import {makeCircle, makeRect} from "./reducer";

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


export const page_menu_actions: PageAction[] = [
    new_page_rectangle,
    new_page_circle
]

