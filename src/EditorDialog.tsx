import {X} from 'lucide-react';
import {IconButton} from './ui/controls';
import {useEffect, useRef, type ReactNode} from 'react';

export function EditorDialog({title, onClose, children}: {title: string; onClose: () => void; children: ReactNode}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current!;
        dialog.showModal();
        return () => { dialog.close(); };
    }, []);
    return <dialog className="editor-dialog" ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>
        <header><h2>{title}</h2><IconButton label="Close editor" icon={X} onClick={onClose}/></header>
        <div className="dialog-content">{children}</div>
    </dialog>;
}
