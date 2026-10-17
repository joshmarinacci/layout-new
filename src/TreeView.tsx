import {ChevronDown, ChevronRight, File, Folder, Layers, Square} from 'lucide-react';
import {Children, useState, type DragEvent, type MouseEvent, type ReactNode} from 'react';
import type {DrawDocument, PixelImageData, Shape} from './types';

function cls(props: Record<string, boolean>) {
    return Object.entries(props).filter(([, active]) => active).map(([name]) => name).join(' ');
}

function TreeNode({label, depth, defaultExpanded = true, selected, onSelect, onContextMenu, onRename, draggable, onDragStart, onDragOver, onDrop, dropPosition, children}: {
    label: string; depth: number; defaultExpanded?: boolean; selected?: boolean;
    onSelect?: (event: MouseEvent<HTMLButtonElement>) => void;
    onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void; children?: ReactNode;
    onRename?: (name: string) => void;
    draggable?: boolean;
    onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void;
    onDragOver?: (event: React.DragEvent<HTMLButtonElement>) => void;
    onDrop?: (event: React.DragEvent<HTMLButtonElement>) => void;
    dropPosition?: 'before' | 'after' | null;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const hasChildren = Children.count(children) > 0;
    return <li className="tree-node" aria-expanded={hasChildren ? expanded : undefined}>
        <div className={cls({'tree-row': true, selected: !!selected, 'drop-before': dropPosition === 'before', 'drop-after': dropPosition === 'after'})} style={{paddingLeft: `${depth * 0.9}rem`}}>
            {hasChildren ? <button className="tree-disclosure" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
                aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}</button> : <span className="tree-disclosure-spacer"/>}
            <button className="tree-label" aria-current={selected ? 'true' : undefined} onClick={onSelect} onContextMenu={onContextMenu}
                onDoubleClick={() => { if (!onRename) return; const name = window.prompt('Group name', label); if (name?.trim()) onRename(name.trim()); }}
                draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}>{hasChildren ? <Folder aria-hidden="true"/> : depth === 0 ? <File aria-hidden="true"/> : depth < 3 ? <Layers aria-hidden="true"/> : <Square aria-hidden="true"/>}<span>{label}</span></button>
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
    onReorderPage: (id: string, targetId: string, position: 'before' | 'after') => void,
    onReorderShape: (pageId: string, id: string, targetId: string, position: 'before' | 'after') => void,
}) {
    const doc = props.document;
    const [dropTarget, setDropTarget] = useState<{type: 'page' | 'shape'; id: string; pageId?: string; position: 'before' | 'after'} | null>(null);
    const drag = (event: DragEvent<HTMLButtonElement>, type: 'page' | 'shape', id: string, pageId?: string) => {
        event.dataTransfer.setData('application/x-layout-tree-item', JSON.stringify({type, id, pageId}));
        event.dataTransfer.effectAllowed = 'move';
        setDropTarget(null);
    };
    const dragOver = (event: DragEvent<HTMLButtonElement>, type: 'page' | 'shape', id: string, pageId?: string) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        setDropTarget({type, id, pageId, position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'});
    };
    const drop = (event: DragEvent<HTMLButtonElement>, type: 'page' | 'shape', targetId: string, pageId?: string) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        try {
            const source = JSON.parse(event.dataTransfer.getData('application/x-layout-tree-item')) as {type: string; id: string; pageId?: string};
            if (source.type === type && type === 'page') props.onReorderPage(source.id, targetId, position);
            else if (source.type === 'shape' && type === 'shape' && source.pageId === pageId) props.onReorderShape(pageId!, source.id, targetId, position);
        } catch { /* Ignore unrelated or malformed drops. */ }
        setDropTarget(null);
    };
    return <ul className="tree-view" aria-label="Document contents">
        <TreeNode label={`Doc: ${doc.title}`} depth={0}>
            <TreeNode label="Pages" depth={1} onContextMenu={props.onPagesContextMenu}>
                {doc.pages.map(page => <TreeNode key={page.id} label={page.name} depth={2} selected={page.id === props.selectedPageId}
                    onSelect={() => props.onSelectPage(page.id)} onContextMenu={event => props.onPageContextMenu(event, page.id)} draggable
                    dropPosition={dropTarget?.type === 'page' && dropTarget.id === page.id ? dropTarget.position : null}
                    onDragStart={event => drag(event, 'page', page.id)} onDragOver={event => dragOver(event, 'page', page.id)} onDrop={event => drop(event, 'page', page.id)}>
                    {page.groups.map(group => <TreeNode key={group.id} label={group.name} depth={3} selected={group.shapeIds.length > 0 && group.shapeIds.every(id => props.selectedIds.includes(id))}
                        onSelect={() => { props.onSelectPage(page.id); props.onSelectGroup(group.shapeIds); }} onRename={name => props.onRenameGroup(group.id, name)}>
                        {group.shapeIds.map(id => doc.shapes.find(shape => shape.id === id)).filter((shape): shape is Shape => !!shape).map(shape => <TreeNode key={shape.id} label={shape.name} depth={4}
                            selected={props.selectedIds.includes(shape.id)} onSelect={event => props.onSelect(shape, event.shiftKey)}
                            onContextMenu={event => props.onShapeContextMenu(event, shape)} draggable onDragStart={event => drag(event, 'shape', shape.id, page.id)}
                            dropPosition={dropTarget?.type === 'shape' && dropTarget.id === shape.id ? dropTarget.position : null}
                            onDragOver={event => dragOver(event, 'shape', shape.id, page.id)} onDrop={event => drop(event, 'shape', shape.id, page.id)}/>)}</TreeNode>)}
                    {doc.shapes.filter(shape => shape.pageId === page.id && !page.groups.some(group => group.shapeIds.includes(shape.id))).map(shape => <TreeNode key={shape.id} label={shape.name} depth={3}
                    selected={props.selectedIds.includes(shape.id)}
                    onSelect={event => props.onSelect(shape, event.shiftKey)}
                    onContextMenu={event => props.onShapeContextMenu(event, shape)} draggable onDragStart={event => drag(event, 'shape', shape.id, page.id)}
                    dropPosition={dropTarget?.type === 'shape' && dropTarget.id === shape.id ? dropTarget.position : null}
                    onDragOver={event => dragOver(event, 'shape', shape.id, page.id)} onDrop={event => drop(event, 'shape', shape.id, page.id)}/>)}
                </TreeNode>)}
            </TreeNode>
            <TreeNode label="Assets" depth={1}>
                {doc.images.map(image => <TreeNode key={image.id} label={`${image.name} (${image.width} × ${image.height})`} depth={2}
                    selected={image.id === props.selectedAssetId} onSelect={() => props.onSelectAsset(image)}/>)}
            </TreeNode>
        </TreeNode>
    </ul>;
}
