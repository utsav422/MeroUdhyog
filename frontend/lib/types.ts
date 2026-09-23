export type Role =
  | "owner"
  | "admin"
  | "manager"
  | "accountant"
  | "worker"
  | "delivery"
  | "viewer";

export interface RoleRead {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  description: string | null;
  permissions: string[];
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoleCreate {
  name: string;
  code: string;
  description?: string | null;
  permissions?: string[];
}

export interface CategoryRead {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CustomerRead {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_number: string | null;
  pan_no: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerCreate {
  name: string;
  email?: string | null;
  phone?: string | null;
  contact_number?: string | null;
  pan_no?: string | null;
  company?: string | null;
  address?: string | null;
  city?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  notes?: string | null;
}

export interface CustomerPriceRead {
  id: string;
  tenant_id: string;
  customer_id: string;
  variant_id: string;
  price: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface RouteRead {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  cities: string[];
  agent_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface RouteCreate {
  name: string;
  description?: string | null;
  cities?: string[];
  agent_ids?: string[];
}

export interface CategoryCreate {
  name: string;
  description?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  tenant_name: string;
  tenant_slug: string;
  email: string;
  password: string;
  full_name: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id: string;
  tenant_id: string;
}

export interface MeResponse {
  user_id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
  is_superadmin: boolean;
}

export interface VariantPriceRead {
  id: string;
  variant_id: string;
  price: string;
  cost_price: string | null;
  currency: string;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
}

export interface VariantRead {
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
  prices: VariantPriceRead[];
}

export interface ProductRead {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  category_id: string | null;
  slug: string | null;
  is_active: boolean;
  created_at: string;
  variants: VariantRead[];
}

export interface VariantPriceCreate {
  price: string;
  cost_price?: string | null;
  currency?: string;
  effective_from?: string | null;
  effective_to?: string | null;
}

export interface VariantCreate {
  name: string;
  sku?: string | null;
  attributes?: Record<string, unknown> | null;
  size?: string | null;
  size_type?: string | null;
  images?: string[];
  sort_order?: number;
  prices?: VariantPriceCreate[];
}

export interface ProductCreate {
  name: string;
  description?: string | null;
  sku?: string | null;
  category_id?: string | null;
  variants?: VariantCreate[];
}

export interface ImportBatchRead {
  id: string;
  tenant_id: string;
  status: string;
  filename: string | null;
  total_rows: number;
  success_count: number;
  error_count: number;
  created_at: string;
  updated_at: string;
}

export interface ImportRowErrorRead {
  id: string;
  batch_id: string;
  row_number: number;
  field: string | null;
  message: string;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface MonthlySummaryRead {
  tenant_id: string;
  month: string;
  currency: string;
  revenue: string;
  cogs: string;
  operating_expense: string;
  gross_profit: string;
  net_profit: string;
  gross_margin_percent: number | null;
  net_margin_percent: number | null;
  transaction_count: number;
  sale_count: number;
  purchase_count: number;
  expense_count: number;}

export interface ApiErrorBody {
  detail?: string | unknown;
}

export interface OrderItemRead {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  quantity: string;
  unit_price: string;
  amount: string;
}

export interface OrderRead {
  id: string;
  tenant_id: string;
  order_ref: string;
  customer_id: string | null;
  status: string;
  payment_status: string;
  total_amount: string;
  delivery_address: string | null;
  delivery_lat: string | null;
  delivery_lng: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  items: OrderItemRead[];
}

export interface OrderItemCreate {
  product_id: string;
  variant_id?: string | null;
  quantity: string;
  unit_price: string;
}

export interface OrderCreate {
  customer_id?: string | null;
  delivery_address?: string | null;
  delivery_lat?: string | null;
  delivery_lng?: string | null;
  notes?: string | null;
  items: OrderItemCreate[];
}

export interface DeliveryRead {
  id: string;
  tenant_id: string;
  order_id: string;
  route_id: string | null;
  delivery_agent_id: string | null;
  status: string;
  assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  delivered_lat: string | null;
  delivered_lng: string | null;
  proof_notes: string | null;
  created_at: string;
  order_ref: string | null;
  customer_name: string | null;
  delivery_address: string | null;
}

export interface UserRead {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_superadmin: boolean;
  created_at: string;
}

export interface AuditRunRead {
  id: string;
  tenant_id: string;
  status: string;
  scope_month: string | null;
  triggered_by: string | null;
  total_findings: number;
  created_at: string;
  completed_at: string | null;
}

export interface AuditFindingRead {
  id: string;
  tenant_id: string;
  run_id: string;
  rule_code: string;
  severity: string;
  transaction_id: string | null;
  message: string;
  evidence: Record<string, unknown> | null;
  is_resolved: boolean;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}
