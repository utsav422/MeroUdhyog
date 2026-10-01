'use client';

import type { BillDocType, BillLayout } from '../api';
import BillDocument, { type BillDocumentData } from './BillDocument';

const INVOICE_SAMPLE: BillDocumentData = {
  number: 'INV-101',
  date: '12 Sep 2026',
  customer_name: 'Hari Bahadur',
  customer_phone: '9841234567',
  customer_address: 'Balaju, Kathmandu',
  status: 'Confirmed',
  payment_status: 'Partial',
  total_amount: '2000.00',
  amount_paid: '1000.00',
  note: 'Monthly order for Balaju branch.',
  collected_by: null,
  method: null,
  items: [
    { name: 'Soy Sauce / pcs', quantity: '10', unit: 'pcs', unit_price: '200.00', amount: '2000.00' },
    { name: 'Chilli Sauce / pcs', quantity: '5', unit: 'pcs', unit_price: '150.00', amount: '750.00' },
  ],
  allocations: [],
};

const RECEIPT_SAMPLE: BillDocumentData = {
  number: 'RCT-101',
  date: '12 Sep 2026',
  customer_name: 'Hari Bahadur',
  customer_phone: '9841234567',
  customer_address: 'Balaju, Kathmandu',
  status: null,
  payment_status: null,
  total_amount: '1500.00',
  amount_paid: null,
  note: 'Advance from shop counter.',
  collected_by: 'Ram Karki',
  method: 'Cash',
  items: [],
  allocations: [
    { ref: 'ORD-0042', amount: '1000.00' },
    { ref: 'ORD-0043', amount: '500.00' },
  ],
};

/**
 * Settings preview: the live document renderer fed with sample data, so
 * what you see while designing is exactly what invoices/receipts look like.
 */
export default function BillPreview({
  docType,
  branding,
  logo,
  signature,
  layout,
}: {
  docType: BillDocType;
  branding: {
    business_name: string;
    tax_id: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    footer_note: string | null;
  };
  logo: string | null;
  signature: string | null;
  layout: BillLayout;
}) {
  return (
    <BillDocument
      docType={docType}
      branding={branding}
      logo={logo}
      signature={signature}
      layout={layout}
      data={docType === 'invoice' ? INVOICE_SAMPLE : RECEIPT_SAMPLE}
    />
  );
}
