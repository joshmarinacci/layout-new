import {useEffect, useState} from 'react';
import {EditorDialog} from '../common/EditorDialog';
import {readSavedDocuments, type SavedDocumentRecord, writeSavedDocuments} from './savedDocuments';

export function SavedDocumentsDialog({
    onClose,
    onOpen,
    onChanged,
}: {
    onClose: () => void;
    onOpen: (record: SavedDocumentRecord) => void;
    onChanged: (records: SavedDocumentRecord[]) => void;
}) {
    const [records, setRecords] = useState<SavedDocumentRecord[]>([]);
    const [error, setError] = useState('');
    useEffect(() => {
        let cancelled = false;
        readSavedDocuments().then(
            loaded => {
                if (!cancelled) {
                    setRecords(loaded);
                    setError('');
                }
            },
            reason => {
                if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to read saved documents');
            },
        );
        return () => {
            cancelled = true;
        };
    }, []);
    const mutate = async (next: SavedDocumentRecord[]) => {
        try {
            await writeSavedDocuments(next);
            setRecords(next);
            setError('');
            onChanged(next);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Unable to update saved documents');
        }
    };
    return (
        <EditorDialog title="Saved documents" onClose={onClose}>
            <div className="saved-documents">
                {error && <p role="alert">{error}</p>}
                {!records.length && !error && <p>No documents saved in this browser yet.</p>}
                {records.map(record => (
                    <div className="saved-document-row" key={record.id}>
                        <div className="saved-document-info">
                            <strong>{record.name}</strong>
                            <small>Saved {new Date(record.savedAt).toLocaleString()}</small>
                        </div>
                        <button onClick={() => onOpen(record)}>Open</button>
                        <button
                            onClick={() => {
                                const name = window.prompt('Saved document name', record.name);
                                if (name?.trim())
                                    void mutate(
                                        records.map(item =>
                                            item.id === record.id ? {...item, name: name.trim()} : item,
                                        ),
                                    );
                            }}
                        >
                            Rename
                        </button>
                        <button
                            onClick={() => {
                                if (window.confirm(`Delete “${record.name}” from saved documents?`))
                                    void mutate(records.filter(item => item.id !== record.id));
                            }}
                        >
                            Delete
                        </button>
                    </div>
                ))}
            </div>
        </EditorDialog>
    );
}
