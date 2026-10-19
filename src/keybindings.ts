export type Keybinding = {
    commandId: string;
    key: string;
    mac?: string;
    other?: string;
    when?: (event: KeyboardEvent) => boolean;
};

/** Portable command shortcut registry. Key strings use cmd/ctrl/shift/alt modifiers. */
export const keybindings: Keybinding[] = [
    {commandId: 'new-document', key: 'cmd-n', mac: '⌘N', other: 'Ctrl+N'},
    {commandId: 'save', key: 'cmd-s', mac: '⌘S', other: 'Ctrl+S'},
    {commandId: 'duplicate', key: 'cmd-d', mac: '⌘D', other: 'Ctrl+D'},
    {commandId: 'delete', key: 'delete', mac: 'Delete', other: 'Delete'},
    {commandId: 'undo', key: 'cmd-z', mac: '⌘Z', other: 'Ctrl+Z'},
    {commandId: 'redo', key: 'cmd-shift-z', mac: '⌘⇧Z', other: 'Ctrl+Shift+Z'},
    {
        commandId: 'open-palette',
        key: 'cmd-shift-p',
        mac: '⌘⇧P',
        other: 'Ctrl+Shift+P'
    },
    {
        commandId: 'toggle-left-sidebar',
        key: 'cmd-shift-b',
        mac: '⌘⇧B',
        other: 'Ctrl+Shift+B'
    },
    {
        commandId: 'toggle-right-sidebar',
        key: 'cmd-shift-alt-b',
        mac: '⌘⌥⇧B',
        other: 'Ctrl+Alt+Shift+B'
    }
];

function parseBinding(binding: Keybinding) {
    const parts = binding.key.toLowerCase().split('-');
    const key = parts.pop()!;
    return {
        key,
        cmd: parts.includes('cmd'),
        ctrl: parts.includes('ctrl'),
        shift: parts.includes('shift'),
        alt: parts.includes('alt')
    };
}

export function matchesKeybinding(event: KeyboardEvent, binding: Keybinding): boolean {
    const parsed = parseBinding(binding);
    const wantsCommand = parsed.cmd || parsed.ctrl;
    return event.key.toLowerCase() === parsed.key &&
        (wantsCommand ? event.metaKey || event.ctrlKey : !event.metaKey && !event.ctrlKey) &&
        event.shiftKey === parsed.shift && event.altKey === parsed.alt &&
        (binding.when?.(event) ?? true);
}

export function shortcutLabel(commandId: string): string | undefined {
    const bindings = keybindings.filter(binding => binding.commandId === commandId);
    if (!bindings.length) return undefined;
    const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
    return bindings.map(binding => mac ? binding.mac ?? binding.key : binding.other ?? binding.key).join(' / ');
}
