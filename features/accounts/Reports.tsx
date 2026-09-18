import { useOfflineView } from '../../services/useOfflineView';
import { reportPreviews } from '../../services/reportPreviews';
import { dateQuery } from '../../services/lowReadQueries';
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { db } from '../../services/firebase';
import { Bill, Payment, Patient, InventoryItem } from '../../types';
import { useNotification } from '../../context/NotificationContext';
import './reports.css';
import { firestoreReadError } from '../../services/firestoreReadError';
import { financialReportSummary, reportCellText } from '../../services/reportFormatting';
import { A4_WIDTH, A4_HEIGHT, paginateReport, renderReportPage, measureReportText, loadReportLogo, reportPageCanvas } from '../../services/reportA4';
import { BarChart as BarChartIcon, FileText, ImageIcon, Users, BedDouble, UserCheck, CreditCard, AlertTriangle, UserRoundCheck, ShoppingCart, Package, Printer, Download, ChevronDown, X, Loader2 } from 'lucide-react';
import firebase from 'firebase/compat/app';

type ReportType = 'financial_summary' | 'debtors' | 'top_selling_items' | 'paid_invoices' | 'partially_paid_invoices' | 'admissions' | 'patients_served' | 'patient_census' | 'stock_report';
type DatePreset = 'today' | 'week' | 'month' | 'year' | 'custom';

interface ReportTable {
  title: string;
  data: any[];
  columns: { header: string; accessor: string; }[];
}

interface GeneratedReport {
  title: string;
  tables: ReportTable[];
  summary: Record<string, number | string>;
  type: ReportType;
  period: string;
  generatedAt: string;
}

const reportTypesConfig: { key: ReportType; title: string; description: string; icon: React.ReactNode; needsDate: boolean }[] = [
    { key: 'financial_summary', title: 'Financial Summary', description: 'High-level overview of sales, payments, and outstanding balances.', icon: <BarChartIcon />, needsDate: true },
    { key: 'patient_census', title: 'Patient Census', description: 'A real-time snapshot of patient counts and a full patient list.', icon: <Users />, needsDate: false },
    { key: 'stock_report', title: 'Stock Report', description: 'Comprehensive overview of inventory levels, usage, and new additions.', icon: <Package />, needsDate: true },
    { key: 'top_selling_items', title: 'Top Selling Items', description: 'Top 20 most frequently billed services and products.', icon: <ShoppingCart />, needsDate: true },
    { key: 'admissions', title: 'Admissions Report', description: 'All patients admitted within the selected period.', icon: <BedDouble />, needsDate: true },
    { key: 'debtors', title: 'Unpaid Patients', description: 'Lists all patients with an outstanding balance.', icon: <AlertTriangle />, needsDate: false },
    { key: 'paid_invoices', title: 'Paid Invoices', description: 'All fully paid invoices within the selected period.', icon: <UserCheck />, needsDate: true },
    { key: 'partially_paid_invoices', title: 'Partial Payments', description: 'All partially paid invoices from the selected period.', icon: <CreditCard />, needsDate: true },
    { key: 'patients_served', title: 'Patients Served', description: 'Unique patients who received any billable service.', icon: <UserRoundCheck />, needsDate: true },
];

const ReportDocument: React.FC<{ report: GeneratedReport }> = ({ report }) => {
    const [logo, setLogo] = useState('/maranathalogo.png');
    const pages = useMemo(() => paginateReport(report, measureReportText), [report]);
    useEffect(() => {
        let cancelled = false;
        loadReportLogo().then(value => { if (!cancelled) setLogo(value); }).catch(console.error);
        return () => { cancelled = true; };
    }, []);
    return <div className="report-output" aria-label={`${report.title} A4 document`}>
        {pages.map((page, index) => <div key={index} className="report-a4-page" dangerouslySetInnerHTML={{ __html: renderReportPage(report, page, index, pages.length, logo) }} />)}
    </div>;
};

