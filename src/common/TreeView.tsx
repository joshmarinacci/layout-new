import {ChevronDown, ChevronRight, File, FileText, Folder, Image, Layers, Square} from 'lucide-react';
import {Children, type DragEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState} from 'react';
import type {ColorPalette, DrawDocument, FontAsset, PhotoAsset, PixelImageData, Shape} from '../model/types';
import type {AssetSelection} from '../commands';

/** How long a click on a renameable folder waits to see whether it's the start of a double-click. */
export const DOUBLE_CLICK_DELAY = 250;

function cls(props: Record<string, boolean>) {
    return Object.entries(props)
        .filter(([, active]) => active)
        .map(([name]) => name)
        .join(' ');
}

/** Inline name editor shown in place of a tree row's label while renaming. */
function RenameField({
    initial,
    onCommit,
    onCancel,
}: {
    initial: string;
    onCommit: (name: string) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState(initial);
    const done = useRef(false);
    const finish = (commit: boolean) => {
        if (done.current) return;
        done.current = true;
        const name = value.trim();
        if (commit && name && name !== initial) onCommit(name);
        else onCancel();
    };
    return (
        <input
            className="tree-rename"
            aria-label={`Rename ${initial}`}
            value={value}
            autoFocus
            onFocus={event => event.currentTarget.select()}
            onChange={event => setValue(event.target.value)}
            onBlur={() => finish(true)}
            onKeyDown={event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    finish(true);
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    finish(false);
                }
            }}
        />
    );
}

