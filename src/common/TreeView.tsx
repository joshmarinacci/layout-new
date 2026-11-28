import {ChevronDown, ChevronRight, File, FileText, Folder, GripVertical, Image, Layers, Square} from 'lucide-react';
import {type MouseEvent, type ReactNode, useRef, useState} from 'react';
import {
    Button,
    type DragAndDropHooks,
    DropIndicator,
    type Key,
    type Selection,
    Tree,
    TreeItem,
    TreeItemContent,
    useDragAndDrop,
} from 'react-aria-components';
import type {ColorPalette, DrawDocument, FontAsset, PhotoAsset, PixelImageData, Shape} from '../model/types';
import type {AssetSelection} from '../commands';

/** What a tree row stands for. Its key is `${kind}:${id}`. */
type Kind = 'doc' | 'folder' | 'page' | 'group' | 'shape' | 'font' | 'palette' | 'image' | 'photo';

const itemKey = (kind: Kind, id = '') => `${kind}:${id}`;

function parseKey(key: Key): {kind: Kind; id: string} {
    const text = String(key);
    const split = text.indexOf(':');
    return {kind: text.slice(0, split) as Kind, id: text.slice(split + 1)};
}

const PAGES = itemKey('folder', 'pages');
const ASSETS = itemKey('folder', 'assets');
const DRAG_TYPE = 'application/x-layout-tree-item';

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
            // Keep typing, arrows, Space and clicks in the field rather than the tree around it
            // (which would move focus, select rows or jump by typeahead).
            onPointerDown={event => event.stopPropagation()}
            onMouseDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onKeyDown={event => {
                event.stopPropagation();
                if (event.key === 'Enter') {
                    event.preventDefault();
                    finish(true);
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    finish(false);
                }
            }}
        />
    );
}

