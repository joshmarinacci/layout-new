import type {
    Bounds, CircleShape, Point,
    DrawDocument,
    FillComponent,
    RectangleShape,
    Shape, ShapeComponent, StrokeComponent
} from "./types";

function gen_id(rect1: string) {
    return rect1+"_"+crypto.randomUUID()
}

export function makeRect(name: string, bounds: Bounds): RectangleShape {
    return {
        id: gen_id("rect"),
        pageId: 'page_1',
        type: 'rectangle',
        name: name,
        components: {
            rect: {
                kind: 'resizable-bounds-component',
                bounds: bounds,
            },
            fill: {
                kind: 'fill-component',
                fill: {
                    kind: "solid",
                    color: "red"
                }
            },
            stroke: {
                kind: 'stroke-component',
                width: 1,
                color: "black"
            },
            cornerRadius: {
                kind: 'rounded-corner-component',
                radius: 10
            }
        }
    }
}

export function makeCircle(name: string, center: Point, radius: number): CircleShape {
    return {
        id: gen_id('circle'), pageId: 'page_1', name, type: 'circle',
        components: {
            circle: {kind: 'circle-like-component', center: {...center}, radius},
            fill: {kind: 'fill-component', fill: {kind: 'solid', color: '#ff0000'}},
            stroke: {kind: 'stroke-component', width: 1, color: '#000000'},
        },
    };
}

export function updateRectName(rect: RectangleShape, name: string): RectangleShape {
    return {
        ...rect,
        name: name,
    }
}


export function updateRectFill(rect: RectangleShape, color: string):RectangleShape {
    return {
        ...rect,
        components: {
            ...rect.components,
            fill: {
                ...rect.components.fill,
                fill: {
                    kind: "solid",
                    color: color
                }
            }
        }
    }

}

export function updateDocShape(doc: DrawDocument, shape: Shape): DrawDocument {
    let new_shapes = doc.shapes.slice()
    let index = new_shapes.findIndex(candidate => candidate.id === shape.id)
    if (index < 0) {
        throw new Error("shape not found in the list")
    }
    new_shapes[index] = shape
    return {
        ...doc,
        shapes: new_shapes,
    }
}

export function appendShape(doc: DrawDocument, rectangleShape: RectangleShape): DrawDocument {
    return {
        ...doc,
        shapes: [...doc.shapes, rectangleShape]
    }
}

export function updateFillComp(comp: FillComponent, color: string): FillComponent {
    return {
        ...comp,
        fill: {
            kind: 'solid',
            color: color,
        }
    }
}
export function updateStrokeComp(comp: StrokeComponent, color: string):StrokeComponent {
    return {
        ...comp,
        color: color
    }
}

export function updateShapeComp<S extends Shape, K extends keyof S['components']>(shape: S, name: K, comp: S['components'][K]): S {
    return {...shape, components: {...shape.components, [name]: comp}};
}
