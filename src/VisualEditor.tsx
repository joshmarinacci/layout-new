import type {CircleShape, DrawDocument, RectangleShape, Shape} from "./types";
import {useEffect, useRef} from "react";

type ShapeRenderer<T extends Shape> = (ctx:CanvasRenderingContext2D,shape:T) => void

const rectRenderer:ShapeRenderer<RectangleShape> = (ctx, shape) => {
    ctx.fillStyle = shape.components.fill.fill.color
    const bounds = shape.components.rect.bounds
    ctx.beginPath()
    ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height)
    ctx.closePath()
    ctx.fill()
    ctx.lineWidth = shape.components.stroke.width
    ctx.strokeStyle = shape.components.stroke.color
    ctx.stroke()
}
const circleRenderer:ShapeRenderer<CircleShape> = (ctx, shape) => {
    ctx.fillStyle = shape.components.fill.fill.color
    ctx.beginPath()
    const center = shape.components.circle.center
    ctx.arc(center.x, center.y, shape.components.circle.radius, 0, Math.PI*2)
    ctx.closePath()
    ctx.fill()
    ctx.lineWidth = shape.components.stroke.width
    ctx.strokeStyle = shape.components.stroke.color
    ctx.stroke()
}

function drawScene(current: HTMLCanvasElement, document: DrawDocument, selected: Shape) {
    let ctx = current.getContext('2d') as CanvasRenderingContext2D
    ctx.fillStyle = '#333'
    ctx.fillRect(0,0,current.width, current.height)
    document.shapes.forEach(shape => {
        if(shape.type === 'rectangle') rectRenderer(ctx, shape as RectangleShape)
        if(shape.type === 'circle') circleRenderer(ctx, shape as CircleShape)
    })
}

export default function VisualEditor(props: {
    document: DrawDocument,
    selected: Shape,
    setSelected: (value: (((prevState: Shape) => Shape) | Shape)) => void
}) {
    const ref = useRef<HTMLCanvasElement>(null)
    useEffect(() => {
        if(ref.current) {
            drawScene(ref.current, props.document, props.selected)
        }
    },[props.document, props.selected])
    return <canvas ref={ref} width={1024} height={1024}></canvas>
}