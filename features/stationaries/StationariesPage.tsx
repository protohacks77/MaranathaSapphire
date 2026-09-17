import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types';
import { Search, Plus, FileText, Download, Printer, FileCheck, FileOutput } from 'lucide-react';

interface Document {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const mockDocuments: Document[] = [
  { id: 'med-exam', name: 'Medical Examination Form', description: 'Standard physical examination record for general admissions.', icon: <FileCheck /> },
  { id: 'med-cert', name: 'Medical Certificate', description: 'Official sick leave or fitness certificate for patients.', icon: <FileText /> },
  { id: 'consent', name: 'Consent Form', description: 'Patient agreement form for surgical or invasive procedures.', icon: <FileOutput /> },
];

const StationariesPage: React.FC = () => {
  const { userProfile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const canAddDocuments = userProfile?.role === Role.Admin;

  const filteredDocuments = useMemo(() => {
    if (!searchQuery) return mockDocuments;
    return mockDocuments.filter(doc =>
      doc.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const generateAndPrintDocument = (docName: string) => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${docName}</title>
            <style>
              body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #333; }
              .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 40px; }
              .header h1 { margin: 0; font-size: 28px; color: #000; text-transform: uppercase; }
              .header p { margin: 5px 0; font-size: 14px; color: #555; }
              .content { border: 2px dashed #ccc; padding: 60px 40px; text-align: center; border-radius: 8px; background: #f9f9f9; }
              h2 { font-size: 24px; color: #2c3e50; margin-bottom: 20px; }
              .placeholder-text { font-size: 16px; line-height: 1.6; color: #666; }
              .company { font-weight: bold; color: #000; }
              @media print {
                .no-print { display: none; }
                body { margin: 0; }
                .content { border: 1px solid #ddd; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>RCZ Morgenster Hospital</h1>
              <p>Morgenster Mission, Masvingo, Zimbabwe</p>
              <p>Tel: +263 77 123 4567 | Email: info@morgensterhospital.co.zw</p>
            </div>
            <h2>${docName}</h2>
            <div class="content">
              <p class="placeholder-text">This document template is currently being integrated with our cloud storage system.</p>
              <p class="placeholder-text"><strong>BLACKGIFT TECH LABS</strong> and <strong>AlfaOctal Systems</strong> are working to bring you dynamic PDF generation.</p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
          printWindow.print();
          printWindow.close();
      }, 500);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h1 className="text-3xl font-bold text-white">Stationaries & Forms</h1>
            <p className="text-gray-400 mt-1">Access and print official hospital documentation.</p>
        </div>
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-lg bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          {canAddDocuments && (
            <button className="flex items-center justify-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors shadow-lg shadow-sky-900/20">
              <Plus size={18} />
              <span className="hidden sm:inline">Add New</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDocuments.map(doc => (
          <div key={doc.id} className="bg-[#161B22] border border-gray-700 rounded-xl p-6 hover:border-sky-500/50 hover:shadow-lg hover:shadow-sky-900/10 transition-all duration-300 group flex flex-col items-center text-center h-full">
            <div className="p-4 bg-gray-800 rounded-full text-sky-400 mb-4 group-hover:scale-110 group-hover:bg-sky-900/20 transition-all duration-300">
              {React.cloneElement(doc.icon as React.ReactElement<any>, { size: 32 })}
            </div>
            <h3 className="text-lg font-bold text-white mb-2">{doc.name}</h3>
            <p className="text-sm text-gray-400 mb-6 flex-grow">{doc.description}</p>
            
            <div className="flex gap-3 w-full mt-auto">
              <button
                onClick={() => generateAndPrintDocument(doc.name)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium rounded-lg transition-colors border border-gray-600"
                title="Download PDF"
              >
                <Download size={16} />
                <span className="hidden xl:inline">Download</span>
              </button>
              <button
                onClick={() => generateAndPrintDocument(doc.name)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors shadow-md shadow-sky-900/20"
                title="Print Document"
              >
                <Printer size={16} />
                Print
              </button>
            </div>
          </div>
        ))}
      </div>
      
       {filteredDocuments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 bg-[#161B22] border border-gray-700 rounded-xl text-center">
            <div className="p-4 bg-gray-800 rounded-full mb-4">
                <Search size={32} className="text-gray-500" />
            </div>
            <h3 className="text-lg font-semibold text-white">No documents found</h3>
            <p className="text-gray-400 mt-1">Try adjusting your search terms.</p>
          </div>
        )}
    </div>
  );
};

export default StationariesPage;