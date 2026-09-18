import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { Role } from '../../types';
import { Search, Plus, FileText, Download, Printer, Eye, X, Upload, Loader2, Trash2 } from 'lucide-react';
import { db } from '../../services/firebase';
import { usePagedQuery } from '../../services/usePagedQuery';
import { StationaryDocument, deleteStationary, downloadStationary, formatStationarySize, loadStationaryFile, stationaryPreviewKind, uploadStationary } from '../../services/stationaries';
import LoadMore from '../../components/utils/LoadMore';
import Modal from '../../components/utils/Modal';
import LoadingSpinner from '../../components/utils/LoadingSpinner';
import StationaryPreview, { StationaryPreviewHandle } from './StationaryPreview';
import './stationaries.css';

const StationariesPage: React.FC = () => {
    const { userProfile } = useAuth();
    const { addNotification } = useNotification();
    const [searchQuery, setSearchQuery] = useState('');
    const query = useMemo(() => db.collection('stationaries').orderBy('uploadedAt', 'desc'), []);
    const documents = usePagedQuery<StationaryDocument>(query, 'stationaries');
    const [selected, setSelected] = useState<StationaryDocument | null>(null);
    const [blob, setBlob] = useState<Blob | null>(null);
    const [panelOpen, setPanelOpen] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const [printReady, setPrintReady] = useState(false);
    const [busyDownload, setBusyDownload] = useState<string | null>(null);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<StationaryDocument | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const preview = useRef<StationaryPreviewHandle>(null);
    const browser = useRef<HTMLElement>(null);
    const viewRequest = useRef(0);
    const pendingPrint = useRef<number | null>(null);
    const canUpload = userProfile?.role === Role.Admin;
    const onPreviewReady = useCallback((ready: boolean) => {
        setPrintReady(ready);
        if (ready && pendingPrint.current === viewRequest.current) {
            pendingPrint.current = null;
            const request = viewRequest.current;
            requestAnimationFrame(() => { if (request === viewRequest.current) preview.current?.print(); });
        }
    }, []);
    const filtered = useMemo(() => {
        const search = searchQuery.trim().toLowerCase();
        return documents.records.filter(document => `${document.name} ${document.description} ${document.fileName}`.toLowerCase().includes(search));
    }, [documents.records, searchQuery]);

    const closePanel = useCallback(() => { setPanelOpen(false); pendingPrint.current = null; viewRequest.current++; setPreviewLoading(false); }, []);
    useEffect(() => {
        const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !uploadOpen && !deleteTarget) closePanel(); };
        window.addEventListener('keydown', keydown);
        return () => window.removeEventListener('keydown', keydown);
    }, [closePanel, uploadOpen, deleteTarget]);
    useEffect(() => () => { viewRequest.current++; }, []);
    useEffect(() => {
        const element = browser.current;
        if (!element) return;
        const positions = new Map<HTMLElement, { left: number; top: number; width: number; height: number }>();
        const animations = new Map<HTMLElement, Animation>();
        const observer = new ResizeObserver(() => {
            element.querySelectorAll<HTMLElement>('.stationary-card').forEach(card => {
                const next = { left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight };
                const previous = positions.get(card);
                if (previous && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && (Math.abs(previous.left - next.left) > 20 || Math.abs(previous.top - next.top) > 20 || Math.abs(previous.width - next.width) > 20)) {
                    animations.get(card)?.cancel();
                    animations.set(card, card.animate([{ transform: `translate(${previous.left - next.left}px, ${previous.top - next.top}px) scale(${previous.width / next.width}, ${previous.height / next.height})` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }));
                }
                positions.set(card, next);
            });
        });
        observer.observe(element);
        return () => { observer.disconnect(); animations.forEach(animation => animation.cancel()); };
    }, []);

    async function viewDocument(document: StationaryDocument, shouldPrint = false) {
        const request = ++viewRequest.current;
        pendingPrint.current = shouldPrint ? request : null;
        setSelected(document); setBlob(null); setPreviewError(''); setPrintReady(false); setPanelOpen(true); setPreviewLoading(true);
        try {
            const fileBlob = await loadStationaryFile(document);
            if (request === viewRequest.current) setBlob(fileBlob);
        } catch (failure) {
            if (request === viewRequest.current) setPreviewError(failure instanceof Error ? failure.message : 'Could not load this file. Please retry.');
        } finally { if (request === viewRequest.current) setPreviewLoading(false); }
    }
    async function downloadDocument(document: StationaryDocument) {
        if (busyDownload) return;
        setBusyDownload(document.id);
        try { downloadStationary(document, selected?.id === document.id && blob ? blob : await loadStationaryFile(document)); }
        catch (failure) { addNotification(failure instanceof Error ? failure.message : 'Could not download the file.', 'error'); }
        finally { setBusyDownload(null); }
    }
    async function handleUpload(event: React.FormEvent) {
        event.preventDefault();
        if (!canUpload || !userProfile || !file || uploading) return;
        setUploading(true); setUploadError('');
        try {
            const document = await uploadStationary(file, { name, description, userId: userProfile.id, userName: `${userProfile.name} ${userProfile.surname}` });
            addNotification('Document saved successfully.', 'success');
            setUploadOpen(false); setFile(null); setName(''); setDescription('');
            void viewDocument(document);
        } catch (failure) { setUploadError(failure instanceof Error ? failure.message : 'Could not upload the file. Please retry.'); }
        finally { setUploading(false); }
    }

    async function confirmDelete() {
        if (!deleteTarget || !canUpload || !userProfile || deleting) return;
        const target = deleteTarget;
        setDeleting(true); setDeleteError('');
        try {
            await deleteStationary(target, userProfile);
            if (selected?.id === target.id) { closePanel(); setSelected(null); setBlob(null); setPrintReady(false); }
            setDeleteTarget(null);
            addNotification('Stationery document deleted.', 'success');
        } catch (failure) { setDeleteError(failure instanceof Error ? failure.message : 'Could not delete this document. Please retry.'); }
        finally { setDeleting(false); }
    }
    function askDelete(document: StationaryDocument) { setDeleteError(''); setDeleteTarget(document); }

    return <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
            <div><h1 className="text-3xl font-bold text-white">Stationaries & Forms</h1><p className="text-gray-400 mt-1">View, download and print hospital documents.</p></div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input aria-label="Search documents" type="search" placeholder="Search documents…" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-lg bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-sky-500" /></div>
                {canUpload && <button onClick={() => { setUploadError(''); setUploadOpen(true); }} className="flex shrink-0 items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-500"><Plus size={18} /><span>Upload</span></button>}
            </div>
        </div>
        <div className={`stationaries-workspace ${panelOpen ? 'stationaries-workspace-open' : ''}`}>
            <section ref={browser} className="stationaries-browser no-print" aria-label="Stationary documents">
                <div className="stationaries-cards">
                    {filtered.map(document => <article key={document.id} className="stationary-card bg-[#161B22] border border-gray-700 rounded-xl p-6 hover:border-sky-500/50 flex flex-col items-center text-center">
                        <div className="p-4 bg-gray-800 rounded-full text-sky-400 mb-4"><FileText size={32} /></div>
                        <h3 className="text-lg font-bold text-white mb-2 break-words">{document.name}</h3>
                        <p className="text-sm text-gray-400 mb-3 flex-grow break-words">{document.description || document.fileName}</p>
                        <p className="text-xs text-gray-500 mb-5">{document.fileName.split('.').pop()?.toUpperCase()} · {formatStationarySize(document.size)}</p>
                        <div className="flex flex-wrap gap-2 w-full mt-auto">
                            <button onClick={() => void viewDocument(document)} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-lg"><Eye size={16} />View</button>
                            <button onClick={() => void downloadDocument(document)} disabled={busyDownload === document.id} title="Download original file" aria-label={`Download ${document.name}`} className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg">{busyDownload === document.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}</button>
                            {stationaryPreviewKind(document) !== 'unsupported' && <button onClick={() => void viewDocument(document, true)} title="Print document" aria-label={`Print ${document.name}`} className="flex items-center justify-center px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg"><Printer size={16} /></button>}
                            {canUpload && <button onClick={() => askDelete(document)} title="Delete document" aria-label={`Delete ${document.name}`} className="flex items-center justify-center px-3 py-2 text-red-400 hover:bg-red-900/20 rounded-lg"><Trash2 size={16} /></button>}
                        </div>
                    </article>)}
                </div>
                {documents.loading && !documents.records.length && <div className="py-12"><LoadingSpinner /><p className="text-center text-sm text-gray-400">Loading documents…</p></div>}
                {!documents.loading && !filtered.length && <div className="py-16 px-6 bg-[#161B22] border border-gray-700 rounded-xl text-center"><FileText size={32} className="mx-auto mb-4 text-gray-500" /><h3 className="text-lg font-semibold text-white">{searchQuery ? 'No matching documents' : 'No documents uploaded yet'}</h3><p className="text-gray-400 mt-1">{searchQuery ? 'Try another search or load more documents below.' : canUpload ? 'Upload a file to view and share it here.' : 'Uploaded hospital documents will appear here.'}</p></div>}
                <LoadMore hasMore={documents.hasMore} loading={documents.loadingMore} error={documents.error} indexUrl={documents.indexUrl} onLoad={documents.loadMore} onRetry={documents.refresh} />
            </section>
            <aside className="stationaries-panel" aria-label="Document preview" aria-hidden={!panelOpen} {...(!panelOpen ? { inert: '' } : {})}>
                <div className="stationaries-panel-inner rounded-xl border border-gray-700 bg-[#161B22] overflow-hidden">
                    <div className="stationaries-toolbar flex items-center justify-between gap-3 p-3 border-b border-gray-700 no-print">
                        <div className="min-w-0"><h2 className="text-sm font-bold text-white truncate">{selected?.name || 'Document preview'}</h2><p className="text-xs text-gray-400 truncate">{selected?.fileName}</p></div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button title="Download original file" aria-label="Download original file" disabled={!selected || previewLoading || busyDownload === selected?.id} onClick={() => selected && void downloadDocument(selected)} className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-40"><Download size={17} /></button>
                            <button title="Print document" aria-label="Print document" disabled={!printReady || !panelOpen} onClick={() => preview.current?.print()} className="p-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40"><Printer size={17} /></button>
                            {canUpload && selected && <button title="Delete document" aria-label="Delete document" onClick={() => askDelete(selected)} className="p-2 rounded-lg text-red-400 hover:bg-red-900/20"><Trash2 size={17} /></button>}
                            <button title="Close preview" aria-label="Close preview" onClick={closePanel} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700"><X size={19} /></button>
                        </div>
                    </div>
                    <div className="stationaries-document-scroll">
                        {previewLoading && <div className="py-16 text-center no-print"><LoadingSpinner /><p className="text-sm text-gray-300">Loading document…</p></div>}
                        {previewError && <div className="p-6 no-print"><p role="alert" className="text-sm text-red-300">{previewError}</p><button onClick={() => selected && void viewDocument(selected)} className="mt-3 text-sky-400 text-sm hover:underline">Retry</button></div>}
                        {selected && blob && <StationaryPreview key={`${selected.id}:${selected.version}`} ref={preview} document={selected} blob={blob} onReady={onPreviewReady} />}
                    </div>
                    {selected && blob && stationaryPreviewKind(selected) === 'docx' && <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-700 no-print">Word layout can vary slightly with fonts available on this device.</p>}
                </div>
            </aside>
        </div>
        <Modal isOpen={!!deleteTarget} onClose={() => { if (!deleting) setDeleteTarget(null); }} title="Delete stationery">
            <p className="text-sm text-gray-300">Delete <strong>{deleteTarget?.name}</strong> and its uploaded file? This cannot be undone.</p>
            {deleteError && <p role="alert" className="mt-3 text-sm text-red-300">{deleteError}</p>}
            <div className="mt-6 flex justify-end gap-3"><button disabled={deleting} onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600">Cancel</button><button disabled={deleting} onClick={() => void confirmDelete()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-50">{deleting ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}{deleting ? 'Deleting…' : 'Delete document'}</button></div>
        </Modal>
        <Modal isOpen={uploadOpen} onClose={() => { if (!uploading) setUploadOpen(false); }} title="Upload document">
            <form onSubmit={handleUpload} className="space-y-4">
                <div><label htmlFor="stationary-file" className="block text-sm text-gray-300 mb-2">File</label><input id="stationary-file" type="file" required disabled={uploading} onChange={event => { const selected = event.target.files?.[0] || null; setFile(selected); if (selected && !name) setName(selected.name.replace(/\.[^.]+$/, '')); }} className="block w-full text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-700 file:px-4 file:py-2 file:text-white" /><p className="text-xs text-gray-400 mt-2">Up to 20 MB. Preview PDF, DOCX, images and text/CSV files.</p></div>
                <div><label htmlFor="stationary-name" className="block text-sm text-gray-300 mb-2">Document name</label><input id="stationary-name" required maxLength={160} value={name} disabled={uploading} onChange={event => setName(event.target.value)} className="modern-input" /></div>
                <div><label htmlFor="stationary-description" className="block text-sm text-gray-300 mb-2">Description</label><textarea id="stationary-description" maxLength={1000} rows={3} value={description} disabled={uploading} onChange={event => setDescription(event.target.value)} className="modern-input" /></div>
                {uploadError && <p role="alert" className="text-sm text-red-300">{uploadError}</p>}
                <div className="flex justify-end gap-3"><button type="button" disabled={uploading} onClick={() => setUploadOpen(false)} className="px-4 py-2 text-gray-300 hover:text-white">Cancel</button><button type="submit" disabled={!file || !name.trim() || uploading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50">{uploading ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} />}{uploading ? 'Saving…' : 'Upload'}</button></div>
            </form>
        </Modal>
    </div>;
};
export default StationariesPage;