const ReportPreview: React.FC<{ reportKey: ReportType; data: any; onRetry: () => void }> = ({ reportKey, data, onRetry }) => {
    if (data?.error) return <div className="text-sm text-gray-400"><p role="alert">{data.error}</p><button onClick={onRetry} className="mt-2 text-sky-400 hover:underline">Retry</button></div>;
    if (!data || (Array.isArray(data) && !data.length)) return <p className="text-sm text-gray-400">No records for this period.</p>;
    if (!Array.isArray(data)) return <dl className="w-full space-y-3 text-sm">
        {Object.entries(data).map(([key, value]) => <div key={key} className="flex items-baseline justify-between gap-3 border-b border-gray-700 pb-2"><dt className="text-gray-400">{key}</dt><dd className="font-semibold text-white">{reportCellText(value, key)}</dd></div>)}
    </dl>;
    const columns: Partial<Record<ReportType, { header: string; accessor: string }[]>> = {
        debtors: [{ header: 'Patient', accessor: 'name' }, { header: 'Balance', accessor: 'balance' }],
        paid_invoices: [{ header: 'Patient', accessor: 'patientName' }, { header: 'Total', accessor: 'total' }],
        partially_paid_invoices: [{ header: 'Patient', accessor: 'patientName' }, { header: 'Balance', accessor: 'balance' }],
        admissions: [{ header: 'Patient', accessor: 'name' }, { header: 'Date', accessor: 'registrationDate' }],
        top_selling_items: [{ header: 'Item', accessor: 'name' }, { header: 'Billed', accessor: 'quantity' }],
    };
    const fields = columns[reportKey] || [];
    return <div className="w-full overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{fields.map(column => <th key={column.accessor} className="border-b border-gray-700 py-2 text-gray-400">{column.header}</th>)}</tr></thead><tbody>{data.slice(0, 4).map((row, index) => <tr key={index}>{fields.map(column => <td key={column.accessor} className="border-b border-gray-800 py-2 text-gray-300">{reportCellText(row[column.accessor], column.header, column.accessor)}</td>)}</tr>)}</tbody></table></div>;
};

