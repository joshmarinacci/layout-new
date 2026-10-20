import type {Command, CommandContext, DocumentTab} from "./commands";
import {MenuItem} from "./ui/controls";
import {keybindings} from "./keybindings";
import type {MouseEvent} from "react";
import {useEditorStore} from "./useEditorStore";

export function CommandButton({command, ctx}: {
    command: Command,
    ctx: CommandContext
}) {
    return <button disabled={!command.enabled(ctx)}
                   onClick={() => command.run(ctx)}>{command.title}</button>
}

export function CommandMenuItem(props: {
    ctx: CommandContext,
    command: Command
}) {
    const {ctx, command} = props
    return <MenuItem
        disabled={!command.enabled(props.ctx)}
        shortcut={keybindings.find(binding => binding.commandId === command.id)?.mac ?? 'foo'}
        onClick={() => command.run(ctx)}
        label={command.title}/>
}

export function DocumentTabButton({tab, active, activate, onContextMenu}: {
    tab: DocumentTab;
    active: boolean;
    activate: () => void
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void
}) {
    const {document} = useEditorStore(tab.store);
    const dirty = tab.savedJson !== tab.store.toJSON();
    return <button role="tab" id={`tab-${tab.id}`} aria-selected={active}
                   aria-controls="document-editor"
                   tabIndex={active ? 0 : -1} onClick={activate}
                   onContextMenu={onContextMenu}
                   title={`${document.title || 'Untitled'}${dirty ? ' — unsaved in browser storage' : ' — saved in browser storage'}`}>
        {document.title || 'Untitled'}{dirty ? ' •' : ''}
    </button>;
}