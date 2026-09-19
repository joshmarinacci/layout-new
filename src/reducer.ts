import type {Bounds, DrawDocument, RectangleShape} from "./types";

function gen_id(rect1: string) {
    return rect1+"_"+Math.floor(Math.random()*1_000_000)
}

export function makeRect(name: string, bounds: Bounds): RectangleShape {
    return {
        id: gen_id("rect"),
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

export function updateRectName(rect: RectangleShape, name: string): RectangleShape {
    return {
        ...rect,
        name: name,
    }
}

export function updateDocShape(doc: DrawDocument, rect: RectangleShape): DrawDocument {
    let new_shapes = doc.shapes.slice()
    let index = new_shapes.findIndex(shape => shape.id === rect.id)
    if (index < 0) {
        throw new Error("shape not found in the list")
    }
    new_shapes[index] = rect
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