'use client';

import { z } from 'zod';

/** Optional money field fed by a Mantine NumberInput.
 *
 *  NumberInput reports a cleared box as `''` (or NaN on some keystroke paths),
 *  and both mean "not set" — so they are normalised to `undefined` before
 *  validation instead of being rejected. Only a genuine negative amount is an
 *  error, which keeps "leave it blank for no limit" always valid.
 */
const optionalAmount = z.preprocess(
  (v) =>
    v === '' || v === null || v === undefined || Number.isNaN(v as number)
      ? undefined
      : v,
  z
    .number({ error: 'Enter a valid amount' })
    .min(0, 'Credit limit must be zero or more')
    .optional(),
);

export const customerFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  pan_no: z.string().max(50, 'PAN number must be 50 characters or fewer').optional(),
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
  /** Caps how much this customer may owe at once. Blank means no limit, and
   *  `0` is a real limit meaning "no credit". */
  credit_limit: optionalAmount,
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;