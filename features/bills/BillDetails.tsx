
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../services/firebase';
import { Bill } from '../../types';
import PageSkeleton from '../../components/utils/SkeletonLoader';
import { useNotification } from '../../context/NotificationContext';
import { Printer, ArrowLeft } from 'lucide-react';
import ReceiptPreviewModal from './ReceiptPreviewModal';

const BillDetails: React.FC = () => {
  const { billId } = useParams<{ billId: string }>();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  useEffect(() => {
    if (!billId) return;
    setLoading(true);
    const docRef = db.collection('bills').doc(billId);
    const unsubscribe = docRef.onSnapshot(doc => {
      if (doc.exists) {
        setBill({ id: doc.id, ...doc.data() } as Bill);
      } else if (!doc.metadata.fromCache) {
        addNotification('Bill not found.', 'error');
        navigate(-1);
      }
      setLoading(false);
    }, err => {
        addNotification('Failed to fetch bill details.', 'error');
        console.error(err);
        setLoading(false);
    });
    return unsubscribe;
  }, [billId, navigate, addNotification]);
  
  const handlePrintA4 = () => {
    if (!bill) return;

    const printElement = document.querySelector('.print-container');
    if (!printElement) {
        addNotification('Could not find invoice content to generate document.', 'error');
        return;
    }
    const printContents = printElement.innerHTML;

    // Define styles for a professional, printable Word document.
    const styles = `
        body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; }
        .print-container, div, p, span, h2, h3, th, td {
            background-color: white !important;
            color: black !important;
            border-color: #ccc !important;
        }
        table { width: 100%; border-collapse: collapse; }
        thead { background-color: #f2f2f2 !important; }
        th, td { padding: 8px; border: 1px solid #ccc !important; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .font-semibold { font-weight: 600; }
        .font-extrabold { font-weight: 800; }
        .text-sky-400, .text-green-400, .text-red-400 { color: black !important; }
        img { max-width: 64px; }
    `;

    // Create the full HTML for the Word doc.
    const sourceHTML = `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset='utf-8'>
                <title>Invoice - ${bill.id}</title>
                <style>${styles}</style>
            </head>
            <body>
                <div class="print-container">
                    ${printContents}
                </div>
            </body>
        </html>
    `;

    // Create a data URI and trigger the download.
    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    fileDownload.download = `invoice-${bill.patientHospitalNumber}-${bill.id}.doc`;
    fileDownload.click();
    document.body.removeChild(fileDownload);

    // As requested, also trigger the standard print dialog after initiating the download.
    addNotification('Word document downloading. Opening print dialog...', 'info');
    setTimeout(() => {
        window.print();
    }, 1000); // Delay to allow download to start.
  }

  const getStatusBadge = (status: Bill['status']) => {
    switch (status) {
        case 'Paid':
            return <span className="status-badge status-paid">Paid</span>;
        case 'Partially Paid':
            return <span className="status-badge status-partial">Partially Paid</span>;
        case 'Unpaid':
            return <span className="status-badge status-unpaid">On Credit</span>;
        default:
            return null;
    }
  }

  if (loading) return <PageSkeleton type="form" />;
  if (!bill) return null;

  return (
    <div>
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 no-print">
            <div className="flex items-center gap-4 self-start">
                 <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:bg-gray-700 rounded-full" aria-label="Go back">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-3xl font-bold text-white">Invoice Details</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                 <button onClick={() => setIsReceiptModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">
                    <Printer size={16} /> Print Receipt
                </button>
                 <button onClick={handlePrintA4} className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700">
                    <Printer size={16} /> Print/Download A4
                </button>
            </div>
        </div>
      
        <div className="bg-[#161B22] border border-gray-700 p-4 sm:p-8 rounded-lg shadow-md print-container">
            {/* Header */}
            <div className="flex flex-col-reverse sm:flex-row justify-between items-start sm:items-start pb-6 border-b border-gray-700 print-border gap-4">
                <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto justify-between sm:justify-start">
                    <h2 className="text-2xl sm:text-3xl font-bold text-white">INVOICE</h2>
                    {getStatusBadge(bill.status)}
                </div>
                <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3">
                    <p className="text-sm text-gray-400 sm:order-2 font-mono">ID: {bill.id?.slice(0, 8)}...</p>
                    <img src="/maranathalogo.png" alt="Logo" className="h-12 w-12 sm:h-16 sm:w-16 rounded-lg object-contain sm:ml-auto sm:order-1" />
                </div>
            </div>

            {/* Patient & Bill Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 my-6">
                <div>
                    <h3 className="text-sm font-semibold text-gray-400 uppercase">Bill To</h3>
                    <p className="text-lg font-bold text-white mt-1">{bill.patientName}</p>
                    <p className="text-gray-300">Hospital No: {bill.patientHospitalNumber}</p>
                </div>
                <div className="text-left sm:text-right">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase">Bill Date</h3>
                    <p className="text-lg font-medium text-white mt-1">{new Date(bill.date).toLocaleDateString()}</p>
                </div>
            </div>

            {/* Itemized List */}
            <div className="overflow-x-auto my-8 border border-gray-700 rounded-lg sm:border-0">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-700">
                        <tr>
                            <th className="px-4 py-3 w-3/5">Description</th>
                            <th className="px-4 py-3 text-center">Qty</th>
                            <th className="px-4 py-3 text-right">Unit Price</th>
                            <th className="px-4 py-3 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bill.items.map((item, index) => (
                            <tr key={index} className="border-b border-gray-700 print-border last:border-0">
                                <td className="px-4 py-3 font-medium text-white">{item.description}</td>
                                <td className="px-4 py-3 text-center">{item.quantity}</td>
                                <td className="px-4 py-3 text-right">${item.unitPrice.toFixed(2)}</td>
                                <td className="px-4 py-3 text-right font-semibold text-white">${item.totalPrice.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Financial Summary */}
            <div className="flex justify-end mt-8">
                <div className="w-full sm:max-w-xs space-y-3 bg-gray-800/50 p-4 rounded-lg sm:bg-transparent sm:p-0">
                    <div className="flex justify-between text-md">
                        <span className="font-medium text-gray-300">Subtotal:</span>
                        <span className="font-medium text-white">${bill.totalBill.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-md">
                        <span className="font-medium text-gray-300">Paid on this Bill:</span>
                        <span className="font-medium text-green-400">${bill.amountPaidAtTimeOfBill.toFixed(2)}</span>
                    </div>
                    <hr className="border-gray-600" />
                    <div className="flex justify-between text-xl">
                        <span className="font-bold text-sky-400">Balance Due:</span>
                        <span className={`font-extrabold ${bill.balance > 0 ? 'text-red-400' : 'text-green-400'}`}>${bill.balance.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-12 pt-6 border-t border-gray-700 print-border text-center text-xs text-gray-500">
                <p>Thank you for choosing Maranatha-Sapphire.</p>
                <p>Please make payments to the accounts office.</p>
            </div>
        </div>

        <ReceiptPreviewModal 
            isOpen={isReceiptModalOpen}
            onClose={() => setIsReceiptModalOpen(false)}
            bill={bill}
        />
    </div>
  );
};

export default BillDetails;
