import type {Document} from './types';
import {deserializeDocument} from './serialization';

export const SAVED_DOCUMENTS_KEY = 'layout-new:saved-documents:v1';
export interface SavedDocumentRecord { id: string; name: string; savedAt: string; json: string }
export function readSavedDocuments(): SavedDocumentRecord[] {
    const raw = localStorage.getItem(SAVED_DOCUMENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Saved documents storage is invalid');
    return parsed.map((item): SavedDocumentRecord => {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.savedAt !== 'string' || typeof item.json !== 'string')
            throw new Error('Saved documents storage is invalid');
        deserializeDocument(item.json);
        return {id: item.id, name: item.name, savedAt: item.savedAt, json: item.json};
    });
}
export function writeSavedDocuments(records: readonly SavedDocumentRecord[]) {
    localStorage.setItem(SAVED_DOCUMENTS_KEY, JSON.stringify(records));
}
export function parseSavedDocument(json: string): Document { return deserializeDocument(json); }