const Reports: React.FC = () => {
    const [datePreset, setDatePreset] = useState<DatePreset>('month');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [generatingReportType, setGeneratingReportType] = useState<ReportType | null>(null);
    const [previewReload, setPreviewReload] = useState(0);
    const generationRequest = useRef(0);
    useEffect(() => () => { generationRequest.current++; }, []);
    const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);

    const [panelOpen, setPanelOpen] = useState(false);
    const [downloadOpen, setDownloadOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [reportError, setReportError] = useState('');
    const downloadMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const dismiss = (event: MouseEvent) => {
            if (!downloadMenuRef.current?.contains(event.target as Node)) setDownloadOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { setDownloadOpen(false); setPanelOpen(false); }
        };
        document.addEventListener('mousedown', dismiss);
        document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', escape); };
    }, []);

    const { addNotification } = useNotification();
    const browserRef = useRef<HTMLElement>(null);
    useEffect(() => {
        const browser = browserRef.current;
        if (!browser || typeof ResizeObserver === 'undefined') return;
        const positions = new Map<HTMLElement, { left: number; top: number; width: number; height: number }>();
        const animations = new Map<HTMLElement, Animation>();
        const observer = new ResizeObserver(() => {
            const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            browser.querySelectorAll<HTMLElement>('.report-card').forEach(card => {
                const next = { left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight };
                const previous = positions.get(card);
                if (!reducedMotion && previous && (Math.abs(previous.left - next.left) > 20 || Math.abs(previous.top - next.top) > 20 || Math.abs(previous.width - next.width) > 20)) {
                    animations.get(card)?.cancel();
                    animations.set(card, card.animate([{ transform: `translate(${previous.left - next.left}px, ${previous.top - next.top}px) scale(${previous.width / next.width}, ${previous.height / next.height})` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }));
                }
                positions.set(card, next);
            });
        });
        observer.observe(browser);
        return () => { observer.disconnect(); animations.forEach(animation => animation.cancel()); };
    }, []);

    const dateRange = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        let start = new Date(now);
        let end = new Date(now);
        end.setHours(23, 59, 59, 999);

        switch (datePreset) {
            case 'today':
                break;
            case 'week':
                start.setDate(now.getDate() - now.getDay());
                break;
            case 'month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'year':
                start = new Date(now.getFullYear(), 0, 1);
                break;
            case 'custom':
                if (!customStartDate || !customEndDate) return null;
                start = new Date(`${customStartDate}T00:00:00`);
                end = new Date(`${customEndDate}T00:00:00`);
                if (start > end || isNaN(start.getTime()) || isNaN(end.getTime())) return null;
                end.setHours(23, 59, 59, 999);
                break;
        }
        return { start, end };
    }, [datePreset, customStartDate, customEndDate]);

    const { data: previewData = {}, loading: previewLoading } = useOfflineView<Record<string, any>>(
        `report-previews:${datePreset}:${dateRange?.start.toISOString()}:${dateRange?.end.toISOString()}:${previewReload}`,
        () => dateRange ? reportPreviews(dateRange) : Promise.resolve({}), 300_000,
    );

    const handleGenerateReport = async (reportType: ReportType) => {
        const request = ++generationRequest.current;
        setGeneratingReportType(reportType);
        setReportError('');
        setDownloadOpen(false);
        
        const nonDateReports: ReportType[] = ['debtors', 'patient_census'];
        if (!dateRange && !nonDateReports.includes(reportType)) {
            addNotification('Please select a valid date range.', 'warning');
            setGeneratingReportType(null);
            return;
        }

        try {
            const empty = { docs: [] };
            const needsBills = [ 'financial_summary', 'stock_report', 'top_selling_items', 'paid_invoices', 'partially_paid_invoices', 'patients_served'].includes(reportType);
            const needsPatients = ['financial_summary', 'patient_census', 'debtors', 'admissions'].includes(reportType);
            const billQuery = dateQuery('bills', 'date', dateRange);
            // Filter invoice status after the date query to avoid composite-index failures.
            let patientQuery: firebase.firestore.Query = db.collection('patients');
            if (reportType === 'debtors') patientQuery = patientQuery.where('financials.balance', '>', 0);
            if (reportType === 'admissions') patientQuery = dateQuery('patients', 'registrationDate', dateRange);
            const [billsSnapshot, paymentsSnapshot, patientsSnapshot, inventorySnapshot] = await Promise.all([
                 needsBills ? billQuery.get() : empty,
                 reportType === 'financial_summary' ? dateQuery('payments', 'date', dateRange).get() : empty,
                 needsPatients ? patientQuery.get() : empty,
                 reportType === 'stock_report' ? db.collection('inventory').get() : empty,
            ]);

            const allBills = billsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Bill));
            const allPayments = paymentsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Payment));
            let allPatients = patientsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Patient));
            if (reportType === 'patients_served') {
                const ids = [...new Set(allBills.map(bill => bill.patientId).filter(Boolean))];
                const pages = await Promise.all(Array.from({ length: Math.ceil(ids.length / 30) }, (_, index) =>
                    db.collection('patients').where(firebase.firestore.FieldPath.documentId(), 'in', ids.slice(index * 30, index * 30 + 30)).get()));
                allPatients = pages.flatMap(page => page.docs.map(doc => ({ ...doc.data(), id: doc.id } as Patient)));
            }
            const allInventory = inventorySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as InventoryItem)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            const billsInRange = dateRange ? allBills.filter(b => new Date(b.date) >= dateRange.start && new Date(b.date) <= dateRange.end) : allBills;
            const paymentsInRange = dateRange ? allPayments.filter(p => new Date(p.date) >= dateRange.start && new Date(p.date) <= dateRange.end) : allPayments;
            
            let report: Omit<GeneratedReport, 'type' | 'period' | 'generatedAt'> | null = null;
            
            switch (reportType) {
                case 'financial_summary':
                    report = { title: 'Financial Summary', tables: [], summary: financialReportSummary(billsInRange, paymentsInRange, allPatients) };
                    break;
                case 'stock_report':
                    const stockLeftData = allInventory.map(item => ({
                        ...item,
                        totalValue: item.quantity * item.unitPrice,
                        isLow: item.quantity <= item.lowStockThreshold
                    }));

                    const dispensedMap: { [name: string]: { name: string, quantity: number, totalValue: number } } = {};
                    billsInRange.forEach(bill => {
                        (bill.items || []).forEach(item => {
                            const inventoryItem = allInventory.find(inv => inv.name === item.description);
                            if (inventoryItem) {
                                if (!dispensedMap[item.description]) {
                                    dispensedMap[item.description] = { name: item.description, quantity: 0, totalValue: 0 };
                                }
                                dispensedMap[item.description].quantity += item.quantity;
                                dispensedMap[item.description].totalValue += item.totalPrice;
                            }
                        });
                    });
                    const stockUsedData = Object.values(dispensedMap).sort((a,b) => b.quantity - a.quantity);
                    const totalUnitsSold = stockUsedData.reduce((sum, item) => sum + item.quantity, 0);
                    const revenueFromStock = stockUsedData.reduce((sum, item) => sum + item.totalValue, 0);

                    const stockInData = allInventory.filter(item => {
                        if (!dateRange || !item.createdAt?.toDate) return false;
                        const createdAtDate = item.createdAt.toDate();
                        return createdAtDate >= dateRange.start && createdAtDate <= dateRange.end;
                    });
            
                    report = {
                        title: 'Comprehensive Stock Report',
                        tables: [
                            {
                                title: 'Current Stock Levels',
                                data: stockLeftData,
                                columns: [
                                    { header: 'Item Name', accessor: 'name' },
                                    { header: 'Category', accessor: 'category' },
                                    { header: 'Qty', accessor: 'quantity' },
                                    { header: 'Unit Price ($)', accessor: 'unitPrice' },
                                    { header: 'Total Value ($)', accessor: 'totalValue' },
                                    { header: 'Status', accessor: 'isLow' }
                                ]
                            },
                            {
                                title: 'Stock Billed',
                                data: stockUsedData,
                                columns: [
                                    { header: 'Item Name', accessor: 'name' },
                                    { header: 'Quantity Billed', accessor: 'quantity' },
                                    { header: 'Total Value ($)', accessor: 'totalValue' },
                                ]
                            },
                            {
                                title: 'New Stock Received',
                                data: stockInData,
                                columns: [
                                    { header: 'Item Name', accessor: 'name' },
                                    { header: 'Category', accessor: 'category' },
                                    { header: 'Quantity Added', accessor: 'quantity' },
                                    { header: 'Date Added', accessor: 'createdAt' }
                                ]
                            }
                        ],
                        summary: {
                            'Stock Received (Units)': stockInData.reduce((sum, item) => sum + item.quantity, 0),
                            'Stock Sold (Units)': totalUnitsSold,
                            'Revenue from Stock ($)': revenueFromStock,
                        }
                    };
                    break;
                case 'debtors':
                    const debtorsData = allPatients
                        .filter(p => (p.financials?.balance || 0) > 0)
                        .map(p => ({
                            ...p,
                            name: `${p.name} ${p.surname}`,
                            balance: (p.financials?.balance || 0)
                        }))
                        .sort((a, b) => b.balance - a.balance);

                    report = {
                        title: 'Unpaid Patients (Debtors) Report',
                        tables: [{
                            title: '',
                            data: debtorsData,
                            columns: [
                                { header: 'Patient Name', accessor: 'name' },
                                { header: 'Hospital No.', accessor: 'hospitalNumber' },
                                { header: 'Phone', accessor: 'phoneNumber' },
                                { header: 'Balance ($)', accessor: 'balance' }
                            ]
                        }],
                        summary: {
                            'Total Outstanding': debtorsData.reduce((sum, p) => sum + p.balance, 0),
                            'Total Debtors': debtorsData.length
                        }
                    };
                    break;
                
                case 'top_selling_items':
                    const itemMap: { [key: string]: { name: string; quantity: number; totalValue: number } } = {};
                    billsInRange.forEach(bill => {
                        (bill.items || []).forEach(item => {
                            if (!itemMap[item.description]) {
                                itemMap[item.description] = { name: item.description, quantity: 0, totalValue: 0 };
                            }
                            itemMap[item.description].quantity += item.quantity;
                            itemMap[item.description].totalValue += item.totalPrice;
                        });
                    });
                    const topItemsData = Object.values(itemMap)
                        .sort((a, b) => b.quantity - a.quantity)
                        .slice(0, 20)
                        .map((item, index) => ({ ...item, rank: index + 1 }));

                    report = {
                        title: 'Top 20 Selling Items',
                        tables: [{
                            title: '',
                            data: topItemsData,
                            columns: [
                                { header: 'Rank', accessor: 'rank' },
                                { header: 'Item Name', accessor: 'name' },
                                { header: 'Quantity Sold', accessor: 'quantity' },
                                { header: 'Total Value ($)', accessor: 'totalValue' },
                            ]
                        }],
                        summary: {
                            'Unique Items Sold': Object.keys(itemMap).length,
                            'Total Items Sold': topItemsData.reduce((sum, item) => sum + item.quantity, 0)
                        }
                    };
                    break;
                case 'paid_invoices':
                    const paidInvoicesData = billsInRange
                        .filter(b => b.status === 'Paid')
                        .map(b => ({
                            patientName: b.patientName,
                            hospitalNumber: b.patientHospitalNumber,
                            date: b.date,
                            total: b.totalBill
                        }));

                    report = {
                        title: 'Fully Paid Invoices Report',
                        tables: [{
                            title: '',
                            data: paidInvoicesData,
                            columns: [
                                { header: 'Patient Name', accessor: 'patientName' },
                                { header: 'Hospital No.', accessor: 'hospitalNumber' },
                                { header: 'Bill Date', accessor: 'date' },
                                { header: 'Total ($)', accessor: 'total' },
                            ]
                        }],
                        summary: {
                            'Total Paid Invoices': paidInvoicesData.length,
                            'Total Value': paidInvoicesData.reduce((sum, item) => sum + item.total, 0)
                        }
                    };
                    break;

                case 'partially_paid_invoices':
                    const partialInvoicesData = billsInRange
                        .filter(b => b.status === 'Partially Paid')
                        .map(b => ({
                            patientName: b.patientName,
                            hospitalNumber: b.patientHospitalNumber,
                            date: b.date,
                            total: b.totalBill,
                            paid: b.amountPaidAtTimeOfBill,
                            balance: b.balance
                        }));
    
                    report = {
                        title: 'Partially Paid Invoices Report',
                        tables: [{
                            title: '',
                            data: partialInvoicesData,
                            columns: [
                                { header: 'Patient Name', accessor: 'patientName' },
                                { header: 'Hospital No.', accessor: 'hospitalNumber' },
                                { header: 'Bill Date', accessor: 'date' },
                                { header: 'Total ($)', accessor: 'total' },
                                { header: 'Paid ($)', accessor: 'paid' },
                                { header: 'Balance ($)', accessor: 'balance' }
                            ]
                        }],
                        summary: {
                            'Total Partial Invoices': partialInvoicesData.length,
                            'Total Outstanding': partialInvoicesData.reduce((sum, item) => sum + item.balance, 0)
                        }
                    };
                    break;
                
                case 'admissions':
                    const admissionsData = allPatients
                        .filter(p => {
                            if (!dateRange) return false;
                            const regDate = new Date(p.registrationDate);
                            return regDate >= dateRange.start && regDate <= dateRange.end;
                        })
                        .map(p => ({
                            name: `${p.name} ${p.surname}`,
                            hospitalNumber: p.hospitalNumber,
                            registrationDate: p.registrationDate,
                            age: p.age,
                            gender: p.gender,
                        }));

                    report = {
                        title: 'Admissions Report',
                        tables: [{
                            title: '',
                            data: admissionsData,
                            columns: [
                                { header: 'Patient Name', accessor: 'name' },
                                { header: 'Hospital No.', accessor: 'hospitalNumber' },
                                { header: 'Admission Date', accessor: 'registrationDate' },
                                { header: 'Age', accessor: 'age' },
                                { header: 'Gender', accessor: 'gender' }
                            ]
                        }],
                        summary: { 'Total Admissions': admissionsData.length }
                    };
                    break;
                
                case 'patients_served':
                    const servedPatientIds = [...new Set(billsInRange.map(b => b.patientId))];
                    const servedPatientsData = allPatients
                        .filter(p => servedPatientIds.includes(p.id!))
                        .map(p => ({
                            name: `${p.name} ${p.surname}`,
                            hospitalNumber: p.hospitalNumber,
                            age: p.age,
                            gender: p.gender,
                        }));
    
                    report = {
                        title: 'Patients Served Report',
                        tables: [{
                            title: '',
                            data: servedPatientsData,
                            columns: [
                                { header: 'Patient Name', accessor: 'name' },
                                { header: 'Hospital No.', accessor: 'hospitalNumber' },
                                { header: 'Age', accessor: 'age' },
                                { header: 'Gender', accessor: 'gender' }
                            ]
                        }],
                        summary: { 'Total Unique Patients Served': servedPatientsData.length }
                    };
                    break;
                
                case 'patient_census':
                    const admittedCount = allPatients.filter(p => p.status === 'Admitted').length;
                    const pendingCount = allPatients.filter(p => p.status === 'PendingDischarge').length;
                    const dischargedCount = allPatients.filter(p => p.status === 'Discharged').length;
                    const censusPatientsData = allPatients.map(p => ({
                        fullName: `${p.name} ${p.surname}`,
                        age: p.age,
                        registrationDate: p.registrationDate
                    })).sort((a,b) => new Date(b.registrationDate).getTime() - new Date(a.registrationDate).getTime());

                    report = {
                        title: 'Patient Census Report',
                        tables: [{
                            title: 'All Registered Patients',
                            data: censusPatientsData,
                            columns: [
                                { header: 'Full Name', accessor: 'fullName' },
                                { header: 'Age', accessor: 'age' },
                                { header: 'Registration Date', accessor: 'registrationDate' },
                            ]
                        }],
                        summary: {
                            'Total Registered Patients': allPatients.length,
                            'Currently Admitted': admittedCount,
                            'Pending Discharge': pendingCount,
                            'Total Discharged': dischargedCount,
                        }
                    };
                    break;
            }
            if(report && request === generationRequest.current) {
                setGeneratedReport({ ...report, type: reportType, period: nonDateReports.includes(reportType) ? 'All Time' : `${dateRange!.start.toLocaleDateString()} – ${dateRange!.end.toLocaleDateString()}`, generatedAt: new Date().toLocaleString() });
                setPanelOpen(true);
            }

        } catch (error) {
            console.error("Error generating report:", error);
            if (request === generationRequest.current) {
                const message = firestoreReadError(error).message;
                setReportError(message);
                addNotification(message, 'error');
            }
        } finally {
            if (request === generationRequest.current) setGeneratingReportType(null);
        }
    };
    
    const saveFile = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const downloadReport = async (format: 'image' | 'pdf' | 'word') => {
        if (!generatedReport || exporting) return;
        setDownloadOpen(false);
        setExporting(true);
        try {
            const logo = await loadReportLogo();
            const pages = paginateReport(generatedReport, measureReportText);
            const images: Uint8Array[] = [];
            for (let index = 0; index < pages.length; index++) {
                const canvas = await reportPageCanvas(renderReportPage(generatedReport, pages[index], index, pages.length, logo));
                const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image export failed')), 'image/png'));
                images.push(new Uint8Array(await blob.arrayBuffer()));
                canvas.width = 0; canvas.height = 0;
            }
            if (format === 'image') {
                if (images.length === 1) saveFile(new Blob([new Uint8Array(images[0])], { type: 'image/png' }), `${generatedReport.type}_report.png`);
                else {
                    const { zipSync } = await import('fflate');
                    const files: Record<string, Uint8Array> = {};
                    for (let index = 0; index < images.length; index++) files[`page-${String(index + 1).padStart(3, '0')}.png`] = images[index];
                    const zip = zipSync(files, { level: 0 });
                    saveFile(new Blob([new Uint8Array(zip)], { type: 'application/zip' }), `${generatedReport.type}_report_images.zip`);
                }
            } else if (format === 'pdf') {
                const { jsPDF } = await import('jspdf');
                const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                pdf.setProperties({ title: generatedReport.title, author: 'Maranatha-Sapphire Hospital' });
                images.forEach((image, index) => {
                    if (index) pdf.addPage('a4', 'portrait');
                    // Keep the exact page artwork while retaining searchable report text.
                    const svg = new DOMParser().parseFromString(renderReportPage(generatedReport, pages[index], index, pages.length, logo), 'image/svg+xml');
                    svg.querySelectorAll('text').forEach(text => {
                        const x = Number(text.getAttribute('x')) * 210 / A4_WIDTH;
                        const y = Number(text.getAttribute('y')) * 297 / A4_HEIGHT;
                        pdf.setFont('helvetica', text.getAttribute('font-weight') === '700' ? 'bold' : 'normal');
                        pdf.setFontSize(Number(text.getAttribute('font-size')) * 0.75);
                        pdf.text(text.textContent || '', x, y, { renderingMode: 'invisible', align: text.getAttribute('text-anchor') === 'end' ? 'right' : 'left' });
                    });
                    pdf.addImage(image, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
                });
                pdf.save(`${generatedReport.type}_report.pdf`);
            } else {
                const { Document, Packer, Paragraph, ImageRun, SectionType } = await import('docx');
                const sections = await Promise.all(images.map(image => ({
                    properties: {
                        type: SectionType.NEXT_PAGE,
                        page: { size: { width: 11906, height: 16838 }, margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } },
                    },
                    children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new ImageRun({
                        type: 'png', data: image,
                        transformation: { width: A4_WIDTH - 0.3, height: A4_HEIGHT - 0.5 },
                        floating: { horizontalPosition: { relative: 'page', offset: 0 }, verticalPosition: { relative: 'page', offset: 0 }, behindDocument: false },
                    })] })],
                })));
                saveFile(await Packer.toBlob(new Document({ sections })), `${generatedReport.type}_report.docx`);
            }
        } catch (error) {
            console.error('Report export failed:', error);
            addNotification('Could not download the report. Please try again.', 'error');
        } finally { setExporting(false); }
    };

    const getButtonText = (key: ReportType) => {
        if (generatingReportType === key) return 'Generating...';
        return 'Generate Report';
    }

    

    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-6 no-print">Reports</h1>
            {reportError && <div role="alert" className="mb-4 rounded-lg border border-red-800 bg-red-950/40 p-4 text-red-200 no-print">{reportError}</div>}
            <div className={`reports-workspace ${panelOpen ? 'reports-workspace-open' : ''}`}>
            <section ref={browserRef} className="reports-browser no-print">
            
            <div className="bg-[#161B22] border border-gray-700 p-6 rounded-lg shadow-md mb-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Date Range</label>
                        <select value={datePreset} onChange={(e) => setDatePreset(e.target.value as DatePreset)} className="mt-1 block w-full rounded-md border-gray-600 bg-gray-800 text-white shadow-sm focus:border-sky-500 focus:ring-sky-500 px-3 py-2">
                            <option value="today">Today</option>
                            <option value="week">This Week</option>
                            <option value="month">This Month</option>
                            <option value="year">This Year</option>
                            <option value="custom">Custom</option>
                        </select>
                    </div>
                    {datePreset === 'custom' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Start Date</label>
                                <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="mt-1 block w-full rounded-md border-gray-600 bg-gray-800 text-white shadow-sm focus:border-sky-500 focus:ring-sky-500 px-3 py-2" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300">End Date</label>
                                <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="mt-1 block w-full rounded-md border-gray-600 bg-gray-800 text-white shadow-sm focus:border-sky-500 focus:ring-sky-500 px-3 py-2" />
                            </div>
                        </>
                    )}
                </div>
            </div>
            
            <div className="reports-cards">
                {reportTypesConfig.map((report) => (
                    <div 
                        key={report.key} 
                        className="report-card bg-[#161B22] border border-gray-700 p-6 rounded-lg shadow-md flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex items-start gap-4">
                                <div className="text-sky-400">{React.cloneElement(report.icon as React.ReactElement<any>, { size: 24 })}</div>
                                <div>
                                    <h2 className="text-xl font-semibold text-white">{report.title}</h2>
                                    <p className="text-sm text-gray-400 mt-1">{report.description}</p>
                                </div>
                            </div>
                            <div className="my-4 min-h-[160px] flex items-center justify-center">
                                {previewLoading ? (
                                    <div className="animate-pulse w-full px-2">
                                      <div className="h-4 bg-gray-700 rounded w-3/4 mb-4"></div>
                                      <div className="h-4 bg-gray-700 rounded mb-2"></div>
                                      <div className="h-4 bg-gray-700 rounded w-5/6"></div>
                                    </div>
                                ) : (
                                    <div className="w-full">
                                    <ReportPreview
                                        reportKey={report.key}
                                        data={previewData[report.key]}
                                        onRetry={() => setPreviewReload(value => value + 1)}

                                    />
                                    </div>
                                )}
                            </div>
                        </div>
                        <button 
                            onClick={() => handleGenerateReport(report.key)} 
                            disabled={generatingReportType === report.key}
                            aria-busy={generatingReportType === report.key}
                            className="mt-6 w-full inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-sky-600 hover:bg-sky-700 disabled:cursor-wait"
                        >
                            {generatingReportType === report.key && <Loader2 size={18} className="mr-2 animate-spin" aria-hidden="true" />}
                            {getButtonText(report.key)}
                        </button>
                    </div>
                ))}
            </div>

            </section>
            <aside ref={element => element?.toggleAttribute('inert', !panelOpen)} className="reports-panel" aria-hidden={!panelOpen} aria-label="Generated report">
            
            {generatedReport && (
                <div className="reports-panel-inner bg-[#161B22] border border-gray-700 rounded-lg shadow-md">
                    <div className="report-toolbar text-gray-200 flex items-center justify-between gap-3 p-3 border-b border-gray-700 no-print">
                        <h2 className="text-sm font-semibold text-white truncate">{generatedReport.title}</h2>
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="relative" ref={downloadMenuRef}>
                                <button type="button" onClick={() => setDownloadOpen(value => !value)} disabled={exporting} aria-expanded={downloadOpen} aria-controls="report-download-options" className="flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-500 disabled:opacity-50"><Download size={16} />{exporting ? 'Downloading…' : 'Download'}<ChevronDown size={14} /></button>
                                {downloadOpen && <div id="report-download-options" className="absolute right-0 top-full z-20 mt-2 w-48 rounded-lg border border-gray-600 bg-gray-800 p-1 shadow-xl">
                                    <button onClick={() => downloadReport('image')} className="flex w-full items-center gap-2 rounded p-3 text-sm hover:bg-gray-700"><ImageIcon size={16} /> Image (PNG)</button>
                                    <button onClick={() => downloadReport('pdf')} className="flex w-full items-center gap-2 rounded p-3 text-sm hover:bg-gray-700"><FileText size={16} /> PDF</button>
                                    <button onClick={() => downloadReport('word')} className="flex w-full items-center gap-2 rounded p-3 text-sm hover:bg-gray-700"><FileText size={16} /> Word Document</button>
                                </div>}
                            </div>
                            <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-gray-700 px-3 py-2 text-sm hover:bg-gray-600"><Printer size={16} /> Print</button>
                            <button onClick={() => { setPanelOpen(false); setDownloadOpen(false); }} aria-label="Close report" className="rounded-lg p-2 hover:bg-gray-700"><X size={18} /></button>
                        </div>
                    </div>
                    <div className="report-document-scroll p-3">
                    <ReportDocument report={generatedReport} />

                    </div>
                </div>
            )}
            </aside>
            </div>
        </div>
    );
};

export default Reports;
