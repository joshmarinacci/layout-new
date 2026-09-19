// @ts-ignore
import React, {useState} from "react";
import type {CircleShape, DrawDocument, RectangleShape, Shape} from "./types";
import TreeView from "./TreeView";
import "./app.css"

function make_example_doc():DrawDocument {
    const rect: RectangleShape = {
        id: "rect_1",
        type: 'rectangle',
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
    const circle: CircleShape = {
        id:'circle_1',
        type:'circle',
        name:'circle',
        components: {
            fill: {
                fill: {
                    kind: 'solid',
                    color:'blue',
                }
            },
            circle: {
                radius: 30,
                center: {
                    x: 200,
                    y:200,
                }
            },
            stroke: {
                color: 'black',
                width: 1
            }
        }
    }
    return {
        version: 0,
        title:'test doc',
        shapes: [rect, circle],
    }
}

const DOC = make_example_doc()

function App() {
    const [selected, setSelected] = useState<Shape|null>()
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
            <input type={'text'} value={DOC.version}/>
            <button>New Rect</button>
            <button disabled={true}>Undo</button>
            <button disabled={true}>Redo</button>
        </div>
        <div className={'left scroll-container'}>
            <TreeView document={DOC} selected={selected} onSelect={setSelected}/>
        </div>
        <div className={'center scroll-container'}>
            <div>the editing canvas</div>
        </div>
        <div className={'right scroll-container'}>
            <div>a propsheet here</div>
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