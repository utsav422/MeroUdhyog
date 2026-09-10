'use client';

import { z } from 'zod';

export const customerFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  company: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  latitude: z
    .string()
    .optional()
    .refine((v) => !v || (Number(v) >= -90 && Number(v) <= 90), 'Latitude must be between -90 and 90'),
  longitude: z
    .string()
    .optional()
    .refine((v) => !v || (Number(v) >= -180 && Number(v) <= 180), 'Longitude must be between -180 and 180'),
  notes: z.string().optional(),
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;
