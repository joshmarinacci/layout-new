import type {
    Bounds, CircleLikeComponent, FillComponent,
    ResizableBoundsComponent, RoundedCornerComponent,
    Shape,
    ShapeComponent, StrokeComponent
} from "./types";

function NumberInput(props: {
    title: string,
    target: object,
    field: string,
    unit: string
}) {
    return <div className={'number-input'}>
        <label className={'title'}>{props.title}</label>
        <input type={'number'} value={props.target[props.field]}/>
        <label className={'unit'}>{props.unit}</label>
    </div>
}

function resizableBoundsComponent(comp: ResizableBoundsComponent) {
    return <li className={'prop-sheet-panel'}>
        <NumberInput title={'x'} target={comp.bounds} field={'x'} unit={'px'}/>
        <NumberInput title={'y'} target={comp.bounds} field={'y'} unit={'px'}/>
        <NumberInput title={'width'} target={comp.bounds} field={'width'} unit={'px'}/>
        <NumberInput title={'height'} target={comp.bounds} field={'height'} unit={'px'}/>
    </li>
}

function fillComponent(comp: FillComponent) {
    return <div className={'prop-sheet-panel'}>
        <input type={'color'} value={comp.fill.color}/>
    </div>
}

function roundedCornerComponent(comp: RoundedCornerComponent) {
    return <div className={'prop-sheet-panel'}>
        <NumberInput title={'radius'} target={comp} field={'radius'} unit={'px'}/>
    </div>
}

function strokeComponent(comp: StrokeComponent) {
    return <div className={'prop-sheet-panel'}>
        <input type={'color'} value={comp.color}/>
        <NumberInput title={'width'} target={comp} field={'width'} unit={'px'}/>
    </div>
}

function circleLikeComponent(comp: CircleLikeComponent) {
    return <div className={'prop-sheet-panel'}>
        <NumberInput title={'radius'} target={comp} field={'radius'} unit={'px'}/>
    </div>
}

function componentProps(component: ShapeComponent) {
    switch (component.kind) {
        case 'resizable-bounds-component': return resizableBoundsComponent(component as ResizableBoundsComponent);
        case 'fill-component': return fillComponent(component as FillComponent)
        case 'rounded-corner-component': return roundedCornerComponent(component as RoundedCornerComponent)
        case 'stroke-component': return strokeComponent(component as StrokeComponent)
        case 'circle-like-component': return circleLikeComponent(component as CircleLikeComponent)
        default: {
            return <li>unknown component</li>
        }
    }
}

export default function PropSheet(props: { selected?: Shape }) {
    if(!props.selected) {
        return <div className={'prop-sheet'}>nothing selected</div>
    } else {
        const shape = props.selected
        const comps = Object.keys(shape.components).map(key => {
            return <details>
                <summary>{key}</summary>
                {componentProps(shape.components[key])}
            </details>
        })
        return <ul className={'prop-sheet'}>
            <li>
                <details>
                    <summary>info</summary>
                    <ul>
                        <li><b>id</b><i>{shape.id}</i></li>
                        <li><b>name</b><i>{shape.name}</i></li>
                        <li><b>type</b><i>{shape.type}</i></li>
                    </ul>
                </details>
            </li>
            {comps}
        </ul>
    }
}