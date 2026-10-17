import {SelectControl} from './ui/controls';
import {useState} from 'react';
import type {EditorStore} from './EditorStore';
import {EditorDialog} from './EditorDialog';
import {makeRepeatingImageShape} from './pixelImages';

export function NewRepeatingImage({store, onClose}: {store: EditorStore; onClose: () => void}) {
    const images = store.getSnapshot().document.images;
    const [imageId, setImageId] = useState(images[0]?.id ?? '');
    const image = images.find(item => item.id === imageId);
    return <EditorDialog title="New repeating image" onClose={onClose}>
        {!images.length ? <><p>Import a PNG or create a pixel image first.</p><button onClick={onClose}>Close</button></> : <form className="pixel-create" onSubmit={event => {
            event.preventDefault();
            if (!image) return;
            const shape = makeRepeatingImageShape(image.id, {x: 0, y: 0, width: image.width, height: image.height},
                {x: 50, y: 50, width: 320, height: 240}, `${image.name} pattern`);
            store.addShape(shape); store.select(shape.id); onClose();
        }}>
            <label>Image asset<SelectControl autoFocus value={imageId} onChange={event => setImageId(event.target.value)}>
                {images.map(item => <option key={item.id} value={item.id}>{item.name} ({item.width} × {item.height})</option>)}
            </SelectControl></label>
            {image && <p>Uses the full {image.width} × {image.height} asset as the initial tile. Adjust its source rectangle and repeat size in the property sheet after creation.</p>}
            <button type="submit" disabled={!image}>Create repeating image</button>
        </form>}
    </EditorDialog>;
}
