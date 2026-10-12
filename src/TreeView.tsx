import {Children, useState, type MouseEvent, type ReactNode} from 'react';
import type {DrawDocument, PixelImageData, Shape} from './types';

function cls(props: Record<string, boolean>) {
    return Object.entries(props).filter(([, active]) => active).map(([name]) => name).join(' ');
}

function TreeNode({label, depth, defaultExpanded = true, selected, onSelect, onContextMenu, onRename, children}: {
    label: string; depth: number; defaultExpanded?: boolean; selected?: boolean;
    onSelect?: (event: MouseEvent<HTMLButtonElement>) => void;
    onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void; children?: ReactNode;
    onRename?: (name: string) => void;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const hasChildren = Children.count(children) > 0;
    return <li className="tree-node" aria-expanded={hasChildren ? expanded : undefined}>
        <div className={cls({'tree-row': true, selected: !!selected})} style={{paddingLeft: `${depth * 0.9}rem`}}>
            {hasChildren ? <button className="tree-disclosure" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
                aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '▾' : '▸'}</button> : <span className="tree-disclosure-spacer"/>}
            <button className="tree-label" aria-current={selected ? 'true' : undefined} onClick={onSelect} onContextMenu={onContextMenu}
                onDoubleClick={() => { if (!onRename) return; const name = window.prompt('Group name', label); if (name?.trim()) onRename(name.trim()); }}>{label}</button>
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
    onShapeContextMenu: (event: MouseEvent<HTMLButtonElement>, shape: Shape) => void,
    selectedPageId: string,
    onSelectPage: (id: string) => void,
    onUngroup: (id: string) => void,
    onRenameGroup: (id: string, name: string) => void,
    onSelectGroup: (ids: string[]) => void,
    onPageContextMenu: (event: MouseEvent<HTMLButtonElement>, pageId: string) => void,
    onPagesContextMenu: (event: MouseEvent<HTMLButtonElement>) => void,
}) {
    const doc = props.document;
    return <ul className="tree-view" aria-label="Document contents">
        <TreeNode label={`Doc: ${doc.title}`} depth={0}>
            <TreeNode label="Pages" depth={1} onContextMenu={props.onPagesContextMenu}>
                {doc.pages.map(page => <TreeNode key={page.id} label={page.name} depth={2} selected={page.id === props.selectedPageId}
                    onSelect={() => props.onSelectPage(page.id)} onContextMenu={event => props.onPageContextMenu(event, page.id)}>
                    {page.groups.map(group => <TreeNode key={group.id} label={group.name} depth={3} selected={group.shapeIds.length > 0 && group.shapeIds.every(id => props.selectedIds.includes(id))}
                        onSelect={() => { props.onSelectPage(page.id); props.onSelectGroup(group.shapeIds); }} onRename={name => props.onRenameGroup(group.id, name)}>
                        {group.shapeIds.map(id => doc.shapes.find(shape => shape.id === id)).filter((shape): shape is Shape => !!shape).map(shape => <TreeNode key={shape.id} label={shape.name} depth={4}
                            selected={props.selectedIds.includes(shape.id)} onSelect={event => props.onSelect(shape, event.shiftKey)}
                            onContextMenu={event => props.onShapeContextMenu(event, shape)}/>)}</TreeNode>)}
                    {doc.shapes.filter(shape => shape.pageId === page.id && !page.groups.some(group => group.shapeIds.includes(shape.id))).map(shape => <TreeNode key={shape.id} label={shape.name} depth={3}
                    selected={props.selectedIds.includes(shape.id)}
                    onSelect={event => props.onSelect(shape, event.shiftKey)}
                    onContextMenu={event => props.onShapeContextMenu(event, shape)}/>)}
                </TreeNode>)}
            </TreeNode>
            <TreeNode label="Assets" depth={1}>
                {doc.images.map(image => <TreeNode key={image.id} label={`${image.name} (${image.width} × ${image.height})`} depth={2}
                    selected={image.id === props.selectedAssetId} onSelect={() => props.onSelectAsset(image)}/>)}
            </TreeNode>
        </TreeNode>
    </ul>;
}
