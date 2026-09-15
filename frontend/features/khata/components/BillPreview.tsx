'use client';

import type { BillLayout, BillLayoutBlock } from '../api';

const INVOICE_SAMPLE = {
  number: 'INV-101',
  date: '12 Sep 2026',
  customer_name: 'Hari Bahadur',
  customer_phone: '9841234567',
  customer_address: 'Balaju, Kathmandu',
  status: 'Confirmed',
  payment_status: 'Partial',
  total_amount: '2,000.00',
  amount_paid: '1,000.00',
  items: [
    { name: 'Soy Sauce / pcs', qty: '10', unit_price: '200.00', amount: '2,000.00' },
    { name: 'Chilli Sauce / pcs', qty: '5', unit_price: '150.00', amount: '750.00' },
  ],
};

const RECEIPT_SAMPLE = {
  number: 'RCT-101',
  date: '12 Sep 2026',
  customer_name: 'Hari Bahadur',
  customer_phone: '9841234567',
  customer_address: 'Balaju, Kathmandu',
  amount: '1,500.00',
  method: 'Cash',
  date_collected: '12 Sep 2026',
  collector: 'Ram Karki',
  allocations: [
    { ref: 'ORD-0042', amount: '1,000.00' },
    { ref: 'ORD-0043', amount: '500.00' },
  ],
};

const ALIGN_CN = { left: 'text-left', center: 'text-center', right: 'text-right' } as Record<string, string>;

const ALIGN_FLEX = { left: 'justify-start', center: 'justify-center', right: 'justify-end' } as Record<string, string>;

