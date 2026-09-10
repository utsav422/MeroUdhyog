'use client';

import { useParams } from 'next/navigation';
import { useCustomer } from '@/features/customers/api';
import CustomerForm from '@/features/customers/components/CustomerForm';
import { LoadingState, ErrorState } from '@/components/shared';

export default function EditCustomerPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useCustomer(params.id);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState retry={() => refetch()} />;
  if (!data) return null;

  return <CustomerForm customer={data} />;
}
