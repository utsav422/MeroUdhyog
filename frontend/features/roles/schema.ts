'use client';

import { z } from 'zod';

export const roleFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  code: z
    .string()
    .regex(/^[a-z0-9]+([-_][a-z0-9]+)*$/, 'Lowercase letters, numbers, - and _ only')
    .max(100),
  description: z.string().optional(),
});

export type RoleFormValues = z.infer<typeof roleFormSchema>;
