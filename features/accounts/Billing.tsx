import { searchPatients, searchPriceItems } from '../../services/patientSearch';
import { searchPrefixes } from '../../services/patientSearch';
import { invalidateReads } from '../../services/readCache';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { Patient, PriceListItem, BillItem, Bill } from '../../types';
import { Search, X, PlusCircle, DollarSign, FileText, User, CreditCard, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import firebase from 'firebase/compat/app';
import Modal from '../../components/utils/Modal';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    totalBill: number;
    billItems: BillItem[];
    patient: Patient;
    onSuccess: () => void;
}

// Extended interface to handle local stock validation
interface ExtendedBillItem extends BillItem {
    availableStock?: number;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, totalBill, billItems, patient, onSuccess }) => {
    const { userProfile } = useAuth();
    const { addNotification } = useNotification();
    const [loading, setLoading] = useState(false);
    const [amountPaid, setAmountPaid] = useState<number>(0);
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'EFT' | 'Mixed'>('CASH');

    useEffect(() => {
        if (isOpen) {
            setAmountPaid(totalBill);
        }
    }, [isOpen, totalBill]);

    const balance = useMemo(() => totalBill - amountPaid, [totalBill, amountPaid]);

    const handleProcessBill = async () => {
        if (!userProfile) {
            addNotification('Cannot process bill without a logged in user.', 'warning');
            return;
        }
        setLoading(true);

        const balance = totalBill - amountPaid;
        let status: Bill['status'];
        if (amountPaid <= 0) {
            status = 'Unpaid';
        } else if (balance > 0) {
            status = 'Partially Paid';
        } else {
            status = 'Paid';
        }

        // Clean items before saving to remove availableStock if strictly adhering to BillItem type, 
        // though keeping it usually doesn't hurt. We'll map to base BillItem to be safe.
        const cleanItems: BillItem[] = billItems.map(item => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            ...(item.inventoryItemId ? { inventoryItemId: item.inventoryItemId } : {}),
            ...(item.department ? { department: item.department } : {}),
        }));

        const billData = {
            patientId: patient.id!,
            patientName: `${patient.name} ${patient.surname}`,
            patientHospitalNumber: patient.hospitalNumber,
            pharmacyTotal: cleanItems.filter(item => item.inventoryItemId || item.department === 'Pharmacy').reduce((total, item) => total + item.totalPrice, 0),
            pharmacyQuantity: cleanItems.filter(item => item.inventoryItemId || item.department === 'Pharmacy').reduce((total, item) => total + item.quantity, 0),
            items: cleanItems,
            dispensingStatus: cleanItems.some(item => item.inventoryItemId || item.department === 'Pharmacy') ? 'Pending' as const : 'Complete' as const,
            patientSearchPrefixes: searchPrefixes(patient.name, patient.surname, patient.hospitalNumber),
            totalBill,
            amountPaidAtTimeOfBill: amountPaid,
            balance,
            paymentMethod,
            date: new Date().toISOString(),
            processedBy: userProfile.id,
            status,
        };

        try {
            const batch = db.batch();
            
            const billRef = db.collection('bills').doc();
            batch.set(billRef, billData);

            const patientRef = db.collection('patients').doc(patient.id!);
            batch.update(patientRef, {
                'financials.totalBill': firebase.firestore.FieldValue.increment(totalBill),
                'financials.amountPaid': firebase.firestore.FieldValue.increment(amountPaid),
                'financials.balance': firebase.firestore.FieldValue.increment(balance),
            });

            // Pharmacy dispensing records the physical stock movement.
            
            await batch.commit();
            invalidateReads();
            addNotification('Bill processed successfully!', 'success');
            onSuccess();
            onClose();

        } catch (error) {
            console.error("Error processing bill:", error);
            addNotification('Failed to process bill.', 'error');
        } finally {
            setLoading(false);
        }
    };
    
    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Process Payment">
            <div className="space-y-4">
                <div className="bg-gray-800 p-4 rounded-lg">
                    <div className="flex justify-between text-2xl">
                        <span className="font-bold text-sky-400">Total Bill:</span>
                        <span className="font-extrabold text-white">${totalBill.toFixed(2)}</span>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300">Amount to Pay ($)</label>
                    <input type="number" value={amountPaid} onChange={e => setAmountPaid(parseFloat(e.target.value) || 0)}
                           className="modern-input" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Payment Method</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)}
                            className="mt-1 block w-full rounded-md border-gray-600 bg-gray-800 text-white shadow-sm focus:border-sky-500 focus:ring-sky-500 px-3 py-2 modern-select">
                        <option>CASH</option>
                        <option>EFT</option>
                        <option>Mixed</option>
                    </select>
                </div>
                
                <div className="bg-gray-800 p-4 rounded-lg space-y-3">
                    <div className="flex justify-between text-lg">
                        <span className="font-medium text-gray-300">Amount Paid:</span>
                        <span className="font-bold text-green-400">${amountPaid.toFixed(2)}</span>
                    </div>
                    <hr className="border-gray-600" />
                    <div className="flex justify-between text-2xl">
                        <span className="font-bold text-sky-400">Balance Due:</span>
                        <span className={`font-extrabold ${balance > 0 ? 'text-red-400' : 'text-green-400'}`}>${balance.toFixed(2)}</span>
                    </div>
                </div>
            </div>
            <div className="mt-6 flex justify-end space-x-4">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
                <button onClick={handleProcessBill} disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50">
                    {loading ? 'Processing...' : 'Confirm & Process Bill'}
                </button>
            </div>
        </Modal>
    );
}

