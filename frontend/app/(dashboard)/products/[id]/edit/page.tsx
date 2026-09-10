'use client';

import { useParams } from 'next/navigation';
import { useProduct } from '@/features/products/api';
import ProductForm from '@/features/products/components/ProductForm';
import { LoadingState, ErrorState } from '@/components/shared';

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useProduct(params.id);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState retry={() => refetch()} />;
  if (!data) return null;

  return <ProductForm product={data} />;
}
