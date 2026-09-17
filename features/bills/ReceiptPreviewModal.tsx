import React, { useRef } from 'react';
import Modal from '../../components/utils/Modal';
import { Bill } from '../../types';
import { Printer } from 'lucide-react';

const ReceiptPreviewModal: React.FC<{ isOpen: boolean; onClose: () => void; bill: Bill }> = ({ isOpen, onClose, bill }) => {
    const receipt = useRef<HTMLDivElement>(null);
    const print = () => {
        const popup = window.open('', '_blank', 'width=480,height=700');
        if (!popup || !receipt.current) return;
        popup.document.write('<!doctype html><html><head><title>Receipt</title><style>body{font:14px Arial;max-width:360px;margin:24px auto}table{width:100%;border-collapse:collapse}td,th{padding:8px 0;border-bottom:1px solid #ddd;text-align:left}td:last-child,th:last-child{text-align:right}h2{text-align:center}</style></head><body>' + receipt.current.innerHTML + '</body></html>');
        popup.document.close();
        popup.focus();
        popup.print();
    };
    return <Modal isOpen={isOpen} onClose={onClose} title="Receipt Preview">
        <div ref={receipt} className="rounded bg-white p-5 text-gray-900">
            <h2 className="mb-4 text-center text-lg font-bold">Maranatha-Sapphire</h2>
            <p>{bill.patientName} · {bill.patientHospitalNumber}</p>
            <p className="mb-4 text-sm">{new Date(bill.date).toLocaleString()}</p>
            <table className="w-full text-sm"><thead><tr><th className="text-left">Item</th><th>Qty</th><th className="text-right">Amount</th></tr></thead><tbody>{bill.items.map((item, index) => <tr key={index}><td className="py-2">{item.description}</td><td className="text-center">{item.quantity}</td><td className="text-right">${item.totalPrice.toFixed(2)}</td></tr>)}</tbody></table>
            <hr className="my-4" /><p>Total: ${bill.totalBill.toFixed(2)}</p><p>Paid: ${bill.amountPaidAtTimeOfBill.toFixed(2)}</p><p>Balance: ${bill.balance.toFixed(2)}</p><p className="mt-3 text-sm">{bill.paymentMethod} · {bill.status}</p>
        </div>
        <button onClick={print} className="mt-4 inline-flex items-center gap-2 rounded bg-sky-600 px-4 py-2 text-white"><Printer size={16} /> Print Receipt</button>
    </Modal>;
};
export default ReceiptPreviewModal;