const Billing: React.FC = () => {
    const { addNotification } = useNotification();
    const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
    
    // Patient Search State
    const [patientSearch, setPatientSearch] = useState('');
    const [patientResults, setPatientResults] = useState<Patient[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

    // Billing State
    const [billItems, setBillItems] = useState<ExtendedBillItem[]>([]);
    const [itemSearch, setItemSearch] = useState('');
    const [itemResults, setItemResults] = useState<PriceListItem[]>([]);
    
    const [isCreditModalOpen, setCreditModalOpen] = useState(false);
    const [creditLoading, setCreditLoading] = useState(false);
    const { userProfile } = useAuth();

    const handlePatientSearch = (query: string) => setPatientSearch(query);
    useEffect(() => {
        let cancelled = false;
        setPatientResults([]);
        const timer = setTimeout(() => { searchPatients(patientSearch).then(results => { if (!cancelled) setPatientResults(results); }).catch(console.error); }, 300);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [patientSearch]);

    const handleItemSearch = (query: string) => setItemSearch(query);
    useEffect(() => {
        let cancelled = false;
        setItemResults([]);
        const timer = setTimeout(() => { searchPriceItems(itemSearch).then(results => { if (!cancelled) setItemResults(results); }).catch(console.error); }, 300);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [itemSearch]);

    const selectPatient = (patient: Patient) => {
        setSelectedPatient(patient);
        setPatientSearch('');
        setPatientResults([]);
    };

    const addItem = async (item: PriceListItem) => {
        let availableStock: number | undefined = undefined;
        let inventoryItemId: string | undefined;
        try {
            // Check inventory for stock level
            const inventorySnapshot = await db.collection('inventory').where('name', '==', item.name).limit(1).get();
            if (!inventorySnapshot.empty) {
                availableStock = inventorySnapshot.docs[0].data().quantity;
                inventoryItemId = inventorySnapshot.docs[0].id;
            }
        } catch (e) {
            console.error("Error fetching stock:", e);
        }

        const newItem: ExtendedBillItem = {
            id: item.id!,
            description: item.name,
            quantity: 1,
            unitPrice: item.unitPrice,
            totalPrice: item.unitPrice,
            availableStock: availableStock,
            department: item.department,
            ...(inventoryItemId ? { inventoryItemId } : {})
        };
        setBillItems([...billItems, newItem]);
        setItemSearch('');
        setItemResults([]);
    };

    const updateItemQuantity = (index: number, quantity: number) => {
        const updatedItems = [...billItems];
        if (quantity > 0) {
            updatedItems[index].quantity = quantity;
            updatedItems[index].totalPrice = quantity * updatedItems[index].unitPrice;
            setBillItems(updatedItems);
        }
    };

    const removeItem = (index: number) => {
        setBillItems(billItems.filter((_, i) => i !== index));
    };

    const totalBill = useMemo(() => billItems.reduce((sum, item) => sum + item.totalPrice, 0), [billItems]);
    
    // Validation Check
    const hasInvalidQuantities = useMemo(() => {
        return billItems.some(item => item.availableStock !== undefined && item.quantity > item.availableStock);
    }, [billItems]);

    const resetBilling = () => {
        setSelectedPatient(null);
        setBillItems([]);
    };

    const handleBillOnCredit = () => {
        if (billItems.length === 0) {
            addNotification('Cannot create an empty bill.', 'warning');
            return;
        }
        setCreditModalOpen(true);
    };

    const confirmBillOnCredit = async () => {
        if (!selectedPatient || !userProfile) {
            addNotification('Patient or user not found.', 'error');
            return;
        }
        setCreditLoading(true);

        const cleanItems: BillItem[] = billItems.map(item => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            ...(item.inventoryItemId ? { inventoryItemId: item.inventoryItemId } : {}),
            ...(item.department ? { department: item.department } : {}),
        }));

        const billData = {
            patientId: selectedPatient.id!,
            patientName: `${selectedPatient.name} ${selectedPatient.surname}`,
            patientHospitalNumber: selectedPatient.hospitalNumber,
            pharmacyTotal: cleanItems.filter(item => item.inventoryItemId || item.department === 'Pharmacy').reduce((total, item) => total + item.totalPrice, 0),
            pharmacyQuantity: cleanItems.filter(item => item.inventoryItemId || item.department === 'Pharmacy').reduce((total, item) => total + item.quantity, 0),
            items: cleanItems,
            dispensingStatus: cleanItems.some(item => item.inventoryItemId || item.department === 'Pharmacy') ? 'Pending' as const : 'Complete' as const,
            patientSearchPrefixes: searchPrefixes(selectedPatient.name, selectedPatient.surname, selectedPatient.hospitalNumber),
            totalBill,
            amountPaidAtTimeOfBill: 0,
            balance: totalBill,
            paymentMethod: 'Credit' as const,
            date: new Date().toISOString(),
            processedBy: userProfile.id,
            status: 'Unpaid' as const,
        };

        try {
            const batch = db.batch();

            const billRef = db.collection('bills').doc();
            batch.set(billRef, billData);

            const patientRef = db.collection('patients').doc(selectedPatient.id!);
            batch.update(patientRef, {
                'financials.totalBill': firebase.firestore.FieldValue.increment(totalBill),
                'financials.balance': firebase.firestore.FieldValue.increment(totalBill),
            });

            // Pharmacy dispensing records the physical stock movement.

            await batch.commit();
            invalidateReads();
            addNotification('Bill successfully added to patient account on credit.', 'success');
            resetBilling();
            setCreditModalOpen(false);

        } catch (error) {
            console.error("Error billing on credit:", error);
            addNotification('Failed to bill on credit.', 'error');
        } finally {
            setCreditLoading(false);
        }
    };


    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-6">Billing & Invoicing</h1>
            
            {!selectedPatient ? (
                <div className="bg-[#161B22] border border-gray-700 p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold text-sky-400 mb-4">Find Patient to Bill</h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input type="text" placeholder="Search by name or surname..." value={patientSearch} onChange={e => handlePatientSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                        {patientResults.length > 0 && (
                            <ul className="absolute z-10 w-full bg-gray-900 border border-gray-600 rounded-md mt-1 shadow-lg max-h-60 overflow-auto">
                                {patientResults.map(p => (
                                    <li key={p.id} onClick={() => selectPatient(p)} className="cursor-pointer select-none relative py-2 px-4 text-white hover:bg-sky-700">
                                        <span className="font-normal block truncate">{p.name} {p.surname} - {p.hospitalNumber}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            ) : (
                <div className="bg-[#161B22] border border-gray-700 p-6 rounded-lg shadow-md">
                    {/* Patient Info Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start mb-6 pb-4 border-b border-gray-700 gap-4">
                        <div>
                            <h2 className="text-2xl font-bold text-white">{selectedPatient.name} {selectedPatient.surname}</h2>
                            <p className="text-sm text-gray-400">Hospital No: {selectedPatient.hospitalNumber} | Age: {selectedPatient.age}</p>
                        </div>
                        <div className="flex items-center gap-4">
                           <Link to={`/patients/${selectedPatient.id}`} className="flex items-center justify-center gap-2 text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-md">
                             <User size={16} /> View Full Profile
                           </Link>
                           <button onClick={resetBilling} className="text-sm text-sky-500 hover:underline">Change Patient</button>
                        </div>
                    </div>

                    {/* Itemized List Table */}
                    <div className="overflow-x-auto mb-4 bg-gray-900/50 rounded-lg border border-gray-700">
                        <table className="w-full text-sm text-left text-gray-400">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-800 border-b border-gray-700">
                                <tr>
                                    <th className="px-4 py-3 w-2/5">Description</th>
                                    <th className="px-4 py-3 w-1/6 text-center">Qty</th>
                                    <th className="px-4 py-3 w-1/6 text-right">Unit Price</th>
                                    <th className="px-4 py-3 w-1/6 text-right">Total Price</th>
                                    <th className="px-4 py-3 w-auto text-center"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {billItems.map((item, index) => {
                                    const isOverStock = item.availableStock !== undefined && item.quantity > item.availableStock;
                                    return (
                                        <tr key={index} className="hover:bg-gray-800/50">
                                            <td className="px-4 py-3 font-medium text-white">{item.description}</td>
                                            <td className="px-4 py-3 relative">
                                                <div className="flex flex-col items-center">
                                                    {isOverStock && (
                                                        <span className="text-[10px] font-bold text-red-400 mb-1 animate-pulse">
                                                            Max: {item.availableStock}
                                                        </span>
                                                    )}
                                                    <input 
                                                        type="number" 
                                                        value={item.quantity} 
                                                        min="1" 
                                                        onChange={e => updateItemQuantity(index, parseInt(e.target.value) || 1)}
                                                        className={`w-20 text-center rounded-md border text-white shadow-sm focus:ring-opacity-50 sm:text-sm mx-auto block transition-colors ${isOverStock ? 'border-red-500 bg-red-900/20 focus:border-red-500 focus:ring-red-500' : 'border-gray-600 bg-gray-800 focus:border-sky-500 focus:ring-sky-500'}`}
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">${item.unitPrice.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-white">${item.totalPrice.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-center">
                                                <button onClick={() => removeItem(index)} className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-900/20"><X size={18} /></button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {billItems.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                            No items added to bill yet. Use the search below to add services or products.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    
                    {/* Add Item Search */}
                    <div className="relative mb-6">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input type="text" placeholder="Search for a service or product to add..." value={itemSearch} onChange={e => handleItemSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                        {itemResults.length > 0 && (
                            <ul className="absolute z-20 w-full bg-gray-900 border border-gray-600 rounded-md mt-1 shadow-lg max-h-60 overflow-auto">
                                {itemResults.map(item => (
                                    <li key={item.id} onClick={() => addItem(item)} className="cursor-pointer select-none relative py-3 px-4 text-white hover:bg-sky-700 border-b border-gray-800 last:border-0">
                                        <div className="flex justify-between">
                                            <span className="font-normal block truncate">{item.name}</span>
                                            <span className="text-sky-300 font-bold">${item.unitPrice.toFixed(2)}</span>
                                        </div>
                                        <span className="text-xs text-gray-500 block">{item.department}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Financial Summary */}
                     <div className="flex justify-end mt-6">
                        <div className="w-full max-w-sm bg-gray-800 p-4 rounded-lg border border-gray-700">
                            <div className="flex justify-between text-2xl">
                                <span className="font-bold text-sky-400">Total Bill:</span>
                                <span className="font-extrabold text-white">${totalBill.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Error Message if Stock Invalid */}
                    {hasInvalidQuantities && (
                        <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded flex items-center justify-end text-red-300 text-sm">
                            <AlertCircle size={16} className="mr-2" />
                            <span>Cannot proceed. Quantity exceeds available stock for one or more items.</span>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="mt-8 flex justify-end space-x-4">
                        <button 
                            onClick={handleBillOnCredit} 
                            disabled={billItems.length === 0 || hasInvalidQuantities}
                            className="inline-flex items-center justify-center py-2 px-6 border border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <CreditCard className="mr-2" size={20} />
                            Bill on Credit
                        </button>
                        <button onClick={() => setPaymentModalOpen(true)} disabled={billItems.length === 0 || hasInvalidQuantities}
                            className="inline-flex items-center justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                            <DollarSign className="mr-2" size={20} />
                            Proceed to Payment
                        </button>
                    </div>
                </div>
            )}
             {selectedPatient && (
                <PaymentModal
                    isOpen={isPaymentModalOpen}
                    onClose={() => setPaymentModalOpen(false)}
                    totalBill={totalBill}
                    billItems={billItems} // Will pass as ExtendedBillItem[] but PaymentModal takes BillItem[] which is compatible
                    patient={selectedPatient}
                    onSuccess={resetBilling}
                />
            )}
             <Modal isOpen={isCreditModalOpen} onClose={() => setCreditModalOpen(false)} title="Confirm Bill on Credit">
                <p className="text-gray-400">
                    Are you sure you want to add this bill of <span className="font-bold text-white">${totalBill.toFixed(2)}</span> to the patient's account on credit?
                </p>
                <div className="mt-6 flex justify-end space-x-4">
                    <button onClick={() => setCreditModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
                    <button onClick={confirmBillOnCredit} disabled={creditLoading} className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50">
                        {creditLoading ? 'Processing...' : 'Confirm'}
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default Billing;
