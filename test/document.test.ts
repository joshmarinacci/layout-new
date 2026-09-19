import {describe, expect, it} from 'vitest'
import type {DrawDocument, RectangleShape} from "../src/types";

function gen_id(rect1: string) {
    return rect1+"_"+Math.floor(Math.random()*1_000_000)
}

function makeRectDocument():DrawDocument {
    const rect:RectangleShape = {
        id: gen_id("rect"),
        type:'rectangle',
        name: 'rect',
        components: {
            rect: {
                bounds: {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                }
            },
            fill: {
                fill: {
                    kind: "solid",
                    color: "red"
                }
            },
            stroke: {
                width: 1,
                color: "black"
            },
            cornerRadius: {
                radius: 10
            }
        }
    }
    return {
        version: 0,
        title:'document',
        shapes:[rect],
    }
}

describe("make document",() => {
    const doc = makeRectDocument()
    expect(doc.version).toBe(0)
    expect(doc.shapes.length).toBe(1)
})