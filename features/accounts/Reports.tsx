import { reportPreviews } from '../../services/reportPreviews';
import { dateQuery, aggregateRecords } from '../../services/lowReadQueries';
import { cachedRead } from '../../services/readCache';
import React, { useState, useRef, useMemo, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { db } from '../../services/firebase';
import { Bill, Payment, Patient, UserProfile, PriceListItem, InventoryItem } from '../../types';
import { useNotification } from '../../context/NotificationContext';
import LoadingSpinner from '../../components/utils/LoadingSpinner';
import { BarChart as BarChartIcon, FileSpreadsheet, FileText, ImageIcon, Users, BedDouble, LogOut, UserCheck, DollarSign, CreditCard, AlertTriangle, Banknote, UserRoundCheck, ShoppingCart, Package, ArrowDown, ArrowUp } from 'lucide-react';
import firebase from 'firebase/compat/app';
import LineChart from '../../components/charts/LineChart';
import BarChart from '../../components/charts/BarChart';

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
}

const reportTypesConfig: { key: ReportType; title: string; description: string; icon: React.ReactNode; needsDate: boolean }[] = [
    { key: 'financial_summary', title: 'Financial Summary', description: 'High-level overview of sales, payments, and outstanding balances.', icon: <BarChartIcon />, needsDate: true },
    { key: 'patient_census', title: 'Patient Census', description: 'A real-time snapshot of patient counts and a full patient list.', icon: <Users />, needsDate: false },
    { key: 'stock_report', title: 'Stock Report', description: 'Comprehensive overview of inventory levels, usage, and new additions.', icon: <Package />, needsDate: true },
    { key: 'top_selling_items', title: 'Top Selling Items', description: 'Top 5 most frequently billed services and products.', icon: <ShoppingCart />, needsDate: true },
    { key: 'admissions', title: 'Admissions Report', description: 'All patients admitted within the selected period.', icon: <BedDouble />, needsDate: true },
    { key: 'debtors', title: 'Unpaid Patients', description: 'Lists all patients with an outstanding balance.', icon: <AlertTriangle />, needsDate: false },
    { key: 'paid_invoices', title: 'Paid Invoices', description: 'All fully paid invoices within the selected period.', icon: <UserCheck />, needsDate: true },
    { key: 'partially_paid_invoices', title: 'Partial Payments', description: 'All partially paid invoices from the selected period.', icon: <CreditCard />, needsDate: true },
    { key: 'patients_served', title: 'Patients Served', description: 'Unique patients who received any billable service.', icon: <UserRoundCheck />, needsDate: true },
];

