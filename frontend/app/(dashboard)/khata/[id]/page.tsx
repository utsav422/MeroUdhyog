'use client';

import { useParams } from 'next/navigation';
import CustomerKhataDetail from '@/features/khata/components/CustomerKhataDetail';

export default function Page() {
  const params = useParams<{ id: string }>();
  return <CustomerKhataDetail customerId={params.id} />;
}