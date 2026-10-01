'use client';

import dynamic from 'next/dynamic';

const PdfViewerWindow = dynamic(() => import('./PdfViewerWindow'), {
  ssr: false,
  loading: () => null,
});

export default function PdfViewer({ url, containerClass }: { url: string; containerClass?: string }) {
  return <PdfViewerWindow key={url} url={url} containerClass={containerClass} />;
}