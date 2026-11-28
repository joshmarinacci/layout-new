import {type CommandContext, type CommandId, commandRegistry, type DocumentTab} from '../commands';
import {IconButton, MenuItem} from '../ui/controls';
import {shortcutLabel} from './keybindings';
import type {MouseEvent} from 'react';
import {useEditorStore} from '../model/useEditorStore';
import {BugIcon} from 'lucide-react';

export function CommandButton({commandId, ctx}: {commandId: CommandId; ctx: CommandContext}) {
    const command = commandRegistry.require(commandId);
    return (
        <button disabled={!command.enabled(ctx)} onClick={() => command.run(ctx)}>
            {command.title}
        </button>
    );
}

export function CommandIconButton({commandId, ctx}: {commandId: CommandId; ctx: CommandContext}) {
    const command = commandRegistry.require(commandId);
    return (
        <IconButton
            label={command.title}
            icon={command.icon ? command.icon : BugIcon}
            disabled={!command.enabled(ctx)}
            onClick={() => command.run(ctx)}
        />
    );
}

export function CommandMenuItem(props: {ctx: CommandContext; commandId: CommandId; onRun?: () => void}) {
    const {ctx, commandId, onRun} = props;
    const command = commandRegistry.require(commandId);
    return (
        <MenuItem
            disabled={!command.enabled(ctx)}
            shortcut={shortcutLabel(command.id)}
            onClick={() => {
                command.run(ctx);
                onRun?.();
            }}
            label={command.title}
        />
    );
}

export function DocumentTabButton({
    tab,
    active,
    activate,
    onContextMenu,
}: {
    tab: DocumentTab;
    active: boolean;
    activate: () => void;
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
    const {document} = useEditorStore(tab.store);
    const dirty = tab.savedJson !== tab.store.toJSON();
    return (
        <button
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active}
            aria-controls="document-editor"
            tabIndex={active ? 0 : -1}
            onClick={activate}
            onContextMenu={onContextMenu}
            title={`${document.title || 'Untitled'}${dirty ? ' — unsaved in browser storage' : ' — saved in browser storage'}`}
        >
            {document.title || 'Untitled'}
            {dirty ? ' •' : ''}
        </button>
    );
}
