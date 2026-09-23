'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Paper,
  Table,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useForm, schemaResolver } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from '@phosphor-icons/react';
import { apiClient } from '@/lib/api-client';
import { formatPriceUnit } from '@/lib/format';
import { useCustomerPrices, customersKeys } from '../api';
import type { Customer, CustomerPrice } from '../api';
import { useProducts, defaultVariantPrice } from '../../products/api';
import { customerFormSchema } from '../schema';
import { LocationPicker } from '@/components/shared';
import { useRoutes } from '../../routes/api';

type FormValues = {
  name: string;
  email: string;
  phone: string;
  company: string;
  pan_no: string;
  city: string;
  route_id: string;
  address: string;
  latitude: string;
  longitude: string;
  notes: string;
};

type PriceRow = {
  variant_id: string;
  product_name: string;
  variant_name: string;
  default_price: string;
  default_unit: string;
  override: string;
};

export default function CustomerForm({ customer }: { customer?: Customer }) {
  const router = useRouter();
  const qc = useQueryClient();
  const isEdit = !!customer;

  const productsQuery = useProducts();
  const pricesQuery = useCustomerPrices(customer?.id ?? null, isEdit);
  const routesQuery = useRoutes();

  const form = useForm<FormValues>({
    validate: schemaResolver(customerFormSchema),
    initialValues: {
      name: customer?.name ?? '',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
      company: customer?.company ?? '',
      pan_no: customer?.pan_no ?? '',
      city: customer?.city ?? '',
      route_id: customer?.route_id ?? '',
      address: customer?.address ?? '',
      latitude: customer?.latitude ? String(customer.latitude) : '',
      longitude: customer?.longitude ? String(customer.longitude) : '',
      notes: customer?.notes ?? '',
    },
  });

  const allVariants = useMemo(() => {
    const list: { variant_id: string; product_name: string; variant_name: string; default_price: string; unit: string }[] = [];
    for (const p of productsQuery.data ?? []) {
      for (const v of p.variants) {
        list.push({
          variant_id: v.id,
          product_name: p.name,
          variant_name: v.name,
          default_price: defaultVariantPrice(v),
          unit: v.unit ?? '',
        });
      }
    }
    return list;
  }, [productsQuery.data]);

  const existingPriceMap = useMemo(() => {
    const m = new Map<string, CustomerPrice>();
    for (const cp of pricesQuery.data ?? []) m.set(cp.variant_id, cp);
    return m;
  }, [pricesQuery.data]);

  const [overrideValues, setOverrideValues] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const cp of pricesQuery.data ?? []) {
      m[cp.variant_id] = String(Number(cp.price));
    }
    return m;
  });

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(() => {
    if (customer?.latitude && customer?.longitude) {
      return {
        lat: Number(customer.latitude),
        lng: Number(customer.longitude),
      };
    }
    return null;
  });

  const handleLocationChange = (loc: { lat: number; lng: number } | null) => {
    setLocation(loc);
    form.setFieldValue('latitude', loc ? String(loc.lat) : '');
    form.setFieldValue('longitude', loc ? String(loc.lng) : '');
  };

  const priceRows: PriceRow[] = useMemo(
    () =>
      allVariants.map((v) => ({
        variant_id: v.variant_id,
        product_name: v.product_name,
        variant_name: v.variant_name,
        default_price: v.default_price,
        default_unit: v.unit,
        override: overrideValues[v.variant_id] ?? '',
      })),
    [allVariants, overrideValues],
  );

  const updateOverride = (variantId: string, value: string) => {
    setOverrideValues((prev) => ({ ...prev, [variantId]: value }));
  };

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        name: values.name,
        email: values.email || null,
        phone: values.phone || null,
        pan_no: values.pan_no?.trim() || null,
        company: values.company || null,
        city: values.city || null,
        route_id: values.route_id || null,
        address: values.address || null,
        latitude: values.latitude ? Number(values.latitude) : null,
        longitude: values.longitude ? Number(values.longitude) : null,
        notes: values.notes || null,
      };
      let customerId = customer?.id;
      if (customer) {
        await apiClient.patch(`/customers/${customer.id}`, payload);
      } else {
        const created = await apiClient.post<Customer>('/customers', payload);
        customerId = created.id;
      }
      for (const row of priceRows) {
        if (!row.variant_id || !customerId) continue;
        if (row.override.trim() !== '') {
          await apiClient.post(`/customers/${customerId}/prices`, {
            variant_id: row.variant_id,
            price: row.override,
            currency: 'INR',
          });
        } else if (existingPriceMap.has(row.variant_id)) {
          try {
            await apiClient.delete(`/customers/${customerId}/prices/${row.variant_id}`);
          } catch {
            // ignore delete errors
          }
        }
      }
    },
    onSuccess: () => {
      notifications.show({
        color: 'success',
        title: customer ? 'Customer updated' : 'Customer created',
        message: form.values.name,
      });
      qc.invalidateQueries({ queryKey: customersKeys.all });
      if (customer) {
        router.push(`/customers/${customer.id}`);
      } else {
        router.push('/customers');
      }
    },
    onError: (error) => {
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Something went wrong',
      });
    },
  });

  const backHref = () => {
    if (customer) return `/customers/${customer.id}`;
    return '/customers';
  };

  return (
    <div>
      <Group mb="lg">
        <Button
          variant="subtle"
          leftSection={<ArrowLeft size={16} />}
          onClick={() => router.push(backHref())}
          color="gray"
        >
          {isEdit ? 'Back to customer' : 'Back to customers'}
        </Button>
      </Group>

      <form
        onSubmit={form.onSubmit((values) => saveMutation.mutate(values))}
        className="flex max-w-3xl flex-col gap-6"
      >
        <Paper withBorder className="p-5">
          <Text fw={600} size="sm" mb="sm" className="text-zinc-700">
            Customer details
          </Text>
          <Stack gap="md">
            <TextInput
              label="Name"
              required
              placeholder="Customer name"
              {...form.getInputProps('name')}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextInput
                label="Email"
                placeholder="email@company.com"
                {...form.getInputProps('email')}
              />
              <TextInput
                label="Phone"
                placeholder="+91 …"
                {...form.getInputProps('phone')}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextInput
                label="Company"
                placeholder="Company name"
                {...form.getInputProps('company')}
              />
              <TextInput
                label="PAN number"
                placeholder="e.g. ABCDE1234F"
                {...form.getInputProps('pan_no')}
              />
            </div>
            <Select
              label="Route"
              placeholder="Assign a delivery route"
              clearable
              searchable
              data={(routesQuery.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
              {...form.getInputProps('route_id')}
              disabled={routesQuery.isLoading}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextInput
                label="City"
                placeholder="City"
                {...form.getInputProps('city')}
              />
              <TextInput
                label="Address"
                placeholder="Address"
                {...form.getInputProps('address')}
              />
            </div>
            <LocationPicker
              value={location}
              onChange={handleLocationChange}
              label="Location (map)"
            />
            <Textarea
              label="Notes"
              placeholder="Optional notes"
              autosize
              minRows={2}
              {...form.getInputProps('notes')}
            />
          </Stack>
        </Paper>

        <Paper withBorder className="p-5">
          <Text fw={600} size="sm" mb="xs" className="text-zinc-700">
            Per-customer pricing
          </Text>
          <Text size="xs" c="dimmed" mb="md">
            Set custom prices for this customer. Leave blank to fall back to
            the product&apos;s default price.
          </Text>
          <div className="max-h-96 overflow-x-auto overflow-y-auto rounded-xl border border-zinc-200">
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="sm" miw={560}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Product</Table.Th>
                  <Table.Th>Variant</Table.Th>
                  <Table.Th ta="right">Default</Table.Th>
                  <Table.Th ta="right">Override</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {priceRows.map((row) => (
                  <Table.Tr key={row.variant_id}>
                    <Table.Td>
                      <span className="font-medium whitespace-nowrap text-zinc-800">
                        {row.product_name}
                      </span>
                    </Table.Td>
                    <Table.Td>
                      <span className="whitespace-nowrap text-zinc-500">{row.variant_name}</span>
                    </Table.Td>
                    <Table.Td ta="right">
                      <span className="whitespace-nowrap">
                        {formatPriceUnit(row.default_price, row.default_unit)}
                      </span>
                    </Table.Td>
                    <Table.Td ta="right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Default"
                        value={row.override}
                        onChange={(e) => updateOverride(row.variant_id, e.currentTarget.value)}
                        className="h-8 w-full min-w-28 rounded-lg border border-zinc-300 px-2 text-right text-sm text-zinc-800 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50 sm:w-28"
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
                {priceRows.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={4} c="dimmed" ta="center" py="lg">
                      No products available to price
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </div>
        </Paper>

        <Group justify="flex-end" gap="sm">
          <Button
            variant="default"
            onClick={() => router.push(backHref())}
            size="md"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={saveMutation.isPending}
            size="md"
            className="shadow-sm shadow-brand-200"
          >
            {isEdit ? 'Save changes' : 'Create customer'}
          </Button>
        </Group>
      </form>
    </div>
  );
}
