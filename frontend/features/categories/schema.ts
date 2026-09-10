'use client';

import { z } from 'zod';

export const categoryFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().optional(),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
