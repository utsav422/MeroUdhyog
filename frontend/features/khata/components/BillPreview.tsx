'use client';

import type { BillDocType, BillLayout } from '../api';
import { paymentMethodLabel } from '../constants';
import BillDocument, { toBillDocumentDate, type BillDocumentData } from './BillDocument';

const SAMPLE_DATE = '2026-09-12T12:00:00Z';

function invoiceSample(invoiceNumber: string): BillDocumentData {
  return {
    number: invoiceNumber,
    date: toBillDocumentDate(SAMPLE_DATE),
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
}

function receiptSample(receiptNumber: string): BillDocumentData {
  return {
    number: receiptNumber,
    date: toBillDocumentDate(SAMPLE_DATE),
    customer_name: 'Hari Bahadur',
    customer_phone: null,
    customer_address: null,
    status: null,
    payment_status: null,
    total_amount: '1500.00',
    amount_paid: null,
    note: 'Advance from shop counter.',
    collected_by: 'Ram Karki',
    method: paymentMethodLabel('cash'),
    items: [],
    allocations: [
      { ref: 'ORD-0042', amount: '1000.00' },
      { ref: 'ORD-0043', amount: '500.00' },
    ],
  };
}

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
  invoiceNumber,
  receiptNumber,
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
  invoiceNumber: string;
  receiptNumber: string;
}) {
  return (
    <BillDocument
      docType={docType}
      branding={branding}
      logo={logo}
      signature={signature}
      layout={layout}
      data={docType === 'invoice' ? invoiceSample(invoiceNumber) : receiptSample(receiptNumber)}
    />
  );
}
