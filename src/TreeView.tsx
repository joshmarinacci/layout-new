import {Children, useState, type MouseEvent, type ReactNode} from 'react';
import type {DrawDocument, PixelImageData, Shape} from './types';

function cls(props: Record<string, boolean>) {
    return Object.entries(props).filter(([, active]) => active).map(([name]) => name).join(' ');
}

function TreeNode({label, depth, defaultExpanded = true, selected, onSelect, children}: {
    label: string; depth: number; defaultExpanded?: boolean; selected?: boolean;
    onSelect?: (event: MouseEvent<HTMLButtonElement>) => void; children?: ReactNode;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const hasChildren = Children.count(children) > 0;
    return <li className="tree-node" aria-expanded={hasChildren ? expanded : undefined}>
        <div className={cls({'tree-row': true, selected: !!selected})} style={{paddingLeft: `${depth * 0.9}rem`}}>
            {hasChildren ? <button className="tree-disclosure" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
                aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '▾' : '▸'}</button> : <span className="tree-disclosure-spacer"/>}
            <button className="tree-label" aria-current={selected ? 'true' : undefined} onClick={onSelect}>{label}</button>
        </div>
        {hasChildren && expanded && <ul>{children}</ul>}
    </li>;
}

export default function TreeView(props: {
    document: DrawDocument,
    selectedIds: readonly string[],
    onSelect: (value: Shape, additive: boolean) => void,
    selectedAssetId: string | null,
    onSelectAsset: (image: PixelImageData) => void,
}) {
    const doc = props.document;
    return <ul className="tree-view" aria-label="Document contents">
        <TreeNode label={`Doc: ${doc.title}`} depth={0}>
            <TreeNode label="Shapes" depth={1}>
                {doc.shapes.map(shape => <TreeNode key={shape.id} label={shape.name} depth={2}
                    selected={props.selectedIds.includes(shape.id)}
                    onSelect={event => props.onSelect(shape, event.shiftKey)}/>)}
            </TreeNode>
            <TreeNode label="Assets" depth={1}>
                {doc.images.map(image => <TreeNode key={image.id} label={`${image.name} (${image.width} × ${image.height})`} depth={2}
                    selected={image.id === props.selectedAssetId} onSelect={() => props.onSelectAsset(image)}/>)}
            </TreeNode>
        </TreeNode>
    </ul>;
}
