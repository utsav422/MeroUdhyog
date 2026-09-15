'use client';

import { useEffect, useMemo, useState } from 'react';
import { Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import { apiClient } from '@/lib/api-client';
import { LoadingState, ErrorState } from '@/components/shared';

export default function PdfViewerWindow({ url }: { url: string }) {
  const [file, setFile] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  const fileUrl = useMemo(() => {
    if (!file) return '';
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getBlob(url)
      .then((blob) => {
        if (!cancelled) setFile(blob);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the PDF. Please try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) return <ErrorState message={error} />;
  if (!file) return <LoadingState label="Loading PDF…" />;

  return (
    <div className="h-[calc(100vh-12rem)] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 shadow-sm">
      <Worker workerUrl="/pdf.worker.min.js">
        <Viewer fileUrl={fileUrl} plugins={[defaultLayoutPluginInstance]} />
      </Worker>
    </div>
  );
}