import { reportCellText } from './reportFormatting';

export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;
const LEFT = 40;
const TABLE_WIDTH = A4_WIDTH - LEFT * 2;
const CONTENT_TOP = 294;
const CONTENT_BOTTOM = 1040;
const LINE_HEIGHT = 17;

export interface ReportDocumentData {
    title: string;
    period: string;
    generatedAt: string;
    summary: Record<string, number | string>;
    tables: { title: string; columns: { header: string; accessor: string }[]; data: Record<string, unknown>[] }[];
}
export interface A4ReportPage { body: string; }
export type TextMeasure = (text: string, size: number, bold?: boolean) => number;

export const escapeReportText = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!));

let measureContext: CanvasRenderingContext2D | null = null;
export const measureReportText: TextMeasure = (text, size, bold = false) => {
    measureContext ||= document.createElement('canvas').getContext('2d');
    if (!measureContext) return text.length * size * 0.55;
    measureContext.font = `${bold ? 'bold ' : ''}${size}px Arial`;
    return measureContext.measureText(text).width;
};

function wrapText(text: string, width: number, measure: TextMeasure, size = 12, bold = false) {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
        let line = '';
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            if (line && measure(`${line} ${word}`, size, bold) > width) { lines.push(line); line = ''; }
            // Break long identifiers rather than allowing them to cross cell borders.
            for (const character of word) {
                if (measure(line ? `${line}${character}` : character, size, bold) > width && line) { lines.push(line); line = ''; }
                line += character;
            }
            line += ' ';
        }
        lines.push(line.trimEnd());
    }
    return lines.length ? lines : [''];
}

function svgText(text: string, x: number, y: number, size = 12, color = '#24324b', bold = false, anchor = 'start') {
    return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${bold ? 700 : 400}" text-anchor="${anchor}">${escapeReportText(text)}</text>`;
}

/** One page model drives the sidebar, print, PNG, PDF, and Word exports. */
export function paginateReport(report: ReportDocumentData, measure: TextMeasure = (text, size) => text.length * size * 0.55): A4ReportPage[] {
    const sections = [];
    if (Object.keys(report.summary).length) sections.push({
        title: 'Summary',
        columns: [{ header: 'Description', accessor: 'description' }, { header: 'Value', accessor: 'value' }],
        data: Object.entries(report.summary).map(([key, value]) => ({ description: key, value: reportCellText(value, key) })),
    });
    sections.push(...report.tables);
    const count = sections.reduce((total, section) => total + Math.max(1, section.data.length), 0);
    const minimumHeight = count <= 4 ? 96 : count <= 8 ? 64 : count <= 16 ? 48 : 30;
    const pages: A4ReportPage[] = [{ body: '' }];
    let y = CONTENT_TOP;
    const append = (svg: string) => { pages[pages.length - 1].body += svg; };
    const newPage = () => { pages.push({ body: '' }); y = CONTENT_TOP; };
    for (const section of sections) {
        if (!section.columns.length) continue;
        const weights: number[] = section.columns.map(column => /name|description|item/i.test(column.header) ? 2 : /date|phone|hospital/i.test(column.header) ? 1.4 : 1);
        if (section.columns.length === 2 && section.columns[0].accessor === 'description') weights[0] = 3;
        const totalWeight = weights.reduce((total, weight) => total + weight, 0);
        const widths = weights.map(weight => TABLE_WIDTH * weight / totalWeight);
        const headings = section.columns.map((column, index) => wrapText(column.header, widths[index] - 20, measure, 11, true));
        const headerHeight = Math.max(36, Math.max(...headings.map(lines => lines.length)) * LINE_HEIGHT + 18);
        const startTable = (continued = false) => {
            if (section.title) { append(svgText(`${section.title}${continued ? ' (continued)' : ''}`, LEFT, y + 15, 14, '#283f8f', true)); y += 28; }
            let x = LEFT;
            headings.forEach((lines, index) => {
                append(`<rect x="${x}" y="${y}" width="${widths[index]}" height="${headerHeight}" fill="#304795" stroke="#304795"/>`);
                lines.forEach((line, lineIndex) => append(svgText(line, x + 10, y + 20 + lineIndex * LINE_HEIGHT, 11, '#ffffff', true)));
                x += widths[index];
            });
            y += headerHeight;
        };
        if (y + headerHeight + minimumHeight + 28 > CONTENT_BOTTOM) newPage();
        startTable();
        const rows = section.data.length ? section.data : [{ [section.columns[0].accessor]: 'No records found for this report.' }];
        rows.forEach((row, rowIndex) => {
            const cells = section.columns.map((column, index) => wrapText(reportCellText(row[column.accessor], column.header, column.accessor), widths[index] - 20, measure));
            const maximumLines = Math.max(...cells.map(lines => lines.length));
            const chunkSize = Math.max(1, Math.floor((CONTENT_BOTTOM - CONTENT_TOP - headerHeight - 56) / LINE_HEIGHT));
            for (let offset = 0; offset < maximumLines; offset += chunkSize) {
                const chunk = cells.map(lines => lines.slice(offset, offset + chunkSize));
                const lineCount = Math.max(...chunk.map(lines => lines.length));
                const height = Math.max(minimumHeight, lineCount * LINE_HEIGHT + 24);
                if (y + height > CONTENT_BOTTOM) { newPage(); startTable(true); }
                let x = LEFT;
                chunk.forEach((lines, index) => {
                    append(`<rect x="${x}" y="${y}" width="${widths[index]}" height="${height}" fill="${rowIndex % 2 ? '#f2f5fb' : '#ffffff'}" stroke="#ccd4e2" stroke-width="1"/>`);
                    const baseline = y + (height - lines.length * LINE_HEIGHT) / 2 + 13;
                    lines.forEach((line, lineIndex) => append(svgText(line, x + 10, baseline + lineIndex * LINE_HEIGHT)));
                    x += widths[index];
                });
                y += height;
            }
        });
        y += 24;
    }
    return pages;
}

