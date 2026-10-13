import DOMPurify from 'dompurify';
import { loadReportLogo } from './reportA4';

const WIDTH = 794;
const HEIGHT = 1123;
const CONTENT_HEIGHT = 973;

// Prefer whitespace between rows/paragraphs; oversized records still make progress.
export function patientReportPageEnds(height: number, blocks: { top: number; bottom: number }[], pageHeight = CONTENT_HEIGHT): number[] {
    const ends: number[] = [];
    let start = 0;
    while (start < height) {
        let end = Math.min(start + pageHeight, height);
        if (end < height) {
            let previous: number;
            do {
                previous = end;
                for (const block of blocks) {
                    if (block.top > start && block.top < end && block.bottom > end) end = block.top;
                }
            } while (previous !== end);
        }
        ends.push(end);
        start = end;
    }
    return ends;
}

/** The exact same A4 page images drive the PDF and browser print preview. */
export async function exportPatientReport(body: string, styles: string, filename: string, preview: Window | null) {
    const [{ default: html2canvas }, { jsPDF }, logo] = await Promise.all([
        import('html2canvas'), import('jspdf'), loadReportLogo(),
    ]);
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${WIDTH}px;height:${HEIGHT}px;border:0;`;
    await new Promise<void>(resolve => {
        frame.onload = () => resolve();
        frame.srcdoc = '<!doctype html><html><body></body></html>';
        document.body.appendChild(frame);
    });
    try {
        const doc = frame.contentDocument!;
        doc.open();
        doc.write(`<!doctype html><html><head><style>${styles}
            body { margin:0; } .container { width:714px; padding:0; }
            .pdf-page { width:794px;height:1123px;background:#fff;position:relative;overflow:hidden; }
            .running-header { position:absolute;top:28px;left:40px;right:40px;border-bottom:1px solid #dbe2ef;padding-bottom:10px;font:10px Arial;color:#53627b; }
            .viewport { position:absolute;top:70px;left:40px;width:714px;overflow:hidden; }
            .page-footer { position:absolute;bottom:28px;left:40px;right:40px;border-top:1px solid #dbe2ef;padding-top:12px;font:10px Arial;color:#64748b;display:flex;justify-content:space-between; }
        </style></head><body>${DOMPurify.sanitize(body)}</body></html>`);
        doc.close();
        const source = doc.querySelector<HTMLElement>('.container')!;
        source.querySelectorAll('img').forEach(image => { image.src = logo; });
        await Promise.all(Array.from(source.querySelectorAll('img')).map(image => image.decode()));
        await doc.fonts.ready;
        const origin = source.getBoundingClientRect().top;
        const blocks = Array.from(source.querySelectorAll('.note, tr, p, h1, h2, h3')).map(element => {
            const rect = element.getBoundingClientRect();
            // Keep section headings with the next row or paragraph.
            const next = /^H[123]$/.test(element.tagName) ? element.nextElementSibling : null;
            const first = next?.matches('table') ? next.querySelector('tr') : next;
            return { top: Math.floor(rect.top - origin), bottom: Math.ceil((first?.getBoundingClientRect().bottom || rect.bottom) - origin) };
        });
        const ends = patientReportPageEnds(Math.ceil(source.getBoundingClientRect().height), blocks);
        const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
        pdf.setProperties({ title: 'Confidential Patient Report', author: 'Maranatha-Sapphire Hospital' });
        const pages: string[] = [];
        let start = 0;
        for (const [index, end] of ends.entries()) {
            const page = doc.createElement('div');
            page.className = 'pdf-page';
            page.innerHTML = `<div class="running-header">MARANATHA-SAPPHIRE HOSPITAL · CONFIDENTIAL PATIENT REPORT</div><div class="viewport" style="height:${end - start}px"></div><div class="page-footer"><span>Confidential · Maranatha-Sapphire Hospital</span><span>Page ${index + 1} of ${ends.length}</span></div>`;
            const content = source.cloneNode(true) as HTMLElement;
            content.style.cssText = `position:relative;top:-${start}px;`;
            page.querySelector('.viewport')!.appendChild(content);
            doc.body.appendChild(page);
            const canvas = await html2canvas(page, { scale: 2, backgroundColor: '#fff', logging: false });
            const image = canvas.toDataURL('image/png');
            pages.push(image);
            if (index) pdf.addPage();
            pdf.addImage(image, 'PNG', 0, 0, 210, 297);
            canvas.width = 0; canvas.height = 0;
            page.remove();
            start = end;
        }
        pdf.save(`${filename.replace(/[^a-z0-9_-]/gi, '_')}.pdf`);
        if (preview && !preview.closed) {
            preview.document.open();
            preview.document.write(`<!doctype html><html><head><title>Maranatha-Sapphire Patient Report</title><style>
                @page { size:A4; margin:0; } body { margin:0;background:#e2e8f0; }
                img { display:block;width:210mm;height:297mm;margin:16px auto; }
                @media print { body { background:white; } img { margin:0;break-after:page; } img:last-child { break-after:auto; } }
            </style></head><body>${pages.map(page => `<img src="${page}" alt="Patient report page">`).join('')}</body></html>`);
            preview.document.close();
            await Promise.all(Array.from(preview.document.images).map(image => image.decode()));
            preview.focus();
            preview.print();
        }
    } finally { frame.remove(); }
}
