// @ts-ignore
import React from "react";
import type {DrawDocument, RectangleShape, Shape} from "./types";

function cls(props:Record<string,boolean>) {
    let classname = ""
    for(let prop in props) {
        if(props[prop] === true) {
            classname += ` ${prop}`
        }
    }
    return classname
}

function TreeItem(props: {
    item: Shape,
    selected?: Shape,
    onSelect: (value: (((prevState: Shape) => Shape) | Shape)) => void
}) {
    const {item, selected, onSelect} = props
    return <li key={item.id}
               className={cls({
                   'tree-item':true,
                   selected: item === selected
               })}
               onClick={()=>{
                   onSelect(item)
               }}>{item.name}</li>
}

export default function TreeView(props: {
    document: DrawDocument,
    selected?: Shape,
    onSelect: (value: (((prevState: Shape) => Shape) | Shape)) => void
}) {
    const doc = props.document
    return <ul className={'tree-view'}>
        <li>
            <label>Doc {doc.title}</label>
            <ul>
                {doc.shapes.map((shape,n)=>{
                    return <TreeItem key={shape.id}
                                     item={shape}
                                     selected={props.selected}
                                     onSelect={props.onSelect}/>
                })}
            </ul>
        </li>
        <li>
            <label>Assets</label>
            <ul>
                <li>asset 1</li>
                <li>asset 2</li>
            </ul>
        </li>
    </ul>
}