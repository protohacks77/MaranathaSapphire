import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import LoadingSpinner from '../../components/utils/LoadingSpinner';
import { StationaryDocument, stationaryPreviewKind, resolveStationaryPreviewKind } from '../../services/stationaries';

export interface StationaryPreviewHandle { print: () => void }
interface Props { document: StationaryDocument; blob: Blob; onReady: (ready: boolean) => void }

const StationaryPreview = forwardRef<StationaryPreviewHandle, Props>(({ document, blob, onReady }, ref) => {
    const [kind, setKind] = useState(() => stationaryPreviewKind(document));
    const container = useRef<HTMLDivElement>(null);
    const wordFrame = useRef<HTMLIFrameElement>(null);
    const [wordHtml, setWordHtml] = useState('');
    const [text, setText] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useImperativeHandle(ref, () => ({ print: () => {
        if (kind === 'docx') {
            const wrapper = wordFrame.current?.contentDocument?.querySelector<HTMLElement>('.docx-wrapper');
            const zoom = wrapper?.style.zoom;
            if (wrapper) wrapper.style.zoom = '1';
            wordFrame.current?.contentWindow?.focus();
            wordFrame.current?.contentWindow?.print();
            if (wrapper) wrapper.style.zoom = zoom || '';
        } else window.print();
    } }), [kind]);

    useEffect(() => {
        let cancelled = false;
        let destroy: (() => void) | undefined;
        let image = '';
        setError(''); setLoading(true); setWordHtml(''); setText(''); onReady(false);
        container.current?.replaceChildren();
        async function render() {
            const kind = await resolveStationaryPreviewKind(document, blob);
            if (cancelled) return;
            setKind(kind);
            if (kind === 'pdf') {
                const pdfjs = await import('pdfjs-dist');
                pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
                if (cancelled) return;
                const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false,
                    cMapUrl: '/pdf-assets/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdf-assets/standard_fonts/', wasmUrl: '/pdf-assets/wasm/' });
                destroy = () => { void task.destroy(); };
                const pdf = await task.promise;
                for (let number = 1; number <= pdf.numPages; number++) {
                    if (cancelled) return;
                    const page = await pdf.getPage(number);
                    const viewport = page.getViewport({ scale: 1.4 });
                    const canvas = window.document.createElement('canvas');
                    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
                    canvas.setAttribute('aria-label', `Page ${number} of ${pdf.numPages}`);
                    const paper = window.document.createElement('div');
                    paper.className = 'stationary-pdf-page';
                    paper.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
                    paper.append(canvas);
                    container.current?.append(paper);
                    await page.render({ canvas, viewport }).promise;
                    page.cleanup();
                }
            } else if (kind === 'docx') {
                const { renderAsync } = await import('docx-preview');
                if (cancelled) return;
                const body = window.document.createElement('div');
                await renderAsync(await blob.arrayBuffer(), body, undefined, {
                    breakPages: true, ignoreLastRenderedPageBreak: false, renderHeaders: true,
                    renderFooters: true, renderFootnotes: true, renderEndnotes: true,
                    useBase64URL: true, inWrapper: true,
                });
                if (cancelled) return;
                // The sandbox also prevents embedded scripts from executing. Keep
                // document styles, tables, headers and embedded pictures intact.
                const safe = DOMPurify.sanitize(body.innerHTML, { ADD_TAGS: ['style'], FORBID_TAGS: ['script', 'object', 'embed', 'iframe', 'form'], FORBID_ATTR: ['srcset'] });
                setWordHtml(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#28303e} .docx-wrapper{padding:16px!important;transform-origin:top left} .docx-wrapper>section{margin-bottom:16px!important} @media print{html,body{background:white}.docx-wrapper{padding:0!important;zoom:1!important}.docx-wrapper>section{margin:0!important;box-shadow:none!important;break-after:page}.docx-wrapper>section:last-child{break-after:auto}}</style></head><body>${safe}</body></html>`);
                // iframe onLoad confirms fonts/images and print access are ready.
                return;
            } else if (kind === 'image') {
                image = URL.createObjectURL(blob); setImageUrl(image);
                return;
            } else if (kind === 'text') {
                const contents = await blob.text();
                if (!cancelled) setText(contents);
            }
            if (!cancelled) { setLoading(false); onReady(kind !== 'unsupported'); }
        }
        void render().catch(failure => {
            if (!cancelled) { setError(`Could not display this file: ${failure.message || 'The document may be damaged or password protected.'}`); setLoading(false); onReady(false); }
        });
        return () => { cancelled = true; destroy?.(); if (image) URL.revokeObjectURL(image); };
    }, [blob, document.id, document.version, onReady]);

    function fitWord() {
        const frame = wordFrame.current;
        const wrapper = frame?.contentDocument?.querySelector<HTMLElement>('.docx-wrapper');
        const pages = frame?.contentDocument?.querySelectorAll<HTMLElement>('section.docx');
        if (!frame || !wrapper || !pages?.length) return;
        const pageWidth = Math.max(...Array.from(pages, page => page.offsetWidth)) + 32;
        wrapper.style.zoom = String(Math.min(1, (frame.clientWidth - 12) / pageWidth));
    }
    useEffect(() => {
        const frame = wordFrame.current;
        if (!frame || !wordHtml) return;
        const observer = new ResizeObserver(fitWord);
        observer.observe(frame);
        return () => observer.disconnect();
    }, [wordHtml]);

    return <div className="stationary-document">
        {loading && <div className="stationary-preview-loading no-print"><LoadingSpinner /><p className="text-sm text-gray-300">Preparing document…</p></div>}
        {error && <p role="alert" className="p-6 text-sm text-red-300 no-print">{error} You can still download the original file.</p>}
        {kind === 'pdf' && <div ref={container} className="stationary-pdf-pages" />}
        {kind === 'docx' && wordHtml && <iframe ref={wordFrame} srcDoc={wordHtml} title={`${document.name} Word document`} sandbox="allow-same-origin allow-modals" className="stationary-word-frame" onLoad={() => { fitWord(); setLoading(false); onReady(true); }} />}
        {kind === 'image' && imageUrl && <img className="stationary-image" src={imageUrl} alt={document.name} onLoad={() => { setLoading(false); onReady(true); }} onError={() => { setError('This image could not be displayed.'); setLoading(false); }} />}
        {kind === 'text' && !loading && <pre className="stationary-text">{text}</pre>}
        {kind === 'unsupported' && !loading && <div className="p-8 text-gray-300 text-sm no-print"><p>This file type does not support a browser preview.</p><p className="mt-2">For Word files, upload DOCX, DOCM or DOTX. Older DOC files need to be saved as DOCX first.</p></div>}
    </div>;
});
StationaryPreview.displayName = 'StationaryPreview';
export default StationaryPreview;
