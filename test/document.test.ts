import {describe, expect, it} from 'vitest'
import type {DrawDocument, RectangleShape} from "../src/model/types";
import {
    appendShape,
    makeRect,
    updateDocShape,
    updateFillComp,
    updateRectName,
    updateShapeComp,
    updateStrokeComp
} from "../src/model/reducer";

function makeRectDocument():DrawDocument {
    const rect = makeRect('rect1',{x:200,y:50,width:100, height:100});
    return {
        version: 6, images: [], palettes: [], pages: [{id: 'page-1', name: 'Page 1', groups: []}],
        title:'document',
        shapes:[rect],
    }
}

function makeEmptyDoc():DrawDocument {
    return {
        title:"some doc",
        shapes: [],
        version: 6, images: [], palettes: [], pages: [{id: 'page-1', name: 'Page 1', groups: []}],
    }
}

describe("make document",() => {
    it("can update a rectangle", () => {
        const doc = makeRectDocument()
        expect(doc.version).toBe(6)
        expect(doc.shapes.length).toBe(1)
        expect(doc.shapes[0].type).toBe('rectangle')
        let rect = doc.shapes[0] as RectangleShape
        expect(rect.name).toBe('rect1')
        // set the name
        rect = updateRectName(rect, 'rect2')
        expect(rect.name).toBe('rect2')

        let doc2 = updateDocShape(doc, updateRectName(rect, 'rect3'))
        expect(doc2.shapes[0].type).toBe('rectangle')
        let rect3 = doc2.shapes[0] as RectangleShape
        expect(rect3.name).toBe('rect3')
    })
    it("can add a rectangle", () => {
        const doc = makeEmptyDoc()
        expect(doc.shapes.length).toBe(0)
        let doc2 = appendShape(doc, makeRect("rect1",{x:0, y:0, width:50, height:50}))
        expect(doc.shapes.length).toBe(0)
        expect(doc2.shapes.length).toBe(1)
    })
    it("can edit a rectangle fill", () => {
        const doc = makeRectDocument()
        let rect1 = doc.shapes[0] as RectangleShape
        expect(rect1.components.fill.fill.color).toBe('red')
        let rect2 = updateShapeComp(rect1,'fill',updateFillComp(rect1.components.fill,'blue'))
        let doc2 = updateDocShape(doc, rect2)
        let rect3 = doc2.shapes[0] as RectangleShape
        expect(rect3.components.fill.fill.color).toBe('blue')
    })
    it("can change a rect stroke color",() => {
        const doc = makeRectDocument()
        let rect1 = doc.shapes[0] as RectangleShape
        expect(rect1.components.stroke.color).toBe("black")
        let stroke2 = updateStrokeComp(rect1.components.stroke,'white')
        expect(stroke2.color).toBe("white")
        let rect2 = updateShapeComp(rect1,'stroke',stroke2) as RectangleShape
        expect(rect2.components.stroke.color).toBe('white')
    })
})
