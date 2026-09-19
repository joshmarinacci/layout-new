// @ts-ignore
import React, {useState} from "react";
import type {
    Bounds,
    CircleShape,
    DrawDocument,
    RectangleShape,
    Shape
} from "./types";
import TreeView from "./TreeView";
import "./app.css"
import PropSheet from "./PropSheet";
import VisualEditor from "./VisualEditor";
import {appendShape, makeRect} from "./reducer";

function make_example_doc():DrawDocument {
    const rect: RectangleShape = {
        id: "rect_1",
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
                    color: "red"
                }
            },
            stroke: {
                kind: "stroke-component",
                width: 4,
                color: "black"
            },
            cornerRadius: {
                kind: 'rounded-corner-component',
                radius: 10
            }
        }
    }
    const circle: CircleShape = {
        id:'circle_1',
        type:'circle',
        name:'circle',
        components: {
            fill: {
                kind: 'fill-component',
                fill: {
                    kind: 'solid',
                    color:'blue',
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
                color: 'black',
                width: 4
            }
        }
    }
    return {
        version: 0,
        title:'test doc',
        shapes: [rect, circle],
    }
}

const DOCx = make_example_doc()

function updateDocTitle(doc: DrawDocument, title: string):DrawDocument {
    return {
        ...doc,
        title
    }
}

function App() {
    const [selected, setSelected] = useState<Shape|null>()
    const [doc, setDoc] = useState<DrawDocument>(DOCx)
    return <div className={'main-layout'}>
        <nav className={'menubar full-span'}>
            <ul>
                <button>File</button>
                <li>
                    <button>Load file</button>
                </li>
                <li>
                    <button>New Document</button>
                </li>
            </ul>
            <ul>
                <button>Edit</button>
                <li>
                    <button>Undo</button>
                </li>
                <li>
                    <button>Redo</button>
                </li>
            </ul>
        </nav>
        <div className={'toolbar full-span'}>
            <input type={'text'} value={doc.title} onChange={(e) => {
                setDoc(updateDocTitle(doc, e.target.value))
            }}/>
            <button onClick={() => {
                const bounds:Bounds = {
                    x: 50,
                    y: 250,
                    width: 50,
                    height: 50
                }
                setDoc(appendShape(doc,makeRect("rect2",bounds)))
            }}>New Rect</button>
            <button disabled={true}>Undo</button>
            <button disabled={true}>Redo</button>
        </div>
        <div className={'left scroll-container'}>
            <TreeView document={doc} selected={selected} onSelect={setSelected}/>
        </div>
        <div className={'center scroll-container'}>
            <VisualEditor document={doc} selected={selected} setSelected={setSelected}/>
        </div>
        <div className={'right scroll-container'}>
            <PropSheet selected={selected}/>
        </div>
        <div className={'statusbar full-span'}>
            <button>toggle left</button>
            <span className={'spacer'}></span>
            <label>status</label>
            <span className={'spacer'}></span>
            <button>toggle right</button>
        </div>
    </div>
}

export default App