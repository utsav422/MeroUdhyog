'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type VariantPrice = {
  id: string;
  variant_id: string;
  price: string;
  wholesale_price: string | null;
  cost_price: string | null;
  mrp_price: string | null;
  currency: string;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
};

export type Variant = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  attributes: Record<string, unknown> | null;
  size: string | null;
  size_type: string | null;
  images: string[] | null;
  sort_order: number;
  is_active: boolean;
  stock_quantity: number;
  low_stock_threshold: number;
  prices: VariantPrice[];
};

export type LowStockVariant = {
  product_id: string;
  product_name: string;
  variant_id: string;
  variant_name: string | null;
  sku: string | null;
  stock_quantity: number;
  low_stock_threshold: number;
};

export type StockMovement = {
  id: string;
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  reason: string;
  order_id: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  category_id: string | null;
  slug: string | null;
  is_active: boolean;
  created_at: string;
  variants: Variant[];
};

export type Category = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

export type VariantPriceInput = {
  price: string | number;
  wholesale_price?: string | number | null;
  cost_price?: string | number | null;
  mrp_price?: string | number | null;
  currency?: string;
};

export type VariantInput = {
  name: string;
  sku?: string | null;
  size?: string | null;
  size_type?: string | null;
  stock_quantity?: number | null;
  low_stock_threshold?: number | null;
  sort_order?: number;
  prices?: VariantPriceInput[];
};

export type ProductInput = {
  name: string;
  description?: string | null;
  sku?: string | null;
  category_id?: string | null;
  variants?: VariantInput[];
};

export const MAX_FETCH = 100;

export const productsKeys = {
  all: ['products'] as const,
  list: () => [...productsKeys.all, 'list'] as const,
  detail: (id: string) => [...productsKeys.all, 'detail', id] as const,
};

export const categoriesKeys = {
  all: ['categories'] as const,
  list: () => [...categoriesKeys.all, 'list'] as const,
};

export const inventoryKeys = {
  all: ['inventory'] as const,
  low: () => [...inventoryKeys.all, 'low'] as const,
  movements: (limit: number) => [...inventoryKeys.all, 'movements', limit] as const,
};

export function useProducts(enabled = true) {
  return useQuery({
    queryKey: productsKeys.list(),
    queryFn: () => apiClient.get<Product[]>(`/products?limit=${MAX_FETCH}`),
    enabled,
  });
}

export function useProduct(id: string | null, enabled = true) {
  return useQuery({
    queryKey: productsKeys.detail(id ?? ''),
    queryFn: () => apiClient.get<Product>(`/products/${id}`),
    enabled: enabled && !!id,
  });
}

export function useCategories(enabled = true) {
  return useQuery({
    queryKey: categoriesKeys.list(),
    queryFn: () => apiClient.get<Category[]>(`/categories?limit=${MAX_FETCH}`),
    enabled,
  });
}

export function useLowStock(limit = 10, enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.low(),
    queryFn: () => apiClient.get<LowStockVariant[]>(`/products/inventory/low?limit=${limit}`),
    enabled,
  });
}

export function useStockMovements(limit = 10, enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.movements(limit),
    queryFn: () => apiClient.get<StockMovement[]>(`/products/inventory/movements?limit=${limit}`),
    enabled,
  });
}

export function defaultVariantPrice(variant: Variant): string {
  return variant.prices.find((p) => p.is_active)?.price ?? variant.prices[0]?.price ?? '0';
}
