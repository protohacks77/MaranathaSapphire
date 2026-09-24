
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../services/firebase';
import { Bill } from '../../types';
import PageSkeleton from '../../components/utils/SkeletonLoader';
import { useNotification } from '../../context/NotificationContext';
import { Printer, ArrowLeft } from 'lucide-react';
import ReceiptPreviewModal from './ReceiptPreviewModal';
import BillDocument from './BillDocument';
import BillDocumentActions from './BillDocumentActions';

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
                 <BillDocumentActions bill={bill} />
            </div>
        </div>
      
        <BillDocument bill={bill} />

        <ReceiptPreviewModal 
            isOpen={isReceiptModalOpen}
            onClose={() => setIsReceiptModalOpen(false)}
            bill={bill}
        />
    </div>
  );
};

export default BillDetails;