function TreeNode({
    label,
    editValue = label,
    icon: iconOverride,
    depth,
    defaultExpanded = true,
    selected,
    current,
    onSelect,
    onContextMenu,
    onRename,
    draggable,
    onDragStart,
    onDragOver,
    onDrop,
    dropPosition,
    children,
}: {
    label: string;
    editValue?: string;
    icon?: ReactNode;
    depth: number;
    defaultExpanded?: boolean;
    selected?: boolean;
    /** Marks the open page with a subtle style when something else is the selection. */
    current?: boolean;
    onSelect?: (event: MouseEvent<HTMLButtonElement>) => void;
    onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
    children?: ReactNode;
    onRename?: (name: string) => void;
    draggable?: boolean;
    onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void;
    onDragOver?: (event: React.DragEvent<HTMLButtonElement>) => void;
    onDrop?: (event: React.DragEvent<HTMLButtonElement>) => void;
    dropPosition?: 'before' | 'after' | null;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [renaming, setRenaming] = useState(false);
    const hasChildren = Children.count(children) > 0;
    // A double-click arrives as two clicks; toggling on each made renameable folders open and
    // close again (flicker). Their toggle waits briefly and a double-click cancels it.
    const pendingToggle = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelPendingToggle = () => {
        if (pendingToggle.current !== null) clearTimeout(pendingToggle.current);
        pendingToggle.current = null;
    };
    useEffect(() => cancelPendingToggle, []);
    const toggleFromClick = (event: MouseEvent<HTMLButtonElement>) => {
        // detail is 0 for keyboard activation and 2+ for the later clicks of a double-click.
        if (event.detail > 1) return;
        if (!onRename || event.detail === 0) {
            setExpanded(value => !value);
            return;
        }
        cancelPendingToggle();
        pendingToggle.current = setTimeout(() => {
            pendingToggle.current = null;
            setExpanded(value => !value);
        }, DOUBLE_CLICK_DELAY);
    };
    const icon =
        iconOverride ??
        (hasChildren ? (
            <Folder aria-hidden="true" />
        ) : depth === 0 ? (
            <File aria-hidden="true" />
        ) : depth < 3 ? (
            <Layers aria-hidden="true" />
        ) : (
            <Square aria-hidden="true" />
        ));
    return (
        <li className="tree-node" aria-expanded={hasChildren ? expanded : undefined}>
            <div
                className={cls({
                    'tree-row': true,
                    selected: !!selected,
                    current: !selected && !!current,
                    'drop-before': dropPosition === 'before',
                    'drop-after': dropPosition === 'after',
                })}
                style={{paddingLeft: `${depth * 0.9}rem`}}
            >
                {hasChildren ? (
                    <button
                        className="tree-disclosure"
                        tabIndex={-1}
                        aria-hidden="true"
                        onClick={() => setExpanded(value => !value)}
                    >
                        {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                    </button>
                ) : (
                    <span className="tree-disclosure-spacer" />
                )}
                {renaming && onRename ? (
                    <span className="tree-label tree-label-editing">
                        {icon}
                        <RenameField
                            initial={editValue}
                            onCancel={() => setRenaming(false)}
                            onCommit={name => {
                                setRenaming(false);
                                onRename(name);
                            }}
                        />
                    </span>
                ) : (
                    <button
                        className="tree-label"
                        aria-current={selected ? 'true' : current ? 'page' : undefined}
                        aria-expanded={hasChildren ? expanded : undefined}
                        title={onRename ? 'Double-click or press F2 to rename' : undefined}
                        onClick={event => {
                            if (hasChildren) toggleFromClick(event);
                            onSelect?.(event);
                        }}
                        onContextMenu={onContextMenu}
                        onDoubleClick={() => {
                            if (onRename) {
                                cancelPendingToggle();
                                setRenaming(true);
                            }
                        }}
                        onKeyDown={event => {
                            if (event.key === 'F2' && onRename) {
                                event.preventDefault();
                                setRenaming(true);
                            }
                        }}
                        draggable={draggable}
                        onDragStart={onDragStart}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                    >
                        {icon}
                        <span>{label}</span>
                    </button>
                )}
            </div>
            {hasChildren && expanded && <ul>{children}</ul>}
        </li>
    );
}

export default function TreeView(props: {
    document: DrawDocument;
    selectedIds: readonly string[];
    onSelect: (value: Shape, additive: boolean) => void;
    selectedAsset: AssetSelection;
    onSelectAsset: (image: PixelImageData) => void;
    onSelectPalette: (palette: ColorPalette) => void;
    onSelectFont: (font: FontAsset) => void;
    onSelectPhoto: (photo: PhotoAsset) => void;
    onShapeContextMenu: (event: MouseEvent<HTMLButtonElement>, shape: Shape) => void;
    selectedPageId: string;
    onSelectPage: (id: string) => void;
    onDocumentContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
    documentSelected: boolean;
    onSelectDocument: () => void;
    onRenameDocument: (name: string) => void;
    onRenamePage: (id: string, name: string) => void;
    onRenameShape: (id: string, name: string) => void;
    onRenamePalette: (id: string, name: string) => void;
    onRenameImage: (id: string, name: string) => void;
    onRenamePhoto: (id: string, name: string) => void;
    onPhotoContextMenu: (event: MouseEvent<HTMLButtonElement>, photo: PhotoAsset) => void;
    onUngroup: (id: string) => void;
    onRenameGroup: (id: string, name: string) => void;
    onSelectGroup: (ids: string[]) => void;
    onPageContextMenu: (event: MouseEvent<HTMLButtonElement>, pageId: string) => void;
    onPagesContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
    onAssetsContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
    onPaletteContextMenu: (event: MouseEvent<HTMLButtonElement>, palette: ColorPalette) => void;
    onReorderPage: (id: string, targetId: string, position: 'before' | 'after') => void;
    onReorderShape: (
        pageId: string,
        id: string,
        targetId: string,
        position: 'before' | 'after',
        sourceGroupId: string | null,
        targetGroupId: string | null,
    ) => void;
}) {
    const doc = props.document;
    const isSelected = (kind: NonNullable<AssetSelection>['kind'], id: string) =>
        props.selectedAsset?.kind === kind && props.selectedAsset.id === id;
    // The open page is "the selection" only when nothing more specific is selected.
    const pageIsSelection = !props.documentSelected && !props.selectedIds.length && !props.selectedAsset;
    const [dropTarget, setDropTarget] = useState<{
        type: 'page' | 'shape';
        id: string;
        pageId?: string;
        position: 'before' | 'after';
    } | null>(null);
    const drag = (
        event: DragEvent<HTMLButtonElement>,
        type: 'page' | 'shape',
        id: string,
        pageId?: string,
        groupId?: string | null,
    ) => {
        event.dataTransfer.setData(
            'application/x-layout-tree-item',
            JSON.stringify({
                type,
                id,
                pageId,
                groupId,
            }),
        );
        event.dataTransfer.effectAllowed = 'move';
        setDropTarget(null);
    };
    const dragOver = (event: DragEvent<HTMLButtonElement>, type: 'page' | 'shape', id: string, pageId?: string) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        setDropTarget({
            type,
            id,
            pageId,
            position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
        });
    };
    const drop = (
        event: DragEvent<HTMLButtonElement>,
        type: 'page' | 'shape',
        targetId: string,
        pageId?: string,
        groupId?: string | null,
    ) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        try {
            const source = JSON.parse(event.dataTransfer.getData('application/x-layout-tree-item')) as {
                type: string;
                id: string;
                pageId?: string;
                groupId?: string | null;
            };
            if (source.type === type && type === 'page') props.onReorderPage(source.id, targetId, position);
            else if (source.type === 'shape' && type === 'shape' && source.pageId === pageId)
                props.onReorderShape(pageId!, source.id, targetId, position, source.groupId ?? null, groupId ?? null);
        } catch {
            /* Ignore unrelated or malformed drops. */
        }
        setDropTarget(null);
    };
    return (
        <ul className="tree-view" aria-label="Document contents">
            <TreeNode
                label={`Doc: ${doc.title}`}
                editValue={doc.title}
                depth={0}
                selected={props.documentSelected}
                onSelect={props.onSelectDocument}
                onRename={props.onRenameDocument}
                onContextMenu={props.onDocumentContextMenu}
            />
            <TreeNode label="Pages" depth={1} onContextMenu={props.onPagesContextMenu}>
                {doc.pages.map(page => (
                    <TreeNode
                        key={page.id}
                        label={page.name}
                        depth={2}
                        icon={<FileText aria-hidden="true" />}
                        selected={page.id === props.selectedPageId && pageIsSelection}
                        current={page.id === props.selectedPageId}
                        onSelect={() => props.onSelectPage(page.id)}
                        onRename={name => props.onRenamePage(page.id, name)}
                        onContextMenu={event => props.onPageContextMenu(event, page.id)}
                        draggable
                        dropPosition={
                            dropTarget?.type === 'page' && dropTarget.id === page.id ? dropTarget.position : null
                        }
                        onDragStart={event => drag(event, 'page', page.id)}
                        onDragOver={event => dragOver(event, 'page', page.id)}
                        onDrop={event => drop(event, 'page', page.id)}
                    >
                        {page.groups.map(group => (
                            <TreeNode
                                key={group.id}
                                label={group.name}
                                depth={3}
                                selected={
                                    group.shapeIds.length > 0 &&
                                    group.shapeIds.every(id => props.selectedIds.includes(id))
                                }
                                onSelect={() => {
                                    props.onSelectPage(page.id);
                                    props.onSelectGroup(group.shapeIds);
                                }}
                                onRename={name => props.onRenameGroup(group.id, name)}
                            >
                                {group.shapeIds
                                    .map(id => doc.shapes.find(shape => shape.id === id))
                                    .filter((shape): shape is Shape => !!shape)
                                    .map(shape => (
                                        <TreeNode
                                            key={shape.id}
                                            label={shape.name}
                                            depth={4}
                                            selected={props.selectedIds.includes(shape.id)}
                                            onSelect={event => props.onSelect(shape, event.shiftKey)}
                                            onRename={name => props.onRenameShape(shape.id, name)}
                                            onContextMenu={event => props.onShapeContextMenu(event, shape)}
                                            draggable
                                            onDragStart={event => drag(event, 'shape', shape.id, page.id, group.id)}
                                            dropPosition={
                                                dropTarget?.type === 'shape' && dropTarget.id === shape.id
                                                    ? dropTarget.position
                                                    : null
                                            }
                                            onDragOver={event => dragOver(event, 'shape', shape.id, page.id)}
                                            onDrop={event => drop(event, 'shape', shape.id, page.id, group.id)}
                                        />
                                    ))}
                            </TreeNode>
                        ))}
                        {doc.shapes
                            .filter(
                                shape =>
                                    shape.pageId === page.id &&
                                    !page.groups.some(group => group.shapeIds.includes(shape.id)),
                            )
                            .map(shape => (
                                <TreeNode
                                    key={shape.id}
                                    label={shape.name}
                                    depth={3}
                                    selected={props.selectedIds.includes(shape.id)}
                                    onSelect={event => props.onSelect(shape, event.shiftKey)}
                                    onRename={name => props.onRenameShape(shape.id, name)}
                                    onContextMenu={event => props.onShapeContextMenu(event, shape)}
                                    draggable
                                    onDragStart={event => drag(event, 'shape', shape.id, page.id, null)}
                                    dropPosition={
                                        dropTarget?.type === 'shape' && dropTarget.id === shape.id
                                            ? dropTarget.position
                                            : null
                                    }
                                    onDragOver={event => dragOver(event, 'shape', shape.id, page.id)}
                                    onDrop={event => drop(event, 'shape', shape.id, page.id, null)}
                                />
                            ))}
                    </TreeNode>
                ))}
            </TreeNode>
            <TreeNode label="Assets" depth={1} onContextMenu={props.onAssetsContextMenu}>
                {doc.fonts.map(font => (
                    <TreeNode
                        key={font.id}
                        label={`${font.family} (Google Font)`}
                        depth={2}
                        selected={isSelected('font', font.id)}
                        onSelect={() => props.onSelectFont(font)}
                    />
                ))}
                {doc.palettes.map(palette => (
                    <TreeNode
                        key={palette.id}
                        label={`${palette.name} (${palette.colors.length} colors)`}
                        editValue={palette.name}
                        depth={2}
                        selected={isSelected('palette', palette.id)}
                        onSelect={() => props.onSelectPalette(palette)}
                        onRename={name => props.onRenamePalette(palette.id, name)}
                        onContextMenu={event => props.onPaletteContextMenu(event, palette)}
                    />
                ))}
                {doc.images.map(image => (
                    <TreeNode
                        key={image.id}
                        label={`${image.name} (${image.width} × ${image.height})`}
                        editValue={image.name}
                        depth={2}
                        selected={isSelected('image', image.id)}
                        onSelect={() => props.onSelectAsset(image)}
                        onRename={name => props.onRenameImage(image.id, name)}
                    />
                ))}
                {doc.photos.map(photo => {
                    const uses = doc.shapes.filter(
                        shape => shape.type === 'photo' && shape.components.photo.photoId === photo.id,
                    ).length;
                    return (
                        <TreeNode
                            key={photo.id}
                            label={`${photo.name} (${photo.width} × ${photo.height}, ${uses === 0 ? 'unused' : uses === 1 ? '1 use' : `${uses} uses`})`}
                            editValue={photo.name}
                            depth={2}
                            icon={<Image aria-hidden="true" />}
                            selected={isSelected('photo', photo.id)}
                            onSelect={() => props.onSelectPhoto(photo)}
                            onRename={name => props.onRenamePhoto(photo.id, name)}
                            onContextMenu={event => props.onPhotoContextMenu(event, photo)}
                        />
                    );
                })}
            </TreeNode>
        </ul>
    );
}
