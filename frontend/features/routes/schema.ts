'use client';

import { z } from 'zod';

export const routeFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  cities: z.string().optional(),
  description: z.string().optional(),
  agent_id: z.string().optional(),
});

export type RouteFormValues = z.infer<typeof routeFormSchema>;
