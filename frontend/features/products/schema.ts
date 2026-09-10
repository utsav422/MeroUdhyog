'use client';

import { z } from 'zod';

export const productFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  sku: z
    .string()
    .max(100, 'SKU must be 100 characters or fewer')
    .optional()
    .or(z.literal('')),
  category_id: z.string().optional().or(z.literal('')),
  price: z.number().min(0, 'Selling price must be 0 or more').optional(),
  wholesale_price: z.number().min(0, 'Wholesale price must be 0 or more').optional(),
  cost_price: z.number().min(0, 'Cost of making must be 0 or more').optional(),
  mrp_price: z.number().min(0, 'MRP must be 0 or more').optional(),
  description: z.string().optional(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
