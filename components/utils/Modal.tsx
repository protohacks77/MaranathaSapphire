
import React, { Fragment } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;

  const sizeClasses = {
    md: 'max-w-md',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 no-print"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="fixed inset-0" 
        onClick={onClose}
        aria-hidden="true"
      ></div>

      <div className={`relative w-full ${sizeClasses[size]} mx-4 bg-[#161B22] rounded-lg shadow-xl border border-gray-700 transform transition-all`}>
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <h3 id="modal-title" className="text-lg font-semibold text-white">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 rounded-full hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-sky-500"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;