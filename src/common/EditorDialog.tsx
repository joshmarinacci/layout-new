import {X} from 'lucide-react';
import {type ReactNode, useEffect, useRef} from 'react';
import {IconButton} from '../ui/controls';

/** A modal in tooltheme's shape: `dialog > header` with the title, then the content. */
export function EditorDialog({title, onClose, children}: {
    title: string;
    onClose: () => void;
    children: ReactNode
}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current!;
        dialog.showModal();
        dialog.querySelector<HTMLElement>('[data-dialog-autofocus]')?.focus();
        return () => {
            dialog.close();
        };
    }, []);
    return <dialog className="editor-dialog" ref={ref} aria-label={title} onCancel={event => {
        event.preventDefault();
        onClose();
    }}>
        <header><h2>{title}</h2><IconButton label="Close editor" icon={X} onClick={onClose}/></header>
        <div className="dialog-content">{children}</div>
    </dialog>;
}
