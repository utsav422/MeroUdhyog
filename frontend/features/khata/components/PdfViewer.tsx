'use client';

import dynamic from 'next/dynamic';

const PdfViewerWindow = dynamic(() => import('./PdfViewerWindow'), {
  ssr: false,
  loading: () => null,
});

export default function PdfViewer({ url }: { url: string }) {
  return <PdfViewerWindow key={url} url={url} />;
}