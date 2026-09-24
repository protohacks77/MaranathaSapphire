import React from 'react';
import Modal from '../../components/utils/Modal';
import { Bill } from '../../types';
import BillDocument from './BillDocument';
import BillDocumentActions from './BillDocumentActions';

const ReceiptPreviewModal: React.FC<{ isOpen: boolean; onClose: () => void; bill: Bill }> = ({ isOpen, onClose, bill }) => <Modal isOpen={isOpen} onClose={onClose} title="Receipt Preview" size="lg">
    <div className="mb-4 flex justify-end"><BillDocumentActions bill={bill} receipt /></div>
    <div className="max-h-[65vh] overflow-y-auto"><BillDocument bill={bill} receipt /></div>
</Modal>;
export default ReceiptPreviewModal;
