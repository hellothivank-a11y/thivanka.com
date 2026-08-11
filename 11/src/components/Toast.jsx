import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const isError = toast.type === 'error';

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-[#161b22]/95 border border-white/10 backdrop-blur-md shadow-2xl transition-all duration-300 animate-slide-up">
      {isError ? (
        <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
      ) : (
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
      )}
      <p className="text-sm font-medium text-gray-200">{toast.message}</p>
      <button
        onClick={onClose}
        className="ml-2 text-gray-400 hover:text-white transition-colors p-1"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
