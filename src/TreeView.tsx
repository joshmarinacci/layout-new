import type {DrawDocument, Shape} from "./types";

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
    selected: Shape | undefined,
    onSelect: (value: Shape) => void
}) {
    const {item, selected, onSelect} = props
    return <div key={item.id}
               className={cls({
                   'tree-item':true,
                   selected: item.id === selected?.id
               })}
               onClick={()=>{
                   onSelect(item)
               }}>{item.name}</div>
}

export default function TreeView(props: {
    document: DrawDocument,
    selected: Shape | undefined,
    onSelect: (value: Shape) => void
}) {
    const doc = props.document
    return <ul className={'tree-view'}>
        <li>
            <div className={'tree-item'}>
                Doc: {doc.title}
            </div>
            <ul>
                {doc.shapes.map((shape,n)=>
                    <TreeItem key={shape.id}
                              item={shape}
                              selected={props.selected}
                              onSelect={props.onSelect}/>)}
            </ul>
        </li>
        <li>
            <label>Assets</label>
            <ul>
                {doc.images.map(image => <li key={image.id}>{image.name} ({image.width} × {image.height})</li>)}
            </ul>
        </li>
    </ul>
}