import type {DrawDocument, RectangleShape, CircleShape} from "./types";
export function makeExampleDocument():DrawDocument {
    const rect: RectangleShape = {
        id: "rect_1",
        pageId: 'page_1',
        type: 'rectangle',
        name: 'rect',
        components: {
            rect: {
                kind: "resizable-bounds-component",
                bounds: {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                }
            },
            fill: {
                kind: 'fill-component',
                fill: {
                    kind: "solid",
                    color: "#ff0000"
                }
            },
            stroke: {
                kind: "stroke-component",
                width: 4,
                color: "#000000"
            },
            cornerRadius: {
                kind: 'rounded-corner-component',
                radius: 10
            }
        }
    }
    const circle: CircleShape = {
        id:'circle_1',
        pageId: 'page_1',
        type:'circle',
        name:'circle',
        components: {
            fill: {
                kind: 'fill-component',
                fill: {
                    kind: 'solid',
                    color:'#0000ff',
                }
            },
            circle: {
                kind: 'circle-like-component',
                radius: 30,
                center: {
                    x: 200,
                    y:200,
                }
            },
            stroke: {
                kind: 'stroke-component',
                color: '#000000',
                width: 4
            }
        }
    }
    return {
        version: 5, images: [], pages: [{id: 'page_1', name: 'Page 1', groups: []}],
        title:'test doc',
        shapes: [rect, circle],
    }
}
