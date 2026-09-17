import { firestoreReadError } from '../../services/firestoreReadError';
import DatabaseIndexLink from '../../components/utils/DatabaseIndexLink';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Pill, Check } from 'lucide-react';
import { db } from '../../services/firebase';
import { Bill, InventoryItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import firebase from 'firebase/compat/app';
import { PAGE_SIZE } from '../../services/lowReadQueries';
import { invalidateReads } from '../../services/readCache';
import Modal from '../../components/utils/Modal';
import { billedMedicationLines, dispensingProblem } from './billedMedication';
import { dispenseBill } from './dispenseBill';
import { formatRecordDate, formatRecordTime } from '../patients/recordTimestamp';

const AwaitingDispensing: React.FC = () => {
    const { userProfile } = useAuth();
    const { addNotification } = useNotification();
    const [bills, setBills] = useState<Bill[]>([]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [loadingBills, setLoadingBills] = useState(true);
    const [loadingInventory, setLoadingInventory] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const appended = useRef(false);
    const cursor = useRef<firebase.firestore.QueryDocumentSnapshot | null>(null);
    const [error, setError] = useState('');
    const [indexUrl, setIndexUrl] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState('');
    const [search, setSearch] = useState('');
    useEffect(() => { const timer = setTimeout(() => setSearchTerm(search.trim().toLowerCase()), 300); return () => clearTimeout(timer); }, [search]);
    const queueQuery = useMemo(() => {
        let query: firebase.firestore.Query = db.collection('bills').where('dispensingStatus', '==', 'Pending');
        if (searchTerm.length >= 2) query = query.where('patientSearchPrefixes', 'array-contains', searchTerm);
        return query.orderBy('date', 'asc');
    }, [searchTerm]);
    useEffect(() => {
        setLoadingBills(true); setError(''); setIndexUrl(''); setBills([]); cursor.current = null; appended.current = false;
        return queueQuery.limit(PAGE_SIZE).onSnapshot(snapshot => {
            const fresh = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Bill));
            setBills(previous => {
                const newest = new Map(fresh.map(bill => [bill.id, bill]));
                // Keep explicitly loaded older pages. Removed first-page bills are dropped.
                const boundary = snapshot.docs[snapshot.docs.length - 1]?.data().date;
                previous.filter(bill => boundary && bill.date > boundary && !newest.has(bill.id)).forEach(bill => newest.set(bill.id, bill));
                return [...newest.values()];
            });
            if (!appended.current) { cursor.current = snapshot.docs[snapshot.docs.length - 1] || null; setHasMore(snapshot.size === PAGE_SIZE); }
            setLoadingBills(false);
        }, error => { const failure = firestoreReadError(error); setError(failure.message); setIndexUrl(failure.indexUrl); setLoadingBills(false); });
    }, [queueQuery]);
    const loadMore = async () => {
        if (!cursor.current || loadingMore) return;
        setLoadingMore(true);
        try {
            const snapshot = await queueQuery.startAfter(cursor.current).limit(PAGE_SIZE).get();
            appended.current = true;
            setBills(previous => [...new Map([...previous, ...snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Bill))].map(bill => [bill.id, bill])).values()]);
            cursor.current = snapshot.docs[snapshot.docs.length - 1] || null;
            setHasMore(snapshot.size === PAGE_SIZE);
        } catch { setError('Could not load more bills. Please reload the dashboard.'); }
        finally { setLoadingMore(false); }
    };
    useEffect(() => {
        if (!selectedId) { setInventory([]); return; }
        const bill = bills.find(bill => bill.id === selectedId);
        if (!bill) return;
        let cancelled = false;
        setLoadingInventory(true); setModalError('');
        const lines = [...new Map(billedMedicationLines(bill, []).filter(line => line.remaining > 0).map(line => [line.inventoryItemId || line.name, line])).values()];
        Promise.all(lines.map(async line => {
            if (line.inventoryItemId) {
                const doc = await db.collection('inventory').doc(line.inventoryItemId).get();
                return doc.exists ? { ...doc.data(), id: doc.id } as InventoryItem : null;
            }
            const snapshot = await db.collection('inventory').where('name', '==', line.name).limit(1).get();
            return snapshot.empty ? null : { ...snapshot.docs[0].data(), id: snapshot.docs[0].id } as InventoryItem;
        })).then(items => { if (!cancelled) setInventory([...new Map(items.filter((item): item is InventoryItem => Boolean(item)).map(item => [item.id, item])).values()]); })
            .catch(() => { if (!cancelled) setModalError('Could not load current stock. Close and reopen to retry.'); })
            .finally(() => { if (!cancelled) setLoadingInventory(false); });
        return () => { cancelled = true; };
    }, [selectedId]);
    const pending = useMemo(() => bills.map(bill => ({ bill, lines: billedMedicationLines(bill, []).filter(line => line.remaining > 0) }))
        .filter(entry => entry.lines.length > 0)
        .sort((a, b) => new Date(a.bill.date).getTime() - new Date(b.bill.date).getTime()), [bills, inventory]);
    const filtered = pending.filter(({ bill }) => `${bill.patientName} ${bill.patientHospitalNumber}`.toLowerCase().includes(search.trim().toLowerCase()));
    const selected = bills.find(bill => bill.id === selectedId);
    const lines = selected ? billedMedicationLines(selected, inventory) : [];
    const remaining = lines.filter(line => line.remaining > 0);
    const problem = dispensingProblem(remaining);
    const dispense = async () => {
        if (!selectedId || !userProfile || saving) return;
        setSaving(true);
        setModalError('');
        try {
            await dispenseBill(selectedId, inventory, userProfile);
            addNotification('Medication dispensed. Stock and patient history updated.', 'success');
            setBills(previous => previous.filter(bill => bill.id !== selectedId));
            invalidateReads();
            setSelectedId(null);
        } catch (error: any) { setModalError(error.message || 'Could not dispense medication.'); }
        finally { setSaving(false); }
    };
    return <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-white"><Pill size={20} className="text-green-400" /> Awaiting Dispensing<span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{pending.length}</span></h2>
            <input aria-label="Search medication queue by patient" placeholder="Search patient or hospital number…" value={search} onChange={event => setSearch(event.target.value)} className="modern-input w-full sm:w-80" />
        </div>
        {error ? <div><p role="alert" className="text-sm text-red-400">{error}</p><DatabaseIndexLink url={indexUrl} /></div> : <div className="overflow-x-auto rounded-lg border border-gray-700 bg-[#161B22]">
            <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-gray-800/50 text-xs text-gray-400"><tr>{['Billed', 'Patient', 'Medication', 'Payment', 'Action'].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-700/60">
                    {loadingBills ? Array.from({ length: 3 }, (_, i) => <tr key={i}>{Array.from({ length: 5 }, (_, j) => <td key={j} className="px-4 py-4"><div className="h-5 rounded bg-gray-700/50 motion-safe:animate-pulse" /></td>)}</tr>) : filtered.map(({ bill, lines }) => <tr key={bill.id} className="hover:bg-gray-800/30">
                        <td className="px-4 py-4 whitespace-nowrap tabular-nums text-gray-400">{formatRecordDate(bill.date)}<p className="mt-1 text-xs text-gray-500">{formatRecordTime(bill.date)}</p></td>
                        <td className="px-4 py-4"><Link to={`/patients/${bill.patientId}`} className="font-medium text-sky-400 hover:underline">{bill.patientName}</Link><p className="mt-1 text-xs text-gray-500">{bill.patientHospitalNumber}</p></td>
                        <td className="px-4 py-4 text-gray-300">{lines.map(line => <p key={line.index}>{line.name} <span className="text-gray-500">× {line.remaining}</span></p>)}</td>
                        <td className="px-4 py-4"><span className={`inline-flex rounded-md px-2 py-1 text-xs ${bill.status === 'Paid' ? 'bg-green-500/10 text-green-300' : 'bg-amber-500/10 text-amber-300'}`}>{bill.status}</span></td>
                        <td className="px-4 py-4"><button onClick={() => { setSelectedId(bill.id!); setModalError(''); }} className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-500"><Pill size={14} /> Review & Dispense</button></td>
                    </tr>)}
                    {!loadingBills && !loadingInventory && !filtered.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">{search ? 'No matching patients.' : 'No billed medication awaiting dispensing.'}</td></tr>}
                </tbody>
            </table>
        </div>}
        {hasMore && <button disabled={loadingMore} onClick={loadMore} className="mt-4 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 disabled:opacity-50">{loadingMore ? 'Loading…' : 'Load More'}</button>}
        <Modal isOpen={Boolean(selectedId)} onClose={() => { if (!saving) setSelectedId(null); }} title="Dispense Billed Medication" size="lg">
            {selected ? <div className="space-y-5">
                <div className="flex flex-wrap justify-between gap-4"><div><p className="font-semibold text-white">{selected.patientName}</p><p className="mt-1 text-sm text-gray-400">{selected.patientHospitalNumber}</p><p className="mt-1 text-xs text-gray-500">Billed: {formatRecordDate(selected.date)} at {formatRecordTime(selected.date)}</p></div><div className="text-right"><p className="text-sm text-gray-300">{selected.status}</p><p className="mt-1 text-xs text-gray-400">Bill: ${selected.totalBill.toFixed(2)} · Balance: ${selected.balance.toFixed(2)}</p></div></div>
                <div className="max-h-[40dvh] overflow-auto rounded-lg border border-gray-700">
                    <table className="w-full text-left text-sm"><thead className="bg-gray-800 text-xs text-gray-400"><tr>{['Medication', 'Billed', 'Dispensed', 'To Give', 'In Stock'].map(label => <th key={label} scope="col" className="p-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-700">{lines.map(line => <tr key={line.index}><td className="p-3 text-gray-200">{line.name}</td><td className="p-3 text-gray-400">{line.billed}</td><td className="p-3 text-gray-400">{line.dispensed}</td><td className="p-3 font-semibold text-green-400">{line.remaining}</td><td className="p-3 text-gray-400">{line.available}</td></tr>)}</tbody></table>
                </div>
                {loadingInventory ? <p role="status" className="text-sm text-gray-400">Checking current stock…</p> : problem && <p className="text-sm text-amber-400">{problem}</p>}
                {!remaining.length && <p className="text-sm text-green-400">All medication on this bill has been dispensed.</p>}
                {modalError && <p role="alert" className="text-sm text-red-400">{modalError}</p>}
                <div className="flex justify-end gap-3 border-t border-gray-700 pt-4"><button disabled={saving} onClick={() => setSelectedId(null)} className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white disabled:opacity-50">Close</button><button disabled={saving || loadingInventory || Boolean(modalError) || Boolean(problem) || !remaining.length || Boolean(error)} onClick={dispense} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-40"><Check size={16} /> {saving ? 'Dispensing…' : 'Dispense All Medication'}</button></div>
            </div> : <p className="text-gray-400">This bill is no longer available.</p>}
        </Modal>
    </section>;
};
export default AwaitingDispensing;
