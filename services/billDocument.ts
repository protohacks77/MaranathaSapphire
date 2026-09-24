import { Bill } from '../types';
import { escapeReportText as escape, loadReportLogo, reportPageCanvas } from './reportA4';

export type BillFormat = 'image' | 'pdf' | 'word';
const money = (value: number) => `$${value.toFixed(2)}`;
const text = (value: string, x: number, y: number, size = 12, bold = false, color = '#334155', anchor = 'start') => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${bold ? 700 : 400}" fill="${color}" text-anchor="${anchor}">${escape(value)}</text>`;

export function billDocumentPages(bill: Bill, receipt = false, logo = '/maranathalogo.png'): string[] {
    const pages: string[] = [];
    let body = '', y = 330;
    const finish = () => { pages.push(body); body = ''; y = 330; };
    for (const item of bill.items) {
        // Wrap even long unbroken descriptions, and continue oversized items across pages.
        const lines = item.description.replace(/\s+/g, ' ').match(/.{1,53}(?:\s|$)|.{1,53}/g) || [''];
        for (let offset = 0; offset < lines.length;) {
            if (y + 44 > 900) finish();
            const count = Math.min(lines.length - offset, Math.floor((900 - y - 24) / 18));
            const height = Math.max(44, count * 18 + 24);
            body += `<rect x="40" y="${y}" width="714" height="${height}" fill="#f8fafc"/><path d="M40 ${y + height}H754" stroke="#e2e8f0"/>`;
            lines.slice(offset, offset + count).forEach((line, index) => { body += text(line.trim(), 54, y + 25 + index * 18); });
            if (!offset) body += text(String(item.quantity), 510, y + 25, 12, false, '#334155', 'middle') + text(money(item.unitPrice), 630, y + 25, 12, false, '#334155', 'end') + text(money(item.totalPrice), 740, y + 25, 12, true, '#0f172a', 'end');
            y += height;
            offset += count;
        }
    }
    if (y + 150 > 1010) finish();
    y += 28;
    body += text('Subtotal', 470, y, 13) + text(money(bill.totalBill), 740, y, 13, true, '#0f172a', 'end');
    body += text('Amount paid', 470, y + 29, 13) + text(money(bill.amountPaidAtTimeOfBill), 740, y + 29, 13, true, '#15803d', 'end');
    body += `<rect x="450" y="${y + 46}" width="304" height="54" rx="6" fill="#eef2ff"/>` + text('Balance due', 470, y + 79, 16, true, '#3730a3') + text(money(bill.balance), 740, y + 79, 19, true, '#3730a3', 'end');
    finish();
    return pages.map((content, index) => `<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123" font-family="Arial, sans-serif" role="img" aria-label="${receipt ? 'Receipt' : 'Invoice'} page ${index + 1}">
        <rect width="794" height="1123" fill="white"/><rect width="794" height="10" fill="#4338ca"/>
        <image href="${escape(logo)}" x="40" y="40" width="64" height="64"/>
        ${text('MARANATHA-SAPPHIRE', 118, 66, 20, true, '#0f172a')}${text('Patient accounts', 118, 89, 12)}
        ${text(receipt ? 'RECEIPT' : 'INVOICE', 754, 137, 32, true, '#312e81', 'end')}
        ${text(bill.status === 'Unpaid' ? 'On Credit' : bill.status, 754, 161, 12, true, '#475569', 'end')}
        <path d="M40 181H754" stroke="#cbd5e1"/>
        ${text('BILL TO', 40, 211, 10, true, '#64748b')}${text(bill.patientName, 40, 236, 16, true, '#0f172a')}
        ${text(`Hospital number: ${bill.patientHospitalNumber}`, 40, 257)}
        ${text(`Date: ${new Date(bill.date).toLocaleDateString('en-GB')}`, 754, 211, 12, false, '#334155', 'end')}
        ${text(`Invoice: ${bill.id}`, 754, 234, 10, false, '#334155', 'end')}
        ${text(`Payment method: ${bill.paymentMethod || '—'}`, 754, 257, 11, false, '#334155', 'end')}
        <rect x="40" y="293" width="714" height="37" rx="4" fill="#312e81"/>
        ${text('DESCRIPTION', 54, 317, 10, true, 'white')}${text('QTY', 510, 317, 10, true, 'white', 'middle')}${text('UNIT PRICE', 630, 317, 10, true, 'white', 'end')}${text('AMOUNT', 740, 317, 10, true, 'white', 'end')}
        ${content}<path d="M40 1040H754" stroke="#cbd5e1"/>
        ${text('Thank you for choosing Maranatha-Sapphire.', 40, 1064, 11)}${text('Please make payments to the accounts office.', 40, 1083, 10, false, '#64748b')}
        ${text(`Page ${index + 1} of ${pages.length}`, 754, 1083, 10, false, '#64748b', 'end')}
    </svg>`);
}

function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadBill(bill: Bill, format: BillFormat, receipt: boolean) {
    const pages = billDocumentPages(bill, receipt, await loadReportLogo());
    const images: Uint8Array[] = [];
    for (const page of pages) {
        const canvas = await reportPageCanvas(page);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image export failed')), 'image/png'));
        images.push(new Uint8Array(await blob.arrayBuffer()));
        canvas.width = 0; canvas.height = 0;
    }
    const name = `${receipt ? 'receipt' : 'invoice'}-${bill.patientHospitalNumber}-${bill.id}`.replace(/[^a-z0-9_-]/gi, '-');
    if (format === 'image') {
        if (images.length === 1) save(new Blob([new Uint8Array(images[0])], { type: 'image/png' }), `${name}.png`);
        else {
            const { zipSync } = await import('fflate');
            save(new Blob([new Uint8Array(zipSync(Object.fromEntries(images.map((image, i) => [`${name}-${i + 1}.png`, image])), { level: 0 }))], { type: 'application/zip' }), `${name}-images.zip`);
        }
    } else if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
        images.forEach((image, index) => { if (index) pdf.addPage(); pdf.addImage(image, 'PNG', 0, 0, 210, 297); });
        pdf.save(`${name}.pdf`);
    } else {
        const { Document, Packer, Paragraph, ImageRun, SectionType } = await import('docx');
        const document = new Document({ sections: images.map(image => ({
            properties: { type: SectionType.NEXT_PAGE, page: { size: { width: 11906, height: 16838 }, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
            children: [new Paragraph({ children: [new ImageRun({ type: 'png', data: image, transformation: { width: 793.7, height: 1122.5 }, floating: { horizontalPosition: { relative: 'page', offset: 0 }, verticalPosition: { relative: 'page', offset: 0 } } })] })],
        })) });
        save(await Packer.toBlob(document), `${name}.docx`);
    }
}