export function renderReportPage(report: ReportDocumentData, page: A4ReportPage, index: number, total: number, logo: string) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${A4_WIDTH}" height="${A4_HEIGHT}" viewBox="0 0 ${A4_WIDTH} ${A4_HEIGHT}" role="img" aria-label="${escapeReportText(report.title)} — page ${index + 1}" font-family="Arial, sans-serif">
        <defs>
            <linearGradient id="brand-blue"><stop stop-color="#504797"/><stop offset="0.55" stop-color="#304b9e"/><stop offset="1" stop-color="#00518a"/></linearGradient>
            <linearGradient id="brand-purple"><stop stop-color="#5f48b1"/><stop offset="1" stop-color="#bba9d4"/></linearGradient>
        </defs>
        <rect width="794" height="1123" fill="#ffffff"/>
        <path d="M24 24H770V61H457C356 61 332 154 191 154H24Z" fill="url(#brand-blue)"/>
        <path d="M181 144C302 144 325 62 444 53C331 67 309 155 186 164H24V159H184Z" fill="#ffffff"/>
        <path d="M24 164H186C313 155 333 75 440 60" fill="none" stroke="#8992bd" stroke-width="2"/>
        <rect x="43" y="44" width="49" height="49" rx="9" fill="#ffffff"/>
        <image href="${escapeReportText(logo)}" x="48" y="49" width="39" height="39" preserveAspectRatio="xMidYMid meet"/>
        ${svgText('MARANATHA-SAPPHIRE', 105, 63, 18, '#ffffff', true)}
        ${svgText('HOSPITAL MANAGEMENT SYSTEM', 105, 82, 9, '#e8e9ff')}
        ${svgText('MASVINGO, ZIMBABWE', 746, 88, 11, '#20345a', true, 'end')}
        <rect x="386" y="111" width="384" height="25" rx="12" fill="url(#brand-purple)"/>
        <rect x="419" y="111" width="39" height="25" rx="12" fill="#504098"/>
        <rect x="468" y="111" width="30" height="25" rx="12" fill="#9280c3"/>
        <rect x="758" y="111" width="12" height="25" fill="#bba9d4"/>
        <rect x="24" y="169" width="746" height="6" fill="#edf0f6"/>
        ${svgText(report.title, LEFT, 214, 21, '#1d2c49', true)}
        ${svgText(`Date range: ${report.period}`, LEFT, 243, 11, '#59677c')}
        ${svgText(`Generated: ${report.generatedAt}`, LEFT, 261, 11, '#59677c')}
        <line x1="40" y1="278" x2="754" y2="278" stroke="#d5dcea"/>
        ${page.body}
        <line x1="40" y1="1071" x2="754" y2="1071" stroke="#d5dcea"/>
        ${svgText('Confidential · Maranatha-Sapphire Hospital', LEFT, 1091, 10, '#68758c')}
        ${svgText(`Page ${index + 1} of ${total}`, 754, 1091, 10, '#68758c', false, 'end')}
    </svg>`;
}

let logoPromise: Promise<string> | undefined;
export function loadReportLogo(): Promise<string> {
    if (!logoPromise) logoPromise = fetch('/maranathalogo.png').then(response => {
        if (!response.ok) throw new Error('Could not load hospital logo');
        return response.blob();
    }).then(blob => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read hospital logo'));
        reader.readAsDataURL(blob);
    })).catch(error => { logoPromise = undefined; throw error; });
    return logoPromise;
}

export async function reportPageCanvas(svg: string): Promise<HTMLCanvasElement> {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = A4_WIDTH * 2;
        canvas.height = A4_HEIGHT * 2;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Image export unavailable');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas;
    } finally { URL.revokeObjectURL(url); }
}