const ReportPreview: React.FC<{ reportKey: ReportType; data: any }> = ({ reportKey, data }) => {
    const FullReportPrompt = () => (
        <p className="mt-4 text-center text-xs text-gray-500 italic px-4">
            Click 'Generate Report' for full details.
        </p>
    );

    if (data?.deferred) return <p className="text-sm text-gray-500">Load this preview when needed.</p>;
    if (!data || (Array.isArray(data) && data.length === 0)) {
        return (
             <div className="w-full h-full flex flex-col justify-between">
                <div className="flex-grow flex items-center justify-center">
                    <p className="text-gray-600 text-sm">No preview data for this period.</p>
                </div>
                 <FullReportPrompt />
            </div>
        );
    }

    let columns: { header: string; accessor: string }[] = [];
    let content: React.ReactNode;
    
    switch (reportKey) {
        case 'financial_summary':
        case 'patient_census':
        case 'patients_served':
        case 'stock_report':
            content = (
                <div className="w-full px-4">
                    <div className="space-y-3 text-sm">
                        {Object.entries(data).map(([key, value]) => (
                            <div key={key} className="flex justify-between items-baseline border-b border-dashed border-gray-700 pb-2">
                                <span className="text-gray-400">{key}</span>
                                <span className="font-bold text-lg text-white">{value as React.ReactNode}</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
            break;
        case 'top_selling_items':
            columns = [{ header: 'Item', accessor: 'name' }, { header: 'Sold', accessor: 'quantity' }];
            break;
        case 'debtors':
            columns = [{ header: 'Patient', accessor: 'name' }, { header: 'Balance', accessor: 'balance' }];
            break;
        case 'paid_invoices':
            columns = [{ header: 'Patient', accessor: 'patientName' }, { header: 'Amount', accessor: 'total' }];
            break;
        case 'partially_paid_invoices':
            columns = [{ header: 'Patient', accessor: 'patientName' }, { header: 'Balance', accessor: 'balance' }];
            break;
        case 'admissions':
            columns = [{ header: 'Patient', accessor: 'name' }, { header: 'Date', accessor: 'date' }];
            break;
        default:
            return <div className="text-gray-600 text-sm">No preview available.</div>;
    }

    if (columns.length > 0 && Array.isArray(data)) {
        content = (
            <div className="overflow-x-auto text-xs w-full px-2">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-700">
                            {columns.map(col => (
                                <th key={col.accessor} className="pb-2 text-left font-semibold text-gray-400 uppercase tracking-wider">{col.header}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.slice(0, 4).map((row: any, rowIndex: number) => (
                            <tr key={rowIndex} className={rowIndex < 3 ? "border-b border-gray-800" : ""}>
                                {columns.map(col => (
                                    <td key={col.accessor} className="py-2.5 text-gray-300 truncate" title={row[col.accessor]}>
                                        {row[col.accessor]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
    
    return (
        <div className="w-full h-full flex flex-col justify-between">
            <div className="flex-grow flex items-center">
                 {content}
            </div>
            <FullReportPrompt />
        </div>
    );
};


const Reports: React.FC = () => {
    const [datePreset, setDatePreset] = useState<DatePreset>('month');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [generatingReportType, setGeneratingReportType] = useState<ReportType | null>(null);
    const [detailedPreviews, setDetailedPreviews] = useState<string[]>([]);
    const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);
    const [previewData, setPreviewData] = useState<Record<string, any>>({});
    const [previewLoading, setPreviewLoading] = useState(true);

    const { addNotification } = useNotification();
    const reportContainerRef = useRef<HTMLDivElement>(null);

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
                start = new Date(customStartDate);
                end = new Date(customEndDate);
                end.setHours(23, 59, 59, 999);
                break;
        }
        return { start, end };
    }, [datePreset, customStartDate, customEndDate]);

    useEffect(() => {
        const fetchPreviewData = async () => {
            if (!dateRange) {
                if(datePreset === 'custom' && (!customStartDate || !customEndDate)) return;
            }
            
            setPreviewLoading(true);
            try {
                const previews = await reportPreviews(dateRange, detailedPreviews);
                setPreviewData(previews);
            } catch (error) {
                console.error("Error fetching preview data:", error);
                addNotification("Could not load report previews.", "error");
            } finally {
                setPreviewLoading(false);
            }
        };

        fetchPreviewData();
    }, [dateRange, addNotification, datePreset, customStartDate, customEndDate, detailedPreviews]);

    const handleGenerateReport = async (reportType: ReportType) => {
        setLoading(true);
        setGeneratingReportType(reportType);
        setGeneratedReport(null);
        
        const nonDateReports: ReportType[] = ['debtors', 'patient_census'];
        if (!dateRange && !nonDateReports.includes(reportType)) {
            addNotification('Please select a valid date range.', 'warning');
            setLoading(false);
            setGeneratingReportType(null);
            return;
        }

        try {
            const empty = { docs: [] };
            const needsBills = [ 'stock_report', 'top_selling_items', 'paid_invoices', 'partially_paid_invoices', 'patients_served'].includes(reportType);
            const needsPatients = ['patient_census', 'debtors', 'admissions'].includes(reportType);
            let billQuery = dateQuery('bills', 'date', dateRange);
            if (reportType === 'paid_invoices') billQuery = billQuery.where('status', '==', 'Paid');
            if (reportType === 'partially_paid_invoices') billQuery = billQuery.where('status', '==', 'Partially Paid');
            let patientQuery: firebase.firestore.Query = db.collection('patients');
            if (reportType === 'debtors') patientQuery = patientQuery.where('financials.balance', '>', 0);
            if (reportType === 'admissions') patientQuery = dateQuery('patients', 'registrationDate', dateRange);
            const [billsSnapshot, paymentsSnapshot, patientsSnapshot, inventorySnapshot] = await Promise.all([
                 needsBills ? cachedRead(`report:bills:${reportType}:${JSON.stringify(dateRange)}`, () => billQuery.get()) : empty,
                 empty,
                 needsPatients ? cachedRead(`report:patients:${reportType}:${JSON.stringify(dateRange)}`, () => patientQuery.get()) : empty,
                 reportType === 'stock_report' ? cachedRead('report:inventory', () => db.collection('inventory').orderBy('name').get()) : empty,
            ]);

            const financialBounds: import('../../services/lowReadQueries').Filters = dateRange ? [['date', '>=', dateRange.start.toISOString()], ['date', '<=', dateRange.end.toISOString()]] : [];
            const financial = reportType === 'financial_summary' ? await Promise.all([
                aggregateRecords('bills', {total: 'totalBill'}, financialBounds),
                aggregateRecords('payments', {total: 'amount'}, [...financialBounds, ['paymentMethod', '==', 'CASH']]),
                aggregateRecords('payments', {total: 'amount'}, [...financialBounds, ['paymentMethod', '==', 'EFT']]),
                aggregateRecords('patients', {total: 'financials.balance'}),
            ]) : [];
            const allBills = billsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as Bill));
            const allPayments: Payment[] = [];
            let allPatients = patientsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient));
            if (reportType === 'patients_served') {
                const ids = [...new Set(allBills.map(bill => bill.patientId))];
                const pages = await Promise.all(Array.from({ length: Math.ceil(ids.length / 30) }, (_, index) =>
                    cachedRead(`report:served:${ids.slice(index * 30, index * 30 + 30).join(',')}`, () => db.collection('patients').where(firebase.firestore.FieldPath.documentId(), 'in', ids.slice(index * 30, index * 30 + 30)).get())));
                allPatients = pages.flatMap(page => page.docs.map(doc => ({ ...doc.data(), id: doc.id } as Patient)));
            }
            const allInventory = inventorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));

            const billsInRange = dateRange ? allBills.filter(b => new Date(b.date) >= dateRange.start && new Date(b.date) <= dateRange.end) : allBills;
            const paymentsInRange = dateRange ? allPayments.filter(p => new Date(p.date) >= dateRange.start && new Date(p.date) <= dateRange.end) : allPayments;
            
            let report: Omit<GeneratedReport, 'type'> | null = null;
            
            switch (reportType) {
                case 'financial_summary':
                    const totalSales = financial[0].total;
                    const totalCash = financial[1].total;
                    const totalEFT = financial[2].total;
                    const totalBalance = financial[3].total;

                    report = {
                        title: 'Financial Summary',
                        tables: [],
                        summary: {
                            'Total Sales': totalSales,
                            'Cash Received': totalCash,
                            'EFT Received': totalEFT,
                            'Total Outstanding Balance': totalBalance,
                        }
                    };
                    break;
                case 'stock_report':
                    const stockLeftData = allInventory.map(item => ({
                        ...item,
                        totalValue: item.quantity * item.unitPrice,
                        isLow: item.quantity <= item.lowStockThreshold
                    }));

                    const dispensedMap: { [name: string]: { name: string, quantity: number, totalValue: number } } = {};
                    billsInRange.forEach(bill => {
                        bill.items.forEach(item => {
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
                        .filter(p => p.financials.balance > 0)
                        .map(p => ({
                            ...p,
                            name: `${p.name} ${p.surname}`,
                            balance: p.financials.balance
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
                        bill.items.forEach(item => {
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
            if(report) {
                setGeneratedReport({ ...report, type: reportType });
            }

        } catch (error) {
            console.error("Error generating report:", error);
            addNotification('Failed to generate report.', 'error');
        } finally {
            setLoading(false);
            setGeneratingReportType(null);
        }
    };
    
    const exportToCSV = () => {
        if (!generatedReport || generatedReport.tables.every(t => t.data.length === 0)) return;

        let csvBody = "";
        generatedReport.tables.forEach(table => {
            if (table.data.length === 0) return;
            if (table.title) {
                csvBody += `"${table.title}"\n`;
            }
            const headers = table.columns.map(c => `"${c.header.replace(/"/g, '""')}"`).join(',');
            csvBody += `${headers}\n`;

            const rows = table.data.map(row => {
                return table.columns.map(col => {
                    let value = row[col.accessor];
                    
                    // Handle Firestore Timestamps
                    if (value && typeof value === 'object' && typeof value.toDate === 'function') {
                        value = value.toDate();
                    }

                    // Format Dates
                    if (value instanceof Date) {
                        value = value.toLocaleString();
                    } else if ((String(col.accessor).toLowerCase().includes('date') || col.accessor === 'createdAt') && typeof value === 'string') {
                         // Try parsing string date
                         const d = new Date(value);
                         if (!isNaN(d.getTime())) {
                             value = d.toLocaleString();
                         }
                    }
                    
                    // Format Numbers/Currency
                    if (typeof value === 'number') {
                         if (col.header.includes('($)')) {
                             value = value.toFixed(2);
                         }
                    } else if (typeof value === 'boolean') {
                        value = value ? 'Yes' : 'No';
                    }
                    
                    return `"${String(value ?? '').replace(/"/g, '""')}"`;
                }).join(',');
            }).join('\n');
            csvBody += `${rows}\n\n`;
        });
        
        // Add BOM for Excel UTF-8 compatibility
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csvBody);
        const link = document.createElement("a");
        link.setAttribute("href", csvContent);
        link.setAttribute("download", `${generatedReport.type}_report.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportToPNG = () => {
        if (!reportContainerRef.current) return;
        html2canvas(reportContainerRef.current, { 
            backgroundColor: '#ffffff',
            useCORS: true // Added to fix potential CORS warning/error with images
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `${generatedReport?.type}_report.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
    };

    const exportToWord = () => {
        if (!reportContainerRef.current) return;
        const styles = `
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 10pt; color: #333; }
            .report-container { width: 100%; margin: 0 auto; }
            h2, h3, p { margin: 0; }
            table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 20px; }
            th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
            th { background-color: #4a5568; color: white; }
            tr:nth-child(even) { background-color: #f7fafc; }
            .summary-card { border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        `;

        const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export HTML to Word</title><style>${styles}</style></head><body>`;
        const footer = "</body></html>";
        const sourceHTML = header + reportContainerRef.current.innerHTML + footer;
        
        const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
        const fileDownload = document.createElement("a");
        document.body.appendChild(fileDownload);
        fileDownload.href = source;
        fileDownload.download = `${generatedReport?.type}_report.doc`;
        fileDownload.click();
        document.body.removeChild(fileDownload);
    };
    
    const getButtonText = (key: ReportType) => {
        if (generatingReportType === key) return 'Generating...';
        return 'Generate Report';
    }

    const formatCurrency = (value: any) => typeof value === 'number' ? `$${value.toFixed(2)}` : value;
    
    const getSummaryIconSafe = (key: string) => {
        // FIX: Explicitly define props to any to bypass strict type check if Lucide icon types are mismatched or incomplete in current env.
        const iconProps: any = { size: 32, className: "text-white" };
        const containerClass = "p-4 rounded-lg";
        switch (key) {
            case 'Total Sales': return <div className={`bg-blue-500 ${containerClass}`}><DollarSign {...iconProps} /></div>;
            case 'Cash Received': return <div className={`bg-green-500 ${containerClass}`}><Banknote {...iconProps} /></div>;
            case 'EFT Received': return <div className={`bg-indigo-500 ${containerClass}`}><CreditCard {...iconProps} /></div>;
            case 'Total Outstanding Balance': return <div className={`bg-red-500 ${containerClass}`}><AlertTriangle {...iconProps} /></div>;
            case 'Total Registered Patients': return <div className={`bg-blue-500 ${containerClass}`}><Users {...iconProps} /></div>;
            case 'Currently Admitted': return <div className={`bg-purple-500 ${containerClass}`}><BedDouble {...iconProps} /></div>;
            case 'Pending Discharge': return <div className={`bg-yellow-500 ${containerClass}`}><LogOut {...iconProps} /></div>;
            case 'Total Discharged': return <div className={`bg-green-500 ${containerClass}`}><UserCheck {...iconProps} /></div>;
            case 'Stock Received (Units)': return <div className={`bg-blue-500 ${containerClass}`}><ArrowDown {...iconProps} /></div>;
            case 'Stock Sold (Units)': return <div className={`bg-orange-500 ${containerClass}`}><ArrowUp {...iconProps} /></div>;
            case 'Revenue from Stock ($)': return <div className={`bg-teal-500 ${containerClass}`}><DollarSign {...iconProps} /></div>;
            default: return <div className={`bg-gray-500 ${containerClass}`}><BarChartIcon {...iconProps} /></div>;
        }
    }

    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-6">Reports</h1>
            
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {reportTypesConfig.map((report, index) => (
                    <div 
                        key={report.key} 
                        className="report-card-animate bg-[#161B22] border border-gray-700 p-6 rounded-lg shadow-md flex flex-col justify-between"
                        style={{ animationDelay: `${index * 80}ms` }}
                    >
                        <div>
                            <div className="flex items-start gap-4">
                                <div className="text-sky-400">{React.cloneElement(report.icon as React.ReactElement<any>, { size: 24 })}</div>
                                <div>
                                    <h2 className="text-xl font-semibold text-white">{report.title}</h2>
                                    <p className="text-sm text-gray-400 mt-1">{report.description}</p>
                                </div>
                            </div>
                            <div className="my-4 h-[160px] flex items-center justify-center">
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
                                    />
                                    {previewData[report.key]?.deferred && <button onClick={() => setDetailedPreviews(previous => [...previous, report.key])} className="mt-3 w-full text-sm text-sky-400 hover:underline">Load Preview</button>}
                                    </div>
                                )}
                            </div>
                        </div>
                        <button 
                            onClick={() => handleGenerateReport(report.key)} 
                            disabled={loading} 
                            className="mt-6 w-full inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50"
                        >
                            {getButtonText(report.key)}
                        </button>
                    </div>
                ))}
            </div>

            {loading && !generatingReportType && <LoadingSpinner />}
            
            {generatedReport && (
                <div className="mt-8 bg-[#161B22] border border-gray-700 p-6 rounded-lg shadow-md">
                    <div ref={reportContainerRef} className="report-container bg-white text-slate-800 p-8 rounded-lg">
                        {/* Report Header */}
                        <div className="flex justify-between items-start pb-4 border-b border-slate-200">
                             <div className="flex items-center gap-4">
                                <img src="/maranathalogo.png" alt="Logo" className="h-16 w-16 rounded-lg object-contain" />
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900">Maranatha-Sapphire</h2>
                                    <p className="text-sm text-slate-500">Masvingo, Zimbabwe</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <h3 className="text-xl font-semibold text-slate-800">{generatedReport.title}</h3>
                                <p className="text-sm text-slate-500">Generated: {new Date().toLocaleString()}</p>
                            </div>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 my-6">
                             {Object.entries(generatedReport.summary).map(([key, value]) => (
                                <div key={key} className="summary-card">
                                    {getSummaryIconSafe(key)}
                                    <div>
                                        <p className="text-sm text-slate-600 font-medium">{key}</p>
                                        <p className="text-3xl font-bold text-slate-800 mt-1">{typeof value === 'number' ? (String(key).includes('Value') || String(key).includes('Sales') || String(key).includes('Balance') || String(key).includes('Received') || String(key).includes('($)') || String(key).includes('Revenue')) ? formatCurrency(value) : value.toLocaleString() : value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Data Table */}
                        {generatedReport.tables.map((table, tableIndex) => (
                           (table.data.length > 0 || generatedReport.type === 'financial_summary') && (
                            <div key={tableIndex} className="overflow-x-auto mt-8">
                                {table.title && <h3 className="text-lg font-semibold mb-4 text-slate-800">{table.title}</h3>}
                                {table.data.length > 0 && (
                                <table className="w-full text-sm text-left text-slate-600">
                                    <thead className="text-xs text-white uppercase bg-slate-700">
                                        <tr>
                                            {table.columns.map(col => <th key={col.accessor} className="px-4 py-3 font-semibold">{col.header}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {table.data.map((row, index) => (
                                            <tr key={index} className="hover:bg-slate-100 odd:bg-white even:bg-slate-50">
                                                {table.columns.map(col => (
                                                    <td key={col.accessor} className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                                                        {(() => {
                                                            let cellValue = row[col.accessor];
                                                            if (col.accessor === 'isLow') {
                                                                return cellValue ? <span style={{ color: 'red', fontWeight: 'bold' }}>Low Stock</span> : <span style={{ color: 'green' }}>OK</span>;
                                                            }
                                                            if (String(col.accessor).toLowerCase().includes('date') || col.accessor === 'createdAt') {
                                                                return cellValue?.toDate ? new Date(cellValue.toDate()).toLocaleDateString() : (cellValue ? new Date(cellValue).toLocaleDateString() : 'N/A');
                                                            }
                                                            if (String(col.header).includes('($)')) {
                                                                return formatCurrency(cellValue);
                                                            }
                                                            return cellValue;
                                                        })()}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                )}
                            </div>
                           )
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 pt-4 mt-6 border-t border-gray-700">
                        <h3 className="text-lg font-semibold text-white">Export Report</h3>
                        <button onClick={exportToCSV} disabled={generatedReport.tables.every(t => t.data.length === 0)} className="flex items-center gap-2 px-3 py-2 text-sm bg-green-800 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"><FileSpreadsheet size={16}/> CSV</button>
                        <button onClick={exportToPNG} className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-800 text-white rounded-md hover:bg-blue-700"><ImageIcon size={16}/> PNG</button>
                        <button onClick={exportToWord} className="flex items-center gap-2 px-3 py-2 text-sm bg-sky-800 text-white rounded-md hover:bg-sky-700"><FileText size={16}/> Word</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Reports;