function BlockView({
  block,
  docType,
  draft,
  logo,
  signature,
}: {
  block: BillLayoutBlock;
  docType: 'invoice' | 'receipt';
  draft: { business_name: string; tax_id: string | null; address: string | null; phone: string | null; email: string | null; footer_note: string | null; invoice_number_prefix: string; receipt_number_prefix: string; next_invoice_number: number; next_receipt_number: number };
  logo: string | null;
  signature: string | null;
}) {
  const { id, align } = block;

  if (id === 'branding') {
    const hasLogo = !!logo;
    return (
      <div className={`flex items-start gap-3 ${ALIGN_FLEX[align]}`}>
        {hasLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="Logo" className="h-10 w-10 shrink-0 rounded-lg object-contain" referrerPolicy="no-referrer" />
        )}
        <div className="text-zinc-800">
          <p className="text-sm font-bold leading-tight">{draft.business_name || 'My Business'}</p>
          {draft.tax_id && <p className="text-zinc-400">PAN/VAT: {draft.tax_id}</p>}
          {draft.address && <p className="text-zinc-400">{draft.address}</p>}
          {draft.phone && <p className="text-zinc-400">Tel: {draft.phone}</p>}
          {draft.email && <p className="text-zinc-400">{draft.email}</p>}
        </div>
      </div>
    );
  }

  if (id === 'document_meta') {
    const number = docType === 'invoice'
      ? `${draft.invoice_number_prefix}${draft.next_invoice_number}`
      : `${draft.receipt_number_prefix}${draft.next_receipt_number}`;
    return (
      <div className={`flex items-center justify-between ${ALIGN_CN[align]}`}>
        <span className="font-medium text-zinc-800">{docType === 'receipt' ? 'Receipt' : 'Invoice'} no: <b>{number}</b></span>
        <span className="text-zinc-500">Date: <b>{docType === 'invoice' ? INVOICE_SAMPLE.date : RECEIPT_SAMPLE.date}</b></span>
      </div>
    );
  }

  if (id === 'customer') {
    const data = docType === 'invoice' ? INVOICE_SAMPLE : RECEIPT_SAMPLE;
    return (
      <div className={ALIGN_CN[align]}>
        <p className="font-semibold text-zinc-800">{docType === 'invoice' ? 'Bill to' : 'Customer'}</p>
        <p className="mt-0.5 font-medium text-zinc-800">{data.customer_name}</p>
        {data.customer_phone && <p className="text-zinc-500">Tel: {data.customer_phone}</p>}
        {data.customer_address && <p className="text-zinc-500">{data.customer_address}</p>}
      </div>
    );
  }

  if (id === 'order_status') {
    return (
      <div className={ALIGN_CN[align]}>
        <p className="text-zinc-800">
          Order status: <b>{INVOICE_SAMPLE.status}</b> · Payment: <b>{INVOICE_SAMPLE.payment_status}</b>
        </p>
      </div>
    );
  }

  if (id === 'items') {
    if (docType === 'invoice') {
      return (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#1b4332] text-white"><th className="px-2 py-1.5 text-xs">Item</th><th className="px-2 py-1.5 text-right text-xs">Qty</th><th className="px-2 py-1.5 text-right text-xs">Unit</th><th className="px-2 py-1.5 text-right text-xs">Amount</th></tr>
            </thead>
            <tbody>
              {INVOICE_SAMPLE.items.map((row, i) => (
                <tr key={i} className="border-t border-zinc-100"><td className="px-2 py-1.5 font-medium text-zinc-800">{row.name}</td><td className="px-2 py-1.5 text-right text-zinc-600">{row.qty}</td><td className="px-2 py-1.5 text-right text-zinc-600">{row.unit_price}</td><td className="px-2 py-1.5 text-right font-medium text-zinc-800">{row.amount}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return (
      <div className="mt-2">
        <p className="mb-1 font-semibold text-zinc-800">Applied to orders</p>
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-left">
            <thead><tr className="bg-zinc-100"><th className="px-2 py-1.5 text-xs">Order</th><th className="px-2 py-1.5 text-right text-xs">Applied amount</th></tr></thead>
            <tbody>
              {RECEIPT_SAMPLE.allocations.map((a, i) => (
                <tr key={i} className="border-t border-zinc-100"><td className="px-2 py-1.5 font-medium text-zinc-800">{a.ref}</td><td className="px-2 py-1.5 text-right text-zinc-600">{a.amount}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (id === 'totals') {
    if (docType === 'invoice') {
      return (
        <div className={`flex flex-col gap-1 text-sm ${ALIGN_CN[align]}`}>
          <div className="flex justify-between"><span className="text-zinc-600">Total</span><span className="font-semibold text-zinc-800">{INVOICE_SAMPLE.total_amount}</span></div>
          <div className="flex justify-between"><span className="text-zinc-600">Amount paid</span><span className="text-zinc-500">{INVOICE_SAMPLE.amount_paid}</span></div>
        </div>
      );
    }
    return (
      <div className={`overflow-hidden rounded-lg border border-zinc-200 bg-green-50/70 ${ALIGN_CN[align]}`}>
        <div className="grid grid-cols-3 gap-2 px-3 py-1.5">
          <p className="text-xs font-semibold uppercase text-zinc-500">Amount Paid</p>
          <p className="text-xs font-semibold uppercase text-zinc-500">Method</p>
          <p className="text-xs font-semibold uppercase text-zinc-500">Collected</p>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-zinc-200 px-3 py-2.5">
          <p className="text-base font-bold text-zinc-800">{RECEIPT_SAMPLE.amount}</p>
          <p className="text-zinc-600">{RECEIPT_SAMPLE.method}</p>
          <p className="text-zinc-600">{RECEIPT_SAMPLE.date_collected}</p>
        </div>
      </div>
    );
  }

  if (id === 'notes') {
    if (docType === 'receipt') {
      return (
        <div className="text-zinc-600">
          <p>Note: Advance from shop counter.</p>
          <p className="mt-1 text-xs text-zinc-400">Collected by: {RECEIPT_SAMPLE.collector}</p>
        </div>
      );
    }
    return <p className="text-zinc-600">Note: Monthly order for Balaju branch.</p>;
  }

  if (id === 'footer_note') {
    if (!draft.footer_note) return null;
    return <p className="text-center text-xs italic text-zinc-400">{draft.footer_note}</p>;
  }

  if (id === 'signature') {
    if (!signature) return null;
    return (
      <div className={`mt-2 flex items-end gap-2 ${ALIGN_FLEX[align]}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={signature} alt="Signature" className="h-8 w-32 rounded border border-zinc-200 object-contain object-bottom" referrerPolicy="no-referrer" />
        <span className="text-xs text-zinc-400">Authorized signature</span>
      </div>
    );
  }

  return null;
}

export default function BillPreview({
  docType,
  draft,
  logo,
  signature,
  layout,
}: {
  docType: 'invoice' | 'receipt';
  draft: {
    business_name: string;
    tax_id: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    footer_note: string | null;
    invoice_number_prefix: string;
    receipt_number_prefix: string;
    next_invoice_number: number;
    next_receipt_number: number;
  };
  logo: string | null;
  signature: string | null;
  layout: BillLayout;
}) {
  const visible = layout.blocks.filter((b) => b.enabled[docType]);
  return (
    <div className="w-full max-w-[420px] rounded-xl bg-white p-5 pb-6 shadow-md ring-1 ring-zinc-200 text-[11px] leading-relaxed">
      <div className="mb-3 flex items-center rounded-lg bg-[#1b4332] px-3 py-2">
        <span className="text-xs font-bold text-white">
          {docType === 'receipt' ? 'Payment Receipt' : 'Invoice'}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {visible.map((block) => (
          <BlockView
            key={block.id}
            block={block}
            docType={docType}
            draft={draft}
            logo={logo}
            signature={signature}
          />
        ))}
      </div>

      <div className="mt-4 pt-2 text-center text-[10px] text-zinc-400">
        This is a computer-generated document issued by FactoryCRM.
      </div>
    </div>
  );
}