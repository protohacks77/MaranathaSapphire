import { invalidateReads } from '../../services/readCache';
import React, { useEffect, useState } from 'react';
import Modal from '../../components/utils/Modal';
import { useNotification } from '../../context/NotificationContext';
import { InventoryResetPreview, previewInventoryReset, resetInventory } from './resetInventory';
import { RotateCcw } from 'lucide-react';

const InventoryResetSection: React.FC = () => {
    const { addNotification } = useNotification();
    const [open, setOpen] = useState(false);
    const [includeFinances, setIncludeFinances] = useState(false);
    const [preview, setPreview] = useState<InventoryResetPreview | null>(null);
    const [confirmation, setConfirmation] = useState('');
    const [loading, setLoading] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setPreview(null);
        setConfirmation('');
        setError('');
        setLoading(true);
        previewInventoryReset(includeFinances).then(result => { if (!cancelled) setPreview(result); }).catch(error => { if (!cancelled) setError(error.message || 'Could not load reset preview.'); }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, includeFinances]);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (resetting || loading || !preview || confirmation !== 'RESET INVENTORY') return;
        setResetting(true);
        setError('');
        try {
            await resetInventory(includeFinances, confirmation, (done, total) => setProgress({ done, total }));
            invalidateReads();
            addNotification(includeFinances ? 'Inventory and hospital finances reset successfully.' : 'Inventory, pharmacy activity, and stock value reset successfully.', 'success');
            setOpen(false);
            setConfirmation('');
        } catch (error: any) {
            setError(error.message || 'Reset failed.');
            setPreview(null);
        } finally { setResetting(false); }
    };
    return <>
        <section className="mx-auto mt-8 max-w-3xl rounded-lg border border-red-500/30 bg-[#161B22] p-8">
            <h2 className="text-xl font-semibold text-white">Reset Inventory</h2>
            <p className="mt-2 text-sm text-gray-400">Clear all stock, inventory activity, dispensing history, and pharmacy prices to start again with zero inventory value. You can also reset hospital finances.</p>
            <button onClick={() => { setIncludeFinances(false); setOpen(true); }} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"><RotateCcw size={16} /> Reset Inventory</button>
        </section>
        <Modal isOpen={open} onClose={() => { if (!resetting) setOpen(false); }} title="Reset Inventory" size="lg">
            <form onSubmit={submit} className="space-y-5">
                <p className="text-sm text-gray-300">This permanently deletes all inventory items, stock activity, dispensed medication records, and pharmacy price-list entries. Inventory quantities and value return to zero.</p>
                <label className="flex items-start gap-3 rounded-lg border border-gray-700 p-3 text-sm text-gray-300"><input type="checkbox" checked={includeFinances} disabled={resetting} onChange={e => setIncludeFinances(e.target.checked)} className="mt-1" /><span>Also reset all hospital finances<span className="mt-1 block text-xs text-gray-400">Delete all bills and payments and set every patient’s total billed, amount paid, and outstanding balance to $0. Patient profiles and clinical notes are retained.</span></span></label>
                {loading ? <p role="status" className="text-sm text-gray-400">Loading records to reset…</p> : preview && <dl className="grid grid-cols-2 gap-3 rounded-lg bg-gray-800/50 p-4 text-sm">
                    {[
                        ['Inventory items', preview.inventory], ['Stock activity records', preview.inventoryLogs],
                        ['Dispensing records', preview.dispensingRecords], ['Pharmacy prices', preview.pharmacyPrices],
                        ...(includeFinances ? [['Bills', preview.bills], ['Payments', preview.payments], ['Patient balances', preview.patients]] : []),
                    ].map(([label, count]) => <div key={label} className="flex justify-between gap-2"><dt className="text-gray-400">{label}</dt><dd className="font-semibold text-white">{count}</dd></div>)}
                </dl>}
                <div><label htmlFor="reset-inventory-confirm" className="mb-2 block text-sm text-gray-300">Type <strong>RESET INVENTORY</strong> to confirm permanent deletion.</label><input id="reset-inventory-confirm" autoComplete="off" value={confirmation} disabled={resetting || loading} onChange={e => setConfirmation(e.target.value)} className="modern-input w-full" /></div>
                {resetting && <p role="status" className="text-sm text-gray-400">Resetting… {progress.done} / {progress.total}</p>}
                {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
                <div className="flex justify-end gap-3 border-t border-gray-700 pt-4"><button type="button" disabled={resetting} onClick={() => setOpen(false)} className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white disabled:opacity-50">Cancel</button><button type="submit" disabled={resetting || loading || !preview || confirmation !== 'RESET INVENTORY'} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40">{resetting ? 'Resetting…' : includeFinances ? 'Reset Inventory & Finances' : 'Reset Inventory'}</button></div>
            </form>
        </Modal>
    </>;
};
export default InventoryResetSection;
