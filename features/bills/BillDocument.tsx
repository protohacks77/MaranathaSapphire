import React from 'react';
import { Bill } from '../../types';
import { billDocumentPages } from '../../services/billDocument';

export default function BillDocument({ bill, receipt = false }: { bill: Bill; receipt?: boolean }) {
    return <div className="bill-document space-y-5 mx-auto max-w-[900px]" aria-label={receipt ? 'Receipt preview' : 'Invoice preview'}>
        {billDocumentPages(bill, receipt).map((page, index) => <div key={index} className="bill-document-page overflow-hidden rounded-lg shadow-lg [&>svg]:w-full [&>svg]:h-auto" dangerouslySetInnerHTML={{ __html: page }} />)}
    </div>;
}
