import { db } from './firebase';
import { unzipSync } from 'fflate';
import { UserProfile, Role } from '../types';
import { cacheScope, readDeviceCache, removeDeviceCache, writeDeviceCache } from './deviceCache';

export interface StationaryDocument {
    id: string;
    name: string;
    description: string;
    fileName: string;
    mimeType: string;
    size: number;
    version: string;
    chunkCount: number;
    sha256: string;
    uploadedAt: string;
    uploadedBy: string;
    uploadedByName: string;
}
export const MAX_STATIONARY_SIZE = 20 * 1024 * 1024;
export const BASE64_CHUNK_SIZE = 600_000;
const pending = new Map<string, Promise<Blob>>();
const deletedFiles = new Set<string>();

export function encodeFileBytes(bytes: Uint8Array): string {
    const parts: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
        parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
    }
    return btoa(parts.join(''));
}
export function decodeFileBytes(base64: string): Uint8Array<ArrayBuffer> {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
}
async function checksum(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
const fileKey = (document: StationaryDocument) => `stationary-file:${document.id}:${document.version}`;

export async function uploadStationary(file: File, details: { name: string; description: string; userId: string; userName: string }): Promise<StationaryDocument> {
    if (!file.size) throw new Error('Choose a file that is not empty.');
    if (file.size > MAX_STATIONARY_SIZE) throw new Error('Choose a file smaller than 20 MB.');
    if (!details.name.trim()) throw new Error('Enter a document name.');
    const scope = cacheScope();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = encodeFileBytes(bytes);
    const reference = db.collection('stationaries').doc();
    const document: StationaryDocument = {
        id: reference.id, name: details.name.trim().slice(0, 160), description: details.description.trim().slice(0, 1000),
        fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size,
        version: crypto.randomUUID(), chunkCount: Math.ceil(base64.length / BASE64_CHUNK_SIZE), sha256: await checksum(bytes),
        uploadedAt: new Date().toISOString(), uploadedBy: details.userId, uploadedByName: details.userName,
    };
    if (cacheScope() !== scope) throw new Error('The signed-in account changed. Please reopen the upload form.');
    const { id, ...metadata } = document;
    // Keep each commit below Firestore's 10 MiB request limit. Publish metadata
    // with the final group so readers never see a file before its chunks exist.
    for (let offset = 0; offset < document.chunkCount; offset += 10) {
        const batch = db.batch();
        const end = Math.min(offset + 10, document.chunkCount);
        if (end === document.chunkCount) batch.set(reference, metadata);
        for (let index = offset; index < end; index++) {
            batch.set(reference.collection('stationaryChunks').doc(`${document.version}-${String(index).padStart(4, '0')}`), {
                version: document.version, index,
                base64: base64.slice(index * BASE64_CHUNK_SIZE, (index + 1) * BASE64_CHUNK_SIZE),
            });
        }
        if (cacheScope() !== scope) throw new Error('The signed-in account changed. Please reopen the upload form.');
        await batch.commit();
    }
    if (cacheScope() === scope) await writeDeviceCache(fileKey(document), { blob: new Blob([bytes], { type: document.mimeType }), sha256: document.sha256 }, scope).catch(() => {});
    return document;
}

export async function loadStationaryFile(document: StationaryDocument): Promise<Blob> {
    const scope = cacheScope();
    const key = fileKey(document);
    const requestKey = `${scope}:${key}`;
    if (deletedFiles.has(requestKey)) throw new Error('This stationery document has been deleted.');
    const cached = await readDeviceCache<{ blob: Blob; sha256: string }>(key);
    if (scope !== cacheScope()) throw new Error('The signed-in account changed. Please reopen the document.');
    if (cached?.blob instanceof Blob && cached.sha256 === document.sha256 && cached.blob.size === document.size) return cached.blob;
    if (pending.has(requestKey)) return pending.get(requestKey)!;
    const request = (async () => {
        if (!Number.isInteger(document.chunkCount) || document.chunkCount < 1 || document.chunkCount > 50 || document.size > MAX_STATIONARY_SIZE) throw new Error('This file has invalid storage details.');
        const query = db.collection('stationaries').doc(document.id).collection('stationaryChunks').where('version', '==', document.version).limit(document.chunkCount);
        let snapshot;
        try { snapshot = await query.get({ source: 'cache' }); } catch { /* Read the server only when local chunks are incomplete. */ }
        if (snapshot?.size !== document.chunkCount) {
            if (!navigator.onLine) throw new Error('This file has not been saved on this device yet. Connect to the internet and view it once.');
            snapshot = await query.get({ source: 'server' });
        }
        const chunks = snapshot.docs.map(doc => doc.data()).sort((a, b) => a.index - b.index);
        if (chunks.length !== document.chunkCount || chunks.some((chunk, index) => chunk.index !== index || typeof chunk.base64 !== 'string')) throw new Error('The document upload is incomplete. Please try again after it finishes syncing.');
        const bytes = decodeFileBytes(chunks.map(chunk => chunk.base64).join(''));
        if (bytes.byteLength !== document.size || await checksum(bytes) !== document.sha256) throw new Error('The stored file is incomplete or damaged. Please upload it again.');
        const blob = new Blob([bytes], { type: document.mimeType });
        if (cacheScope() === scope && !deletedFiles.has(requestKey)) await writeDeviceCache(key, { blob, sha256: document.sha256 }, scope).catch(() => {});
        return blob;
    })().finally(() => { pending.delete(requestKey); });
    pending.set(requestKey, request);
    return request;
}

export type StationaryPreviewKind = 'pdf' | 'docx' | 'image' | 'text' | 'unsupported';
export function stationaryPreviewKind(document: Pick<StationaryDocument, 'fileName' | 'mimeType'>): StationaryPreviewKind {
    const extension = document.fileName.trim().split('.').pop()?.toLowerCase();
    const mimeType = document.mimeType.toLowerCase().split(';')[0].trim();
    if (extension === 'pdf' || document.mimeType === 'application/pdf') return 'pdf';
    if (['docx', 'docm', 'dotx', 'dotm'].includes(extension || '') || ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.template', 'application/vnd.ms-word.document.macroenabled.12', 'application/vnd.ms-word.template.macroenabled.12'].includes(mimeType)) return 'docx';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif'].includes(extension || '') || document.mimeType.startsWith('image/')) return 'image';
    if (['txt', 'csv', 'tsv', 'md', 'json', 'xml', 'log', 'html', 'htm', 'rtf'].includes(extension || '') || document.mimeType.startsWith('text/')) return 'text';
    return 'unsupported';
}
// Detect Word's OpenXML ZIP structure when upload metadata is generic or the
// filename has no extension. Inspect entries without inflating their contents.
export async function resolveStationaryPreviewKind(document: Pick<StationaryDocument, 'fileName' | 'mimeType'>, blob: Blob): Promise<StationaryPreviewKind> {
    const kind = stationaryPreviewKind(document);
    if (kind !== 'unsupported') return kind;
    const signature = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...signature) === '%PDF-') return 'pdf';
    if (signature[0] === 0x50 && signature[1] === 0x4b) {
        let word = false, contentTypes = false;
        try {
            unzipSync(new Uint8Array(await blob.arrayBuffer()), { filter: entry => {
                word ||= entry.name === 'word/document.xml';
                contentTypes ||= entry.name === '[Content_Types].xml';
                return false;
            } });
        } catch { return 'unsupported'; }
        if (word && contentTypes) return 'docx';
    }
    return 'unsupported';
}

export async function deleteStationary(document: StationaryDocument, user: UserProfile): Promise<void> {
    if (user.role !== Role.Admin) throw new Error('Only administrators can delete stationery documents.');
    if (!document.id || !document.version || !Number.isInteger(document.chunkCount) || document.chunkCount < 1 || document.chunkCount > 50) throw new Error('This file has invalid storage details.');
    const scope = cacheScope();
    const reference = db.collection('stationaries').doc(document.id);
    // Known immutable chunk IDs avoid reading the large payload before deleting.
    // Deletion is atomic and fits in one batch (at most 51 operations).
    const batch = db.batch();
    batch.delete(reference);
    for (let index = 0; index < document.chunkCount; index++) {
        batch.delete(reference.collection('stationaryChunks').doc(`${document.version}-${String(index).padStart(4, '0')}`));
    }
    await batch.commit();
    deletedFiles.add(`${scope}:${fileKey(document)}`);
    await removeDeviceCache(fileKey(document), scope).catch(() => {});
}

export function downloadStationary(document: StationaryDocument, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url; anchor.download = document.fileName; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export function formatStationarySize(size: number): string {
    return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
