import type {DrawDocument, PixelImageData, Shape} from "./types";

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
    selectedIds: readonly string[],
    onSelect: (value: Shape, additive: boolean) => void
}) {
    const {item, selectedIds, onSelect} = props
    return <div key={item.id}
               className={cls({
                   'tree-item':true,
                   selected: selectedIds.includes(item.id)
               })}
               onClick={event=>{
                   onSelect(item, event.shiftKey)
               }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onSelect(item, event.shiftKey);
               }}>{item.name}</div>
}

export default function TreeView(props: {
    document: DrawDocument,
    selectedIds: readonly string[],
    onSelect: (value: Shape, additive: boolean) => void,
    selectedAssetId: string | null,
    onSelectAsset: (image: PixelImageData) => void,
}) {
    const doc = props.document
    return <ul className={'tree-view'}>
        <li>
            <div className={'tree-item'}>
                Doc: {doc.title}
            </div>
            <ul>
                {doc.shapes.map((shape,n)=>
                    <TreeItem key={shape.id} item={shape}
                              selectedIds={props.selectedIds}
                              onSelect={props.onSelect}/>)}
            </ul>
        </li>
        <li>
            <label>Assets</label>
            <ul>
                {doc.images.map(image => <li key={image.id}>
                    <button className={cls({'asset-item': true, selected: image.id === props.selectedAssetId})}
                        aria-current={image.id === props.selectedAssetId ? 'true' : undefined}
                        onClick={() => props.onSelectAsset(image)}>{image.name} ({image.width} × {image.height})</button>
                </li>)}
            </ul>
        </li>
    </ul>
}
