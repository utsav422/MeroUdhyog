'use client';

import { Alert } from '@mantine/core';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import BillTemplateSettings from '@/features/khata/components/BillTemplateSettings';

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[bill-format] render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6">
          <Alert color="red" title={`Bill format failed to render: ${this.state.error.message}`}>
            {this.state.error.stack?.split('\n').slice(0, 4).join('\n')}
          </Alert>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Page() {
  return (
    <PageErrorBoundary>
      <BillTemplateSettings />
    </PageErrorBoundary>
  );
}