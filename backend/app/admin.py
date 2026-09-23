"""FastAdmin auto-generated admin UI wired to Factory OS SQLAlchemy models.

FastAdmin reads all ADMIN_* settings from environment variables at import time
(via `os.getenv` in `fastadmin.settings`). We therefore (a) load `.env` into the
process environment and (b) set sensible defaults *before* importing the
package, so registration and mount behave consistently regardless of how
uvicorn is started.
"""

import os

from dotenv import load_dotenv

load_dotenv()

os.environ.setdefault("ADMIN_USER_MODEL", "User")
os.environ.setdefault("ADMIN_USER_MODEL_USERNAME_FIELD", "email")
os.environ.setdefault("ADMIN_SECRET_KEY", "dev-fastadmin-secret-key-factory-os")
os.environ.setdefault("ADMIN_SESSION_COOKIE_SECURE", "false")

from collections.abc import Sequence  # noqa: E402

from fastadmin import (  # noqa: E402
    SqlAlchemyModelAdmin,
    WidgetType,
    fastapi_app,
)
from fastadmin.api.exceptions import AdminApiException  # noqa: E402
from fastadmin.models.decorators import display  # noqa: E402
from fastadmin.models.helpers import register_admin_model_class  # noqa: E402
from fastadmin.settings import settings as _admin_settings  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import exc as orm_exc  # noqa: E402

from app.core.security import get_password_hash, verify_password  # noqa: E402
from app.modules.audits.models import AuditFinding, AuditRun  # noqa: E402
from app.modules.categories.models import Category  # noqa: E402
from app.modules.customer_prices.models import CustomerPrice  # noqa: E402
from app.modules.customers.models import Customer  # noqa: E402
from app.modules.deliveries.models import Delivery, DeliveryLocation  # noqa: E402
from app.modules.finance.models import MonthlyFinancialSummary  # noqa: E402
from app.modules.imports.models import ImportBatch, ImportRowError  # noqa: E402
from app.modules.khata.models import (  # noqa: E402
    BillTemplate,
    LedgerAllocation,
    LedgerEntry,
    OrderInvoice,
)
from app.modules.notifications.models import (  # noqa: E402
    Notification,
    PushSubscription,
)
from app.modules.orders.models import Order, OrderItem  # noqa: E402
from app.modules.predictions.models import OrderHistory  # noqa: E402
from app.modules.products.models import (  # noqa: E402
    InventoryMovement,
    Product,
    ProductVariant,
    VariantPrice,
)
from app.modules.roles.models import Role  # noqa: E402
from app.modules.routes.models import Route, RouteAgent, RouteCity  # noqa: E402
from app.modules.tenants.models import Tenant  # noqa: E402
from app.modules.transaction_types.models import TransactionType  # noqa: E402
from app.modules.transactions.models import Transaction  # noqa: E402
from app.modules.users.models import User  # noqa: E402

ADMIN_PATH = f"/{_admin_settings.ADMIN_PREFIX}"

# The Starlette/FastAPI sub-application that serves the FastAdmin SPA + API.
admin_app = fastapi_app


def _select_options(values: list[str]) -> list[dict]:
    """Build FastAdmin Select options from a list of valid raw values."""
    return [{"label": v.replace("_", " ").title(), "value": v} for v in values]


class TenantScopedAdminMixin:
    """Expose a tenant column on every tenant-scoped table.

    `tenant_id` is a real column, so FastAdmin's column sorting orders rows by
    tenant out of the box; `tenant_name` is a read-only display column that
    shows the tenant's name (loaded via `tenant` select_related to avoid N+1).
    """

    list_select_related: Sequence[str] = ("tenant",)
    list_filter: Sequence[str] = ("tenant",)

    @display
    def tenant_name(self, obj) -> str:
        try:
            tenant = obj.tenant
        except (AttributeError, orm_exc.DetachedInstanceError):
            return ""
        return tenant.name if tenant else ""


class TenantAdmin(SqlAlchemyModelAdmin):
    menu_section = "System"
    list_display = ("name", "slug", "is_active", "created_at")
    list_display_links = ("name",)
    search_fields = ("name", "slug")


class UserAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Accounts"
    list_display = (
        "email", "full_name", "role", "status", "is_active", "last_login_at",
        "tenant", "tenant_name",
    )
    list_display_links = ("email",)
    list_filter = ("role", "status", "is_active", "tenant")
    search_fields = ("email", "full_name")
    formfield_overrides = {
        "hashed_password": (
            WidgetType.PasswordInput,
            {"passwordModalForm": True},
        ),
        "role": (
            WidgetType.AsyncSelect,
            {
                "parentModel": "Role",
                "idField": "code",
                "labelFields": ["name"],
            },
        ),
        "status": (
            WidgetType.Select,
            {
                "options": [
                    {"label": "Active", "value": "active"},
                    {"label": "Inactive", "value": "inactive"},
                    {"label": "Invited", "value": "invited"},
                ],
                "defaultValue": "active",
            },
        ),
    }

    async def authenticate(self, username: str, password: str):
        sessionmaker = self.get_sessionmaker()
        async with sessionmaker() as session:
            row = (
                await session.execute(select(User).where(User.email == username))
            ).scalar_one_or_none()
        if not row:
            return None
        if row.status != "active" or not row.is_active:
            return None
        if not verify_password(password, row.hashed_password):
            return None
        return row.id

    async def change_password(self, id, password: str) -> None:
        sessionmaker = self.get_sessionmaker()
        async with sessionmaker() as session:
            row = await session.get(User, id)
            if not row:
                return
            row.hashed_password = get_password_hash(password)
            await session.commit()

    async def save_model(self, id, payload: dict) -> dict | None:
        raw = payload.get("hashed_password")
        if raw and not raw.startswith("$argon2"):
            payload = {**payload, "hashed_password": get_password_hash(raw)}
        return await super().save_model(id, payload)


class RoleAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Accounts"
    list_display = (
        "name", "code", "permissions", "is_system", "is_active", "created_at",
        "tenant", "tenant_name",
    )
    list_display_links = ("name",)
    list_filter = ("is_system", "is_active", "tenant")
    search_fields = ("name", "code")
    formfield_overrides = {
        "permissions": (WidgetType.JsonTextArea, {}),
    }


class ProductAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Catalog"
    list_display = (
        "name", "sku", "category", "is_active", "created_at", "tenant", "tenant_name",
    )
    list_display_links = ("name",)
    search_fields = ("name", "sku")
    list_filter = ("is_active", "category", "tenant")


class ProductVariantAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Catalog"
    list_display = (
        "name", "sku", "product_id", "sort_order", "is_active", "tenant", "tenant_name",
    )
    search_fields = ("name", "sku")


class VariantPriceAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Catalog"
    list_display = (
        "id", "variant_id", "price", "currency", "effective_from", "is_active",
        "tenant", "tenant_name",
    )


class CustomerAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Customers"
    list_display = (
        "name", "email", "company", "phone", "city", "is_active", "created_at",
        "tenant", "tenant_name",
    )
    list_display_links = ("name",)
    list_filter = ("is_active", "city", "tenant")
    search_fields = ("name", "email", "company", "pan_no", "city")


class CustomerPriceAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Customers"
    list_display = (
        "id", "customer_id", "variant_id", "price", "currency", "updated_at",
        "tenant", "tenant_name",
    )
    list_filter = ("currency", "tenant")
    search_fields = ("id",)


class RouteAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Deliveries"
    list_display = ("name", "is_active", "created_at", "tenant", "tenant_name")
    list_display_links = ("name",)
    list_filter = ("is_active", "tenant")


class RouteCityAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Deliveries"
    list_display = ("route_id", "city", "tenant", "tenant_name")


class RouteAgentAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Deliveries"
    list_display = ("route_id", "agent_id", "id", "tenant", "tenant_name")


class TransactionAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Transactions"
    list_display = (
        "type",
        "transaction_date",
        "amount",
        "currency",
        "customer_id",
        "product_id",
        "is_active",
        "tenant",
        "tenant_name",
    )
    list_display_links = ("id",)
    list_filter = ("type", "is_active", "tenant")
    formfield_overrides = {
        "type": (
            WidgetType.AsyncSelect,
            {
                "parentModel": "TransactionType",
                "idField": "code",
                "labelFields": ["name"],
            },
        ),
        "metadata": (WidgetType.JsonTextArea, {}),
    }


class AuditRunAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Audits"
    list_display = (
        "id",
        "status",
        "scope_month",
        "triggered_by",
        "total_findings",
        "created_at",
        "completed_at",
        "tenant",
        "tenant_name",
    )
    list_filter = ("status", "scope_month", "tenant")
    search_fields = ("id",)
    formfield_overrides = {
        "status": (
            WidgetType.Select,
            {"options": _select_options(["pending", "completed", "failed"])},
        ),
    }


class AuditFindingAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Audits"
    list_display = (
        "id", "rule_code", "severity", "transaction_id", "is_resolved", "created_at",
        "tenant", "tenant_name",
    )
    list_display_links = ("id",)
    list_filter = ("severity", "is_resolved", "rule_code", "tenant")
    search_fields = ("rule_code", "message")
    formfield_overrides = {
        "severity": (
            WidgetType.Select,
            {"options": _select_options(["low", "medium", "high", "critical"])},
        ),
    }


class TransactionTypeAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Transactions"
    list_display = ("name", "code", "is_active", "created_at", "tenant", "tenant_name")
    list_display_links = ("name",)
    list_filter = ("is_active", "tenant")
    search_fields = ("name", "code")


class ImportBatchAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Imports"
    list_display = (
        "filename",
        "status",
        "total_rows",
        "success_count",
        "error_count",
        "created_at",
        "tenant",
        "tenant_name",
    )
    list_display_links = ("filename",)
    list_filter = ("status", "tenant")
    formfield_overrides = {
        "status": (
            WidgetType.Select,
            {"options": _select_options(["pending", "processing", "completed", "failed"])},
        ),
    }


class ImportRowErrorAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Imports"
    list_display = (
        "batch_id", "row_number", "field", "message", "created_at",
        "tenant", "tenant_name",
    )
    search_fields = ("message",)


class OrderHistoryAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Predictions"
    list_display = (
        "customer_id", "product_id", "order_date", "quantity", "source", "created_at",
        "tenant", "tenant_name",
    )
    list_display_links = ("id",)
    list_filter = ("source", "tenant")
    search_fields = ("id",)


class MonthlyFinancialSummaryAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Finance"
    list_display = (
        "month",
        "currency",
        "revenue",
        "cogs",
        "operating_expense",
        "gross_profit",
        "net_profit",
        "transaction_count",
        "tenant",
        "tenant_name",
    )
    list_display_links = ("month",)
    list_filter = ("month", "currency", "tenant")


class CategoryAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Catalog"
    list_display = ("name", "slug", "is_active", "created_at", "tenant", "tenant_name")
    list_display_links = ("name",)
    search_fields = ("name", "slug")
    list_filter = ("is_active", "tenant")


class OrderAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Orders"
    list_display = (
        "order_ref", "status", "payment_status", "total_amount", "created_at",
        "tenant", "tenant_name",
    )
    list_display_links = ("order_ref",)
    list_filter = ("status", "payment_status", "tenant")
    search_fields = ("order_ref",)
    formfield_overrides = {
        "status": (
            WidgetType.Select,
            {
                "options": _select_options(
                    ["draft", "confirmed", "ready", "in_delivery", "delivered", "cancelled"]
                ),
            },
        ),
        "payment_status": (
            WidgetType.Select,
            {
                "options": _select_options(["unpaid", "partial", "paid"]),
            },
        ),
    }


class OrderItemAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Orders"
    list_display = (
        "order_id", "product_name", "variant_name", "quantity", "unit_price", "amount",
        "tenant", "tenant_name",
    )
    search_fields = ("product_name",)


class DeliveryAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Deliveries"
    list_display = (
        "id", "order_id", "delivery_agent_id", "status", "assigned_at", "delivered_at",
        "tenant", "tenant_name",
    )
    list_filter = ("status", "tenant")
    search_fields = ("id",)
    list_select_related = ("order", "tenant")
    exclude = ("delivered_lat", "delivered_lng")
    formfield_overrides = {
        "status": (
            WidgetType.Select,
            {
                "options": _select_options(
                    [
                        "pending_assignment",
                        "assigned",
                        "picked_up",
                        "in_transit",
                        "delivered",
                        "failed",
                    ]
                ),
            },
        ),
    }

    async def has_add_permission(self, user_id=None) -> bool:
        # Deliveries are auto-created per order via the REST API (dispatch).
        # Creating one directly here cannot set the required tenant_id -> 500.
        return False

    async def save_model(self, id, payload: dict) -> dict | None:
        if id is None and payload.get("order_id"):
            sessionmaker = self.get_sessionmaker()
            async with sessionmaker() as session:
                existing = (
                    await session.execute(
                        select(Delivery.id).where(
                            Delivery.order_id == payload["order_id"]
                        )
                    )
                ).scalar_one_or_none()
            if existing:
                raise AdminApiException(
                    422,
                    detail=(
                        "This order already has a delivery. "
                        "Edit the existing delivery to change its status or agent "
                        "instead of creating a new one."
                    ),
                )
        return await super().save_model(id, payload)


class DeliveryLocationAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Deliveries"
    list_display = ("delivery_id", "lat", "lng", "recorded_at", "tenant", "tenant_name")


class LedgerEntryAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    """Khata payments — the customer ledger.

    Entries are never hard-deleted; ``status`` moves active -> voided via the
    khata API, keeping the order payment totals consistent.
    """

    menu_section = "Khata"
    list_display = (
        "receipt_number", "customer_name", "amount", "method", "status", "collected_at",
        "tenant", "tenant_name",
    )
    list_display_links = ("receipt_number",)
    list_filter = ("method", "status", "tenant")
    search_fields = ("receipt_number", "note", "customer_name")
    list_select_related = ("tenant", "customer", "collector")
    formfield_overrides = {
        "method": (
            WidgetType.Select,
            {
                "options": _select_options(
                    ["bank_transfer", "cash", "esewa", "khalti", "other"]
                ),
            },
        ),
        "status": (
            WidgetType.Select,
            {"options": _select_options(["active", "voided"])},
        ),
        "receipt_snapshot": (WidgetType.JsonTextArea, {}),
    }


class LedgerAllocationAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Khata"
    list_display = ("ledger_entry_id", "order_ref", "amount_applied", "tenant", "tenant_name")
    list_filter = ("tenant",)
    search_fields = ("order_ref",)
    list_select_related = ("tenant", "order")

    async def has_add_permission(self, user_id=None) -> bool:
        # Allocations are created atomically when a payment is recorded (FIFO/manual).
        return False

    async def has_delete_permission(self, user_id=None) -> bool:
        return False


class OrderInvoiceAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Khata"
    list_display = ("invoice_number", "order_id", "created_at", "tenant", "tenant_name")
    list_display_links = ("invoice_number",)
    list_filter = ("tenant",)
    search_fields = ("invoice_number", "order_id")
    formfield_overrides = {
        "template_snapshot": (WidgetType.JsonTextArea, {}),
        "data": (WidgetType.JsonTextArea, {}),
    }

    async def has_add_permission(self, user_id=None) -> bool:
        # Invoices are numbered documents issued by the khata service, not free-form rows.
        return False


class BillTemplateAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Khata"
    list_display = (
        "business_name", "tax_id", "invoice_tax_rate", "invoice_number_prefix",
        "receipt_number_prefix", "tenant", "tenant_name",
    )
    list_display_links = ("business_name",)
    search_fields = ("business_name", "tax_id")
    exclude = ("logo_data", "signature_data")
    formfield_overrides = {
        "layout": (WidgetType.JsonTextArea, {}),
        "invoice_tax_rate": (WidgetType.InputNumber, {}),
        "next_invoice_number": (WidgetType.InputNumber, {}),
        "next_receipt_number": (WidgetType.InputNumber, {}),
    }


class NotificationAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Notifications"
    list_display = (
        "title", "category", "recipient_user_id", "recipient_roles", "read_at",
        "created_at", "tenant", "tenant_name",
    )
    list_display_links = ("title",)
    list_filter = ("category", "tenant")
    search_fields = ("title", "message")
    formfield_overrides = {
        "category": (
            WidgetType.Select,
            {
                "options": _select_options(
                    ["delivery", "order", "payment", "prediction", "stock", "system"]
                ),
            },
        ),
        "recipient_roles": (WidgetType.JsonTextArea, {}),
        "data": (WidgetType.JsonTextArea, {}),
    }


class PushSubscriptionAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    menu_section = "Notifications"
    list_display = ("id", "user_id", "is_active", "created_at", "tenant", "tenant_name")
    list_display_links = ("id",)
    list_filter = ("is_active", "tenant")
    exclude = ("p256dh", "auth")


class InventoryMovementAdmin(TenantScopedAdminMixin, SqlAlchemyModelAdmin):
    """Stock audit trail — auto-generated, never written from the admin UI."""

    menu_section = "Products"
    list_display = (
        "product_name", "variant_name", "quantity", "reason", "created_at",
        "tenant", "tenant_name",
    )
    list_filter = ("reason", "tenant")
    search_fields = ("product_name", "variant_name")
    formfield_overrides = {
        "reason": (
            WidgetType.Select,
            {
                "options": _select_options(
                    ["cancelled", "manual", "order", "restock", "returned"]
                ),
            },
        ),
    }

    async def has_add_permission(self, user_id=None) -> bool:
        return False

    async def has_delete_permission(self, user_id=None) -> bool:
        return False


_ADMIN_CLASSES = (
    (TenantAdmin, Tenant),
    (UserAdmin, User),
    (RoleAdmin, Role),
    (ProductAdmin, Product),
    (ProductVariantAdmin, ProductVariant),
    (VariantPriceAdmin, VariantPrice),
    (CustomerAdmin, Customer),
    (CustomerPriceAdmin, CustomerPrice),
    (TransactionAdmin, Transaction),
    (TransactionTypeAdmin, TransactionType),
    (ImportBatchAdmin, ImportBatch),
    (ImportRowErrorAdmin, ImportRowError),
    (OrderHistoryAdmin, OrderHistory),
    (MonthlyFinancialSummaryAdmin, MonthlyFinancialSummary),
    (CategoryAdmin, Category),
    (OrderAdmin, Order),
    (OrderItemAdmin, OrderItem),
    (DeliveryAdmin, Delivery),
    (DeliveryLocationAdmin, DeliveryLocation),
    (LedgerEntryAdmin, LedgerEntry),
    (LedgerAllocationAdmin, LedgerAllocation),
    (OrderInvoiceAdmin, OrderInvoice),
    (BillTemplateAdmin, BillTemplate),
    (NotificationAdmin, Notification),
    (PushSubscriptionAdmin, PushSubscription),
    (InventoryMovementAdmin, InventoryMovement),
    (RouteAdmin, Route),
    (RouteCityAdmin, RouteCity),
    (RouteAgentAdmin, RouteAgent),
    (AuditRunAdmin, AuditRun),
    (AuditFindingAdmin, AuditFinding),
)


def register_models() -> None:
    """Register all model admins with the active SQLAlchemy sessionmaker.

    Must be called after ``app.core.database.init_db()`` (lazily invoked inside
    the app lifespan) so ``async_session_maker`` is available.
    """
    from app.core.database import async_session_maker

    if async_session_maker is None:
        raise RuntimeError("init_db() must run before registering FastAdmin models")

    for admin_class, model in _ADMIN_CLASSES:
        register_admin_model_class(
            admin_class, [model], sqlalchemy_sessionmaker=async_session_maker
        )
