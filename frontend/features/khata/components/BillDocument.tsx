'use client';

import type { BillDocType, BillLayout, BillLayoutBlock } from '../api';
import { formatDate, formatMoney, formatPriceUnit } from '@/lib/format';

export type BillBranding = {
  business_name: string;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  footer_note: string | null;
};

export type BillDocumentItem = {
  name: string;
  quantity: string;
  unit: string | null;
  unit_price: string;
  amount: string;
};

export type BillDocumentAllocation = {
  ref: string;
  amount: string;
};

export type BillDocumentData = {
  number: string;
  date: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  status: string | null;
  payment_status: string | null;
  note: string | null;
  collected_by: string | null;
  method: string | null;
  items: BillDocumentItem[];
  allocations: BillDocumentAllocation[];
  total_amount: string | null;
  amount_paid: string | null;
};

const ALIGN_CN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

const ALIGN_FLEX = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
} as const;

function BlockView({
  block,
  docType,
  branding,
  logo,
  signature,
  data,
}: {
  block: BillLayoutBlock;
  docType: BillDocType;
  branding: BillBranding;
  logo: string | null;
  signature: string | null;
  data: BillDocumentData;
}) {
  const { id, align } = block;

  if (id === 'branding') {
    return (
      <div className={`flex items-start gap-3 ${ALIGN_FLEX[align] ?? ALIGN_FLEX.left}`}>
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt="Logo"
            className="h-10 w-10 shrink-0 rounded-lg object-contain"
            referrerPolicy="no-referrer"
          />
        )}
        <div className="text-zinc-800">
          <p className="text-sm font-bold leading-tight">{branding.business_name || 'My Business'}</p>
          {branding.tax_id && <p className="text-zinc-400">PAN/VAT: {branding.tax_id}</p>}
          {branding.address && <p className="text-zinc-400">{branding.address}</p>}
          {branding.phone && <p className="text-zinc-400">Tel: {branding.phone}</p>}
          {branding.email && <p className="text-zinc-400">{branding.email}</p>}
        </div>
      </div>
    );
  }

  if (id === 'document_meta') {
    return (
      <div className={`flex items-center justify-between ${ALIGN_CN[align] ?? ALIGN_CN.left}`}>
        <span className="font-medium text-zinc-800">
          {docType === 'receipt' ? 'Receipt' : 'Invoice'} no: <b>{data.number || '—'}</b>
        </span>
        <span className="text-zinc-500">
          Date: <b>{data.date || '—'}</b>
        </span>
      </div>
    );
  }

  if (id === 'customer') {
    if (!data.customer_name && !data.customer_phone && !data.customer_address) return null;
    return (
      <div className={ALIGN_CN[align] ?? ALIGN_CN.left}>
        <p className="font-semibold text-zinc-800">
          {docType === 'invoice' ? 'Bill to' : 'Customer'}
        </p>
        {data.customer_name && <p className="mt-0.5 font-medium text-zinc-800">{data.customer_name}</p>}
        {data.customer_phone && <p className="text-zinc-500">Tel: {data.customer_phone}</p>}
        {data.customer_address && <p className="text-zinc-500">{data.customer_address}</p>}
      </div>
    );
  }

  if (id === 'order_status') {
    if (!data.status && !data.payment_status) return null;
    return (
      <div className={ALIGN_CN[align] ?? ALIGN_CN.left}>
        <p className="text-zinc-800">
          {data.status && (
            <>
              Order status: <b>{data.status}</b>
            </>
          )}
          {data.status && data.payment_status ? ' · ' : ''}
          {data.payment_status && (
            <>
              Payment: <b>{data.payment_status}</b>
            </>
          )}
        </p>
      </div>
    );
  }

  if (id === 'items') {
    if (docType === 'invoice') {
      if (data.items.length === 0) return null;
      return (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#1b4332] text-white">
                <th className="px-2 py-1.5 text-xs">Item</th>
                <th className="px-2 py-1.5 text-right text-xs">Qty</th>
                <th className="px-2 py-1.5 text-right text-xs">Unit</th>
                <th className="px-2 py-1.5 text-right text-xs">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row, i) => (
                <tr key={i} className="border-t border-zinc-100">
                  <td className="px-2 py-1.5 font-medium text-zinc-800">{row.name}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-600">{row.quantity}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-600">
                    {formatPriceUnit(row.unit_price, row.unit)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium text-zinc-800">
                    {formatMoney(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (data.allocations.length === 0) return null;
    return (
      <div className="mt-2">
        <p className="mb-1 font-semibold text-zinc-800">Applied to orders</p>
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-zinc-100">
                <th className="px-2 py-1.5 text-xs">Order</th>
                <th className="px-2 py-1.5 text-right text-xs">Applied amount</th>
              </tr>
            </thead>
            <tbody>
              {data.allocations.map((a, i) => (
                <tr key={i} className="border-t border-zinc-100">
                  <td className="px-2 py-1.5 font-medium text-zinc-800">{a.ref}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-600">{formatMoney(a.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (id === 'totals') {
    if (docType === 'invoice') {
      if (!data.total_amount) return null;
      return (
        <div className={`flex flex-col gap-1 text-sm ${ALIGN_CN[align] ?? ALIGN_CN.left}`}>
          <div className="flex justify-between">
            <span className="text-zinc-600">Total</span>
            <span className="font-semibold text-zinc-800">{formatMoney(data.total_amount)}</span>
          </div>
          {data.amount_paid && (
            <div className="flex justify-between">
              <span className="text-zinc-600">Amount paid</span>
              <span className="text-zinc-500">{formatMoney(data.amount_paid)}</span>
            </div>
          )}
        </div>
      );
    }

    if (!data.total_amount) return null;
    return (
      <div
        className={`overflow-hidden rounded-lg border border-zinc-200 bg-green-50/70 ${ALIGN_CN[align] ?? ALIGN_CN.left}`}
      >
        <div className="grid grid-cols-3 gap-2 px-3 py-1.5">
          <p className="text-xs font-semibold uppercase text-zinc-500">Amount Paid</p>
          <p className="text-xs font-semibold uppercase text-zinc-500">Method</p>
          <p className="text-xs font-semibold uppercase text-zinc-500">Collected</p>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-zinc-200 px-3 py-2.5">
          <p className="text-base font-bold text-zinc-800">{formatMoney(data.total_amount)}</p>
          <p className="text-zinc-600">{data.method || '—'}</p>
          <p className="text-zinc-600">{data.date || '—'}</p>
        </div>
      </div>
    );
  }

  if (id === 'notes') {
    return (
      <div className="text-zinc-600">
        {data.note ? <p>Note: {data.note}</p> : null}
        {data.collected_by ? (
          <p className="mt-1 text-xs text-zinc-400">Collected by: {data.collected_by}</p>
        ) : null}
      </div>
    );
  }

  if (id === 'footer_note') {
    if (!branding.footer_note) return null;
    return <p className="text-center text-xs italic text-zinc-400">{branding.footer_note}</p>;
  }

  if (id === 'signature') {
    if (!signature) return null;
    return (
      <div className={`mt-2 flex items-end gap-2 ${ALIGN_FLEX[align] ?? ALIGN_FLEX.left}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={signature}
          alt="Signature"
          className="h-8 w-32 rounded border border-zinc-200 object-contain object-bottom"
          referrerPolicy="no-referrer"
        />
        <span className="text-xs text-zinc-400">Authorized signature</span>
      </div>
    );
  }

  return null;
}

/**
 * Renders an invoice or receipt exactly the way the generated PDF does:
 * same block order, same enabled flags and same alignment, driven by the
 * saved layout. Use `BillPreview` when you need the sample-data version.
 */
export default function BillDocument({
  docType,
  branding,
  logo,
  signature,
  layout,
  data,
}: {
  docType: BillDocType;
  branding: BillBranding;
  logo: string | null;
  signature: string | null;
  layout: BillLayout;
  data: BillDocumentData;
}) {
  const visible = layout.blocks.filter((b) => b.enabled[docType]);

  return (
    <div className="w-full max-w-[520px] rounded-xl bg-white p-5 pb-6 shadow-md ring-1 ring-zinc-200 text-[11px] leading-relaxed">
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
            branding={branding}
            logo={logo}
            signature={signature}
            data={data}
          />
        ))}
      </div>

      <div className="mt-4 pt-2 text-center text-[10px] text-zinc-400">
        This is a computer-generated document issued by FactoryCRM.
      </div>
    </div>
  );
}

export function toBillDocumentDate(value: string | null | undefined): string {
  return value ? formatDate(value) : '—';
}
