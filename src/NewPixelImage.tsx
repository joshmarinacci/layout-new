import {useState} from 'react';
import {EditorDialog} from './EditorDialog';
import {PALETTES} from './pixelImages';
import type {EditorStore} from './EditorStore';

export function NewPixelImage({store, onClose, onCreated}: {store: EditorStore; onClose: () => void; onCreated: (imageId: string) => void}) {
    const [size, setSize] = useState(16);
    const [palette, setPalette] = useState<keyof typeof PALETTES>('Classic 16');
    const [error, setError] = useState('');
    return <EditorDialog title="New pixel image" onClose={onClose}>
        <form className="pixel-create" onSubmit={event => {
            event.preventDefault();
            try {
                const id = store.createPixelImage(size, size, PALETTES[palette]);
                store.select(id);
                const shape = store.getSnapshot().document.shapes.find(item => item.id === id)!;
                if (shape.type === 'pixel-image') onCreated(shape.components.image.imageId);
            } catch (error) { setError(error instanceof Error ? error.message : 'Unable to create image'); }
        }}>
            <label>Size<select autoFocus value={size} onChange={event => setSize(Number(event.target.value))}>
                {[8, 16, 32].map(value => <option key={value} value={value}>{value} × {value}</option>)}
            </select></label>
            <label>Palette<select value={palette} onChange={e => setPalette(e.target.value as keyof typeof PALETTES)}>
                {Object.keys(PALETTES).map(name => <option key={name}>{name}</option>)}
            </select></label>
            <div className="pixel-palette">{PALETTES[palette].map(color => <span key={color} style={{background: color}} title={color}/>)}</div>
            <p>Starts transparent. Display size is independent of pixel resolution.</p>
            <p role="alert">{error}</p><button type="submit">Create image</button>
        </form>
    </EditorDialog>;
}
