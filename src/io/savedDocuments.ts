import type {Document} from '../model/types';
import {deserializeDocument} from './serialization';
import {invoke, isTauri} from '@tauri-apps/api/core';
import {indexedDbAvailable, readStoredRecords, writeStoredRecords} from './savedDocumentsIdb';

/** Where web saves lived before they moved to IndexedDB; still used where IndexedDB is missing. */
export const SAVED_DOCUMENTS_KEY = 'layout-new:saved-documents:v1';
export interface SavedDocumentRecord {
    id: string;
    name: string;
    savedAt: string;
    json: string;
}
export async function readSavedDocuments(): Promise<SavedDocumentRecord[]> {
    if (isTauri()) {
        const records = await invoke<SavedDocumentRecord[]>('read_saved_documents');
        return validateRecords(records);
    }
    if (indexedDbAvailable()) {
        const stored = await readStoredRecords();
        if (stored !== undefined) return validateRecords(stored);
        // First run with IndexedDB: move any documents saved in localStorage across.
        const legacy = readLocalStorage();
        if (!legacy.length) return [];
        await writeStoredRecords(legacy);
        localStorage.removeItem(SAVED_DOCUMENTS_KEY);
        return legacy;
    }
    return readLocalStorage();
}
function readLocalStorage(): SavedDocumentRecord[] {
    const raw = localStorage.getItem(SAVED_DOCUMENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return validateRecords(parsed);
}
function validateRecords(parsed: unknown): SavedDocumentRecord[] {
    if (!Array.isArray(parsed)) throw new Error('Saved documents storage is invalid');
    return parsed.map((item): SavedDocumentRecord => {
        if (
            !item ||
            typeof item !== 'object' ||
            typeof item.id !== 'string' ||
            typeof item.name !== 'string' ||
            typeof item.savedAt !== 'string' ||
            typeof item.json !== 'string'
        )
            throw new Error('Saved documents storage is invalid');
        deserializeDocument(item.json);
        return {id: item.id, name: item.name, savedAt: item.savedAt, json: item.json};
    });
}
export async function writeSavedDocuments(records: readonly SavedDocumentRecord[]) {
    if (isTauri()) {
        await invoke('write_saved_documents', {records});
        return;
    }
    if (indexedDbAvailable()) await writeStoredRecords(records.map(record => ({...record})));
    else localStorage.setItem(SAVED_DOCUMENTS_KEY, JSON.stringify(records));
}
export function parseSavedDocument(json: string): Document {
    return deserializeDocument(json);
}
