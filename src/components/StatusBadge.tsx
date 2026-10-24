import React from 'react';
import { PaymentStatus } from '../types/billing';

export function StatusBadge({ status }: { status: PaymentStatus }) {
  const styles: Record<PaymentStatus, string> = {
    Paid: 'bg-alif-black text-white border-black',
    'Partially Paid': 'bg-stone-50 text-alif-black border-alif-charcoal',
    Unpaid: 'bg-white text-alif-charcoal border-zinc-400',
    Cancelled: 'bg-white text-alif-grey border-zinc-300 border-dashed line-through'
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider border ${
        styles[status] || styles.Unpaid
      }`}
    >
      {status}
    </span>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border-2 border-black max-w-md w-full p-5 sm:p-6 space-y-5">
        <div className="space-y-2">
          <div className="editorial-label">Confirmation Required</div>
          <h3 className="text-base font-semibold uppercase tracking-wider text-alif-black">
            {title}
          </h3>
          <p className="text-sm text-alif-charcoal leading-relaxed">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-alif-border">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold uppercase tracking-wider border border-alif-charcoal bg-white text-alif-charcoal hover:border-black min-h-[44px]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white min-h-[44px] ${
              danger ? 'bg-alif-charcoal hover:bg-black' : 'bg-alif-black hover:bg-zinc-800'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
