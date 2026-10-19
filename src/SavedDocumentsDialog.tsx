import {useEffect, useState} from 'react';
import {EditorDialog} from './EditorDialog';
import {readSavedDocuments, writeSavedDocuments, type SavedDocumentRecord} from './savedDocuments';

export function SavedDocumentsDialog({onClose, onOpen, onChanged}: {
    onClose: () => void; onOpen: (record: SavedDocumentRecord) => void; onChanged: (records: SavedDocumentRecord[]) => void;
}) {
    const [records, setRecords] = useState<SavedDocumentRecord[]>([]);
    const [error, setError] = useState('');
    const refresh = async () => { try { setRecords(await readSavedDocuments()); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to read saved documents'); } };
    useEffect(() => { void refresh(); }, []);
    const mutate = async (next: SavedDocumentRecord[]) => {
        try { await writeSavedDocuments(next); setRecords(next); setError(''); onChanged(next); }
        catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update saved documents'); }
    };
    return <EditorDialog title="Saved documents" onClose={onClose}>
        <div className="saved-documents">
            {error && <p role="alert">{error}</p>}
            {!records.length && !error && <p>No documents saved in this browser yet.</p>}
            {records.map(record => <div className="saved-document-row" key={record.id}>
                <div className="saved-document-info"><strong>{record.name}</strong><small>Saved {new Date(record.savedAt).toLocaleString()}</small></div>
                <button onClick={() => onOpen(record)}>Open</button>
                <button onClick={() => { const name = window.prompt('Saved document name', record.name); if (name?.trim()) void mutate(records.map(item => item.id === record.id ? {...item, name: name.trim()} : item)); }}>Rename</button>
                <button onClick={() => { if (window.confirm(`Delete “${record.name}” from saved documents?`)) void mutate(records.filter(item => item.id !== record.id)); }}>Delete</button>
            </div>)}
        </div>
    </EditorDialog>;
}
