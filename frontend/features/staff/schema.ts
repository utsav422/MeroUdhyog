'use client';

import { z } from 'zod';

export const staffFormSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(200),
  email: z.string().email('Enter a valid email'),
  role: z.string().min(1, 'Role is required'),
  password: z.string().min(8, 'Min 8 characters').optional().or(z.literal('')),
});

export type StaffFormValues = z.infer<typeof staffFormSchema>;

export const ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'worker', label: 'Worker' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'viewer', label: 'Viewer' },
];