/** One row: the disclosure chevron, icon and label (or the rename field), and a drag handle for the keyboard. */
function Row({
    id,
    label,
    editValue = label,
    icon,
    depth,
    current,
    renaming,
    onRename,
    onRenameDone,
    onContextMenu,
    children,
}: {
    id: string;
    label: string;
    editValue?: string;
    icon: ReactNode;
    /** Indent level, kept from the old tree: the document sits at 0 and Pages and Assets at 1. */
    depth: number;
    /** Marks the open page with a subtle style when something else is the selection. */
    current?: boolean;
    renaming: boolean;
    onRename?: (name: string) => void;
    onRenameDone: () => void;
    onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
    children?: ReactNode;
}) {
    return (
        <TreeItem
            id={id}
            textValue={label}
            aria-label={label}
            className={({isSelected}) =>
                cls({'tree-row': true, selected: isSelected, current: !isSelected && !!current})
            }
            style={{paddingLeft: `${depth * 0.9}rem`}}
            onContextMenu={onContextMenu}
        >
            <TreeItemContent>
                {({hasChildItems, isExpanded}) => (
                    <>
                        {hasChildItems ? (
                            <Button slot="chevron" className="tree-disclosure">
                                {isExpanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                            </Button>
                        ) : (
                            <span className="tree-disclosure-spacer" />
                        )}
                        <span className={cls({'tree-label': true, 'tree-label-editing': renaming})}>
                            {icon}
                            {renaming && onRename ? (
                                <RenameField
                                    initial={editValue}
                                    onCancel={onRenameDone}
                                    onCommit={name => {
                                        onRenameDone();
                                        onRename(name);
                                    }}
                                />
                            ) : (
                                <span>{label}</span>
                            )}
                        </span>
                        {/* React Aria wants a handle in every row; it's disabled in rows that can't move. */}
                        <Button slot="drag" className="tree-drag" aria-label={`Move ${label}`}>
                            <GripVertical aria-hidden="true" />
                        </Button>
                    </>
                )}
            </TreeItemContent>
            {children}
        </TreeItem>
    );
}

export default function TreeView(props: {
    document: DrawDocument;
    selectedIds: readonly string[];
    /** Select these shapes, all on `pageId` (switching to that page first if needed). */
    onSelectShapes: (pageId: string, ids: string[]) => void;
    selectedAsset: AssetSelection;
    onSelectAsset: (image: PixelImageData) => void;
    onSelectPalette: (palette: ColorPalette) => void;
    onSelectFont: (font: FontAsset) => void;
    onSelectPhoto: (photo: PhotoAsset) => void;
    onShapeContextMenu: (event: MouseEvent<HTMLElement>, shape: Shape) => void;
    selectedPageId: string;
    onSelectPage: (id: string) => void;
    onDocumentContextMenu: (event: MouseEvent<HTMLElement>) => void;
    documentSelected: boolean;
    onSelectDocument: () => void;
    onRenameDocument: (name: string) => void;
    onRenamePage: (id: string, name: string) => void;
    onRenameShape: (id: string, name: string) => void;
    onRenamePalette: (id: string, name: string) => void;
    onRenameImage: (id: string, name: string) => void;
    onRenamePhoto: (id: string, name: string) => void;
    onPhotoContextMenu: (event: MouseEvent<HTMLElement>, photo: PhotoAsset) => void;
    onRenameGroup: (id: string, name: string) => void;
    onPageContextMenu: (event: MouseEvent<HTMLElement>, pageId: string) => void;
    onPagesContextMenu: (event: MouseEvent<HTMLElement>) => void;
    onAssetsContextMenu: (event: MouseEvent<HTMLElement>) => void;
    onPaletteContextMenu: (event: MouseEvent<HTMLElement>, palette: ColorPalette) => void;
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
    // Folders start open, so new pages and groups appear open too: remember only the closed ones.
    const [collapsed, setCollapsed] = useState<ReadonlySet<Key>>(new Set());
    const [renaming, setRenaming] = useState<Key | null>(null);
    // The rows being dragged, to decide where they may drop (drop checks only see the data types).
    const dragging = useRef<Key[]>([]);

    const shapeById = new Map(doc.shapes.map(shape => [shape.id, shape]));
    const groupOf = (shape: Shape) =>
        doc.pages.find(page => page.id === shape.pageId)?.groups.find(group => group.shapeIds.includes(shape.id));
    const findGroup = (id: string) =>
        doc.pages.flatMap(page => page.groups.map(group => ({page, group}))).find(entry => entry.group.id === id);

    // ----- Selection: derived from the app's state, and translated back into app actions -----
    // The open page is "the selection" only when nothing more specific is selected.
    const pageIsSelection = !props.documentSelected && !props.selectedIds.length && !props.selectedAsset;
    const selectedKeys = new Set<Key>(props.selectedIds.map(id => itemKey('shape', id)));
    if (props.documentSelected) selectedKeys.add(itemKey('doc'));
    if (pageIsSelection) selectedKeys.add(itemKey('page', props.selectedPageId));
    if (props.selectedAsset) selectedKeys.add(itemKey(props.selectedAsset.kind, props.selectedAsset.id));
    for (const page of doc.pages)
        for (const group of page.groups)
            if (group.shapeIds.length && group.shapeIds.every(id => props.selectedIds.includes(id)))
                selectedKeys.add(itemKey('group', group.id));

    /** The shapes a shape or group row stands for. */
    const shapesOf = (key: Key): Shape[] => {
        const {kind, id} = parseKey(key);
        if (kind === 'shape') return shapeById.has(id) ? [shapeById.get(id)!] : [];
        if (kind === 'group')
            return (findGroup(id)?.group.shapeIds ?? []).map(shapeId => shapeById.get(shapeId)!).filter(Boolean);
        return [];
    };

    const selectOnly = (key: Key) => {
        const {kind, id} = parseKey(key);
        if (kind === 'doc') props.onSelectDocument();
        else if (kind === 'page') props.onSelectPage(id);
        else if (kind === 'shape' || kind === 'group') {
            const shapes = shapesOf(key);
            const pageId = kind === 'group' ? findGroup(id)?.page.id : shapes[0]?.pageId;
            if (pageId)
                props.onSelectShapes(
                    pageId,
                    shapes.map(shape => shape.id),
                );
        } else if (kind === 'font') {
            const font = doc.fonts.find(item => item.id === id);
            if (font) props.onSelectFont(font);
        } else if (kind === 'palette') {
            const palette = doc.palettes.find(item => item.id === id);
            if (palette) props.onSelectPalette(palette);
        } else if (kind === 'image') {
            const image = doc.images.find(item => item.id === id);
            if (image) props.onSelectAsset(image);
        } else if (kind === 'photo') {
            const photo = doc.photos.find(item => item.id === id);
            if (photo) props.onSelectPhoto(photo);
        }
    };

    const changeSelection = (selection: Selection) => {
        if (selection === 'all') {
            // Select All in the tree selects every shape on the open page.
            props.onSelectShapes(
                props.selectedPageId,
                doc.shapes.filter(shape => shape.pageId === props.selectedPageId).map(shape => shape.id),
            );
            return;
        }
        const keys = [...selection];
        const added = keys.filter(key => !selectedKeys.has(key));
        const isShapeRow = (key: Key) => ['shape', 'group'].includes(parseKey(key).kind);
        // Clicking a row selects it alone, and only shapes can be selected together: adding
        // anything else (a page, an asset, the document) to the selection selects just that.
        const only = keys.length === 1 ? keys[0] : added.find(key => !isShapeRow(key));
        if (only !== undefined) {
            selectOnly(only);
            return;
        }
        const shapes = keys.flatMap(shapesOf);
        if (!shapes.length) {
            // The last selected shape was toggled off.
            if (props.selectedIds.length) props.onSelectShapes(props.selectedPageId, []);
            return;
        }
        // A range can cross pages, but a selection belongs to one: keep the page of the row just added.
        const pageId = (added.flatMap(shapesOf)[0] ?? shapes[0]).pageId ?? props.selectedPageId;
        props.onSelectShapes(pageId, [
            ...new Set(shapes.filter(shape => shape.pageId === pageId).map(shape => shape.id)),
        ]);
    };

    // ----- Expanding, renaming -----
    const folderKeys = [
        PAGES,
        ASSETS,
        ...doc.pages.map(page => itemKey('page', page.id)),
        ...doc.pages.flatMap(page => page.groups.map(group => itemKey('group', group.id))),
    ];
    const expandedKeys = new Set(folderKeys.filter(key => !collapsed.has(key)));
    const toggle = (key: Key) =>
        setCollapsed(current => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    const renameable = (key: Key) => parseKey(key).kind !== 'folder' && parseKey(key).kind !== 'font';

    // ----- Drag and drop: pages reorder among pages, shapes among the shapes of their page -----
    const canDrag = (key: Key) => ['page', 'shape'].includes(parseKey(key).kind);
    const canDrop = (target: Key) => {
        const keys = dragging.current;
        if (!keys.length || keys.includes(target)) return false;
        const {kind, id} = parseKey(target);
        if (keys.some(key => parseKey(key).kind !== kind)) return false;
        if (kind === 'page') return true;
        if (kind !== 'shape') return false;
        const pageId = shapeById.get(id)?.pageId;
        return keys.every(key => shapeById.get(parseKey(key).id)?.pageId === pageId);
    };
    const {dragAndDropHooks} = useDragAndDrop({
        getItems: keys => [...keys].map(key => ({[DRAG_TYPE]: String(key), 'text/plain': String(key)})),
        getAllowedDropOperations: () => ['move'],
        acceptedDragTypes: [DRAG_TYPE],
        onDragStart: event => {
            dragging.current = [...event.keys];
        },
        onDragEnd: () => {
            dragging.current = [];
        },
        getDropOperation: target =>
            target.type === 'item' && target.dropPosition !== 'on' && canDrop(target.key) ? 'move' : 'cancel',
        renderDropIndicator: target => <DropIndicator target={target} className="tree-drop-indicator" />,
        onMove: ({keys, target}) => {
            if (target.dropPosition === 'on') return;
            const position = target.dropPosition;
            const {kind, id: targetId} = parseKey(target.key);
            if (kind === 'page') {
                // Moving several keeps their order: insert each before the target, or after it in reverse.
                const ids = doc.pages.filter(page => keys.has(itemKey('page', page.id))).map(page => page.id);
                for (const id of position === 'before' ? ids : ids.reverse())
                    props.onReorderPage(id, targetId, position);
                return;
            }
            const targetShape = shapeById.get(targetId);
            if (!targetShape) return;
            const moved = doc.shapes.filter(shape => keys.has(itemKey('shape', shape.id)));
            for (const shape of position === 'before' ? moved : moved.reverse())
                if (shape.pageId)
                    props.onReorderShape(
                        shape.pageId,
                        shape.id,
                        targetId,
                        position,
                        groupOf(shape)?.id ?? null,
                        groupOf(targetShape)?.id ?? null,
                    );
        },
    });
    // Only pages and shapes can be picked up; other rows ignore drags (React Aria's own options
    // can only turn dragging off for the whole tree).
    const baseDraggableItem = dragAndDropHooks.useDraggableItem!;
    const hooks: DragAndDropHooks = {
        ...dragAndDropHooks,
        useDraggableItem: (options, state) => {
            const result = baseDraggableItem(options, state);
            return canDrag(options.key)
                ? result
                : {...result, dragProps: {}, dragButtonProps: {...result.dragButtonProps, isDisabled: true}};
        },
    };

    // ----- Rows -----
    const rowProps = (key: string, onRename?: (name: string) => void) => ({
        id: key,
        renaming: renaming === key,
        onRename,
        onRenameDone: () => setRenaming(null),
    });
    const shapeRow = (shape: Shape, depth: number) => (
        <Row
            key={shape.id}
            {...rowProps(itemKey('shape', shape.id), name => props.onRenameShape(shape.id, name))}
            label={shape.name}
            depth={depth}
            icon={<Square aria-hidden="true" />}
            onContextMenu={event => props.onShapeContextMenu(event, shape)}
        />
    );

    return (
        // F2 starts renaming the focused row. Tree takes no key handler, so it's caught here.
        <div
            className="tree-view"
            onKeyDown={event => {
                if (event.key !== 'F2' || !(event.target instanceof Element)) return;
                const key = event.target.closest('[role=row]')?.getAttribute('data-key');
                if (key && renameable(key)) {
                    event.preventDefault();
                    setRenaming(key);
                }
            }}
        >
            <Tree
                aria-label="Document contents"
                selectionMode="multiple"
                selectionBehavior="replace"
                selectedKeys={selectedKeys}
                onSelectionChange={changeSelection}
                // Pages and Assets open and close but aren't selectable.
                disabledKeys={[PAGES, ASSETS]}
                disabledBehavior="selection"
                expandedKeys={expandedKeys}
                onExpandedChange={keys => setCollapsed(new Set(folderKeys.filter(key => !keys.has(key))))}
                // Double-click or Enter renames a row; on Pages and Assets (single click too) it opens or closes them.
                onAction={key => {
                    if (key === PAGES || key === ASSETS) toggle(key);
                    else if (renameable(key)) setRenaming(key);
                }}
                dragAndDropHooks={hooks}
            >
                <Row
                    {...rowProps(itemKey('doc'), props.onRenameDocument)}
                    label={`Doc: ${doc.title}`}
                    editValue={doc.title}
                    depth={0}
                    icon={<File aria-hidden="true" />}
                    onContextMenu={props.onDocumentContextMenu}
                />
                <Row
                    {...rowProps(PAGES)}
                    label="Pages"
                    depth={1}
                    icon={doc.pages.length ? <Folder aria-hidden="true" /> : <Layers aria-hidden="true" />}
                    onContextMenu={props.onPagesContextMenu}
                >
                    {doc.pages.map(page => (
                        <Row
                            key={page.id}
                            {...rowProps(itemKey('page', page.id), name => props.onRenamePage(page.id, name))}
                            label={page.name}
                            depth={2}
                            icon={<FileText aria-hidden="true" />}
                            current={page.id === props.selectedPageId}
                            onContextMenu={event => props.onPageContextMenu(event, page.id)}
                        >
                            {page.groups.map(group => (
                                <Row
                                    key={group.id}
                                    {...rowProps(itemKey('group', group.id), name =>
                                        props.onRenameGroup(group.id, name),
                                    )}
                                    label={group.name}
                                    depth={3}
                                    icon={
                                        group.shapeIds.length ? (
                                            <Folder aria-hidden="true" />
                                        ) : (
                                            <Square aria-hidden="true" />
                                        )
                                    }
                                >
                                    {group.shapeIds
                                        .map(id => shapeById.get(id))
                                        .filter((shape): shape is Shape => !!shape)
                                        .map(shape => shapeRow(shape, 4))}
                                </Row>
                            ))}
                            {doc.shapes
                                .filter(
                                    shape =>
                                        shape.pageId === page.id &&
                                        !page.groups.some(group => group.shapeIds.includes(shape.id)),
                                )
                                .map(shape => shapeRow(shape, 3))}
                        </Row>
                    ))}
                </Row>
                <Row
                    {...rowProps(ASSETS)}
                    label="Assets"
                    depth={1}
                    icon={
                        doc.fonts.length || doc.palettes.length || doc.images.length || doc.photos.length ? (
                            <Folder aria-hidden="true" />
                        ) : (
                            <Layers aria-hidden="true" />
                        )
                    }
                    onContextMenu={props.onAssetsContextMenu}
                >
                    {doc.fonts.map(font => (
                        <Row
                            key={font.id}
                            {...rowProps(itemKey('font', font.id))}
                            label={`${font.family} (Google Font)`}
                            depth={2}
                            icon={<Layers aria-hidden="true" />}
                        />
                    ))}
                    {doc.palettes.map(palette => (
                        <Row
                            key={palette.id}
                            {...rowProps(itemKey('palette', palette.id), name =>
                                props.onRenamePalette(palette.id, name),
                            )}
                            label={`${palette.name} (${palette.colors.length} colors)`}
                            editValue={palette.name}
                            depth={2}
                            icon={<Layers aria-hidden="true" />}
                            onContextMenu={event => props.onPaletteContextMenu(event, palette)}
                        />
                    ))}
                    {doc.images.map(image => (
                        <Row
                            key={image.id}
                            {...rowProps(itemKey('image', image.id), name => props.onRenameImage(image.id, name))}
                            label={`${image.name} (${image.width} × ${image.height})`}
                            editValue={image.name}
                            depth={2}
                            icon={<Layers aria-hidden="true" />}
                        />
                    ))}
                    {doc.photos.map(photo => {
                        const uses = doc.shapes.filter(
                            shape => shape.type === 'photo' && shape.components.photo.photoId === photo.id,
                        ).length;
                        return (
                            <Row
                                key={photo.id}
                                {...rowProps(itemKey('photo', photo.id), name => props.onRenamePhoto(photo.id, name))}
                                label={`${photo.name} (${photo.width} × ${photo.height}, ${uses === 0 ? 'unused' : uses === 1 ? '1 use' : `${uses} uses`})`}
                                editValue={photo.name}
                                depth={2}
                                icon={<Image aria-hidden="true" />}
                                onContextMenu={event => props.onPhotoContextMenu(event, photo)}
                            />
                        );
                    })}
                </Row>
            </Tree>
        </div>
    );
}
