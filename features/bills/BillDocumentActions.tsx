import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, Printer } from 'lucide-react';
import { Bill } from '../../types';
import { BillFormat, billDocumentPages, downloadBill } from '../../services/billDocument';
import { useNotification } from '../../context/NotificationContext';

export default function BillDocumentActions({ bill, receipt = false }: { bill: Bill; receipt?: boolean }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const { addNotification } = useNotification();
    useEffect(() => {
        const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, []);
    const download = async (format: BillFormat) => {
        setOpen(false); setBusy(true);
        try { await downloadBill(bill, format, receipt); }
        catch (error) { console.error(error); addNotification('Could not download the document. Please try again.', 'error'); }
        finally { setBusy(false); }
    };
    const print = () => {
        const popup = window.open('', '_blank', 'width=900,height=800');
        if (!popup) { addNotification('Allow pop-ups to print this document.', 'error'); return; }
        popup.onload = () => { popup.focus(); popup.print(); };
        popup.document.write(`<!doctype html><html><head><title>${receipt ? 'Receipt' : 'Invoice'}</title><style>@page{size:A4;margin:0}body{margin:0}svg{display:block;width:210mm;height:297mm;break-after:page}svg:last-child{break-after:auto}</style></head><body>${billDocumentPages(bill, receipt, new URL('/maranathalogo.png', window.location.origin).href).join('')}</body></html>`);
        popup.document.close();
    };
    return <div ref={root} className="relative flex gap-2 no-print" onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLButtonElement>('[aria-expanded]')?.focus(); } }}>
        <button onClick={print} className="flex items-center gap-2 rounded-md bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"><Printer size={16} />Print A4</button>
        <button onClick={() => setOpen(!open)} disabled={busy} aria-expanded={open} className="flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-white hover:bg-sky-700 disabled:opacity-50"><Download size={16} />{busy ? 'Downloading…' : 'Download'}<ChevronDown size={16} /></button>
        {open && <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-gray-600 bg-gray-800 p-1 shadow-xl">
            {([['image', 'Image (.png)'], ['pdf', 'PDF (.pdf)'], ['word', 'Word (.docx)']] as const).map(([format, label]) => <button key={format} onClick={() => download(format)} className="block w-full rounded px-4 py-3 text-left text-sm text-white hover:bg-gray-700 focus:bg-gray-700">{label}</button>)}
        </div>}
    </div>;
}
