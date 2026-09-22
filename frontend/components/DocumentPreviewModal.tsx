'use client';

import { X } from 'lucide-react';

interface DocumentPreviewModalProps {
  documentUrl: string;
  libelle: string;
  onClose: () => void;
}

export function DocumentPreviewModal({ documentUrl, libelle, onClose }: DocumentPreviewModalProps) {
  const isPdf = documentUrl.toLowerCase().endsWith('.pdf');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-title"
    >
      <div
        className="relative max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
          <h2 id="preview-title" className="text-white font-semibold">
            {libelle}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition"
            aria-label="Close preview"
          >
            <X size={20} className="text-gray-300" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-gray-900 flex items-center justify-center">
          {isPdf ? (
            <iframe
              src={documentUrl}
              className="w-full h-full border-none"
              title={libelle}
            />
          ) : (
            <img
              src={documentUrl}
              alt={libelle}
              className="max-w-full max-h-full object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}
