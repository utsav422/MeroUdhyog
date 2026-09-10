from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.categories.models import Category
from app.modules.products.csv_import import parse_product_csv
from app.modules.products.models import (
    InventoryMovement,
    Product,
    ProductVariant,
    VariantPrice,
)
from app.modules.products.repository import ProductRepository
from app.modules.products.schemas import (
    LowStockItemRead,
    ProductCreate,
    ProductRead,
    ProductUpdate,
    StockMovementRead,
    VariantCreate,
    VariantPriceCreate,
    VariantPriceRead,
    VariantPriceUpdate,
    VariantRead,
    VariantUpdate,
)
from app.shared.exceptions import ConflictError, ValidationError


def _generate_slug(name: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", name.lower().strip())
    return re.sub(r"[-\s]+", "-", slug)


def _decimal_or_none(value: str | None) -> Decimal | None:
    """Parse an optional decimal column, returning None on empty/bad values."""
    if not value:
        return None
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return parsed.quantize(Decimal("0.01")) if parsed >= 0 else None


def _int_or_default(value: str | None, default: int = 0) -> int:
    """Parse an optional integer column, returning ``default`` on bad values."""
    if value is None or str(value).strip() == "":
        return default
    try:
        parsed = int(str(value).strip())
    except (ValueError, TypeError):
        return default
    return parsed if parsed >= 0 else default


class ProductService:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.repo = ProductRepository(session, tenant_id)

    async def list(self, limit: int, offset: int) -> list[ProductRead]:
        products = await self.repo.list(limit, offset)
        return [ProductRead.model_validate(p) for p in products]

    async def get(self, product_id: UUID) -> ProductRead:
        product = await self.repo.get(product_id)
        return ProductRead.model_validate(product)

    async def low_stock(self, limit: int) -> list[LowStockItemRead]:
        variants = (
            await self.session.execute(
                select(ProductVariant, Product)
                .join(Product, Product.id == ProductVariant.product_id)
                .where(
                    ProductVariant.tenant_id == self.tenant_id,
                    ProductVariant.stock_quantity
                    <= ProductVariant.low_stock_threshold,
                )
                .order_by(
                    ProductVariant.stock_quantity.asc(),
                    ProductVariant.created_at.asc(),
                )
                .limit(limit)
            )
        ).all()
        return [
            LowStockItemRead(
                product_id=product.id,
                product_name=product.name,
                variant_id=variant.id,
                variant_name=variant.name,
                sku=variant.sku,
                stock_quantity=variant.stock_quantity,
                low_stock_threshold=variant.low_stock_threshold,
            )
            for variant, product in variants
        ]

    async def stock_movements(self, limit: int) -> list[StockMovementRead]:
        movements = (
            await self.session.execute(
                select(InventoryMovement)
                .where(InventoryMovement.tenant_id == self.tenant_id)
                .order_by(InventoryMovement.created_at.desc())
                .limit(limit)
            )
        ).scalars().all()
        return [StockMovementRead.model_validate(m) for m in movements]

    async def create(self, data: ProductCreate) -> ProductRead:
        slug = _generate_slug(data.name)
        existing = await self.repo.get_by_slug(slug)
        if existing:
            raise ConflictError("A product with this name already exists")
        if data.sku:
            existing_sku = await self.repo.get_by_sku(data.sku)
            if existing_sku:
                raise ConflictError("A product with this SKU already exists")

        product = Product(
            tenant_id=self.tenant_id,
            name=data.name,
            description=data.description,
            sku=data.sku,
            category_id=data.category_id,
            slug=slug,
        )
        created = await self.repo.add(product)

        for variant_data in data.variants:
            await self._create_variant(created, variant_data)

        return await self.get(created.id)

    async def update(self, product_id: UUID, data: ProductUpdate) -> ProductRead:
        product = await self.repo.get(product_id)
        updates = data.model_dump(exclude_unset=True)
        if "name" in updates:
            new_slug = _generate_slug(updates["name"])
            existing = await self.repo.get_by_slug(new_slug)
            if existing and existing.id != product_id:
                raise ConflictError("A product with this name already exists")
            product.slug = new_slug
        if "sku" in updates and updates["sku"]:
            existing_sku = await self.repo.get_by_sku(updates["sku"])
            if existing_sku and existing_sku.id != product_id:
                raise ConflictError("A product with this SKU already exists")
        for field, value in updates.items():
            setattr(product, field, value)
        await self.repo.update(product)
        return await self.get(product_id)

    async def delete(self, product_id: UUID) -> None:
        product = await self.repo.get(product_id)
        await self.repo.delete(product)

    async def add_variant(
        self, product_id: UUID, data: VariantCreate
    ) -> VariantRead:
        product = await self.repo.get(product_id)
        variant = await self._create_variant(product, data)
        return VariantRead.model_validate(variant)

    async def update_variant(
        self, product_id: UUID, variant_id: UUID, data: VariantUpdate
    ) -> VariantRead:
        variant = await self.repo.get_variant(product_id, variant_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(variant, field, value)
        updated = await self.repo.update_variant(variant)
        return VariantRead.model_validate(updated)

    async def delete_variant(self, product_id: UUID, variant_id: UUID) -> None:
        variant = await self.repo.get_variant(product_id, variant_id)
        remaining = await self.repo.count_variants(product_id)
        if remaining <= 1:
            raise ConflictError(
                "A product must have at least one variant; "
                "edit or delete the product instead"
            )
        await self.repo.delete_variant(variant)

    async def update_variant_price(
        self, product_id: UUID, variant_id: UUID, price_id: UUID, data: VariantPriceUpdate
    ) -> VariantPriceRead:
        variant = await self.repo.get_variant(product_id, variant_id)
        price = await self.repo.get_variant_price(variant.id, price_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(price, field, value)
        updated = await self.repo.update_variant_price(price)
        return VariantPriceRead.model_validate(updated)

    async def add_variant_price(
        self, product_id: UUID, variant_id: UUID, data: VariantPriceCreate
    ) -> VariantPriceRead:
        variant = await self.repo.get_variant(product_id, variant_id)
        price = VariantPrice(
            tenant_id=self.tenant_id,
            variant_id=variant.id,
            price=data.price,
            wholesale_price=data.wholesale_price,
            cost_price=data.cost_price,
            mrp_price=data.mrp_price,
            currency=data.currency,
            effective_from=data.effective_from,
            effective_to=data.effective_to,
        )
        created = await self.repo.add_price(price)
        return VariantPriceRead.model_validate(created)

    async def _create_variant(
        self,
        product: Product,
        data: VariantCreate,
    ) -> ProductVariant:
        variant = ProductVariant(
            tenant_id=self.tenant_id,
            product_id=product.id,
            name=data.name,
            sku=data.sku,
            attributes=data.attributes,
            size=data.size,
            size_type=data.size_type,
            images=data.images,
            stock_quantity=data.stock_quantity,
            low_stock_threshold=data.low_stock_threshold,
            sort_order=data.sort_order,
        )
        created = await self.repo.add_variant(variant)
        for price_data in data.prices:
            await self.repo.add_price(
                VariantPrice(
                    tenant_id=self.tenant_id,
                    variant_id=created.id,
                    price=price_data.price,
                    wholesale_price=price_data.wholesale_price,
                    cost_price=price_data.cost_price,
                    mrp_price=price_data.mrp_price,
                    currency=price_data.currency,
                    effective_from=price_data.effective_from,
                    effective_to=price_data.effective_to,
                )
            )
        await self.repo._load_prices(created)
        return created

    async def create_from_csv(self, content: bytes) -> list:
        """Bulk-create products from a CSV upload.

        Rows that fail validation (missing name, bad price, duplicate name or
        SKU) are reported per row with their spreadsheet row number while the
        valid rows are still created.
        """
        rows, fatal = parse_product_csv(content)
        if fatal:
            raise ValidationError(fatal)
        for row in rows:
            data = row.data
            name = (data.get("name") or "").strip()
            if not name:
                row.error = "Missing product name"
                continue
            try:
                price = Decimal(data.get("price", ""))
            except (InvalidOperation, ValueError, TypeError):
                row.error = f"Invalid price: {data.get('price')!r}"
                continue
            if price < 0:
                row.error = "Price must be zero or greater"
                continue
            currency = (data.get("currency") or "USD").upper()
            if not currency.isalpha() or len(currency) != 3:
                row.error = f"Invalid currency: {data.get('currency')!r}"
                continue

            category_id = None
            category_name = (data.get("category") or "").strip()
            if category_name:
                category = (
                    await self.session.execute(
                        select(Category).where(
                            Category.tenant_id == self.tenant_id,
                            func.lower(Category.name) == category_name.lower(),
                        )
                    )
                ).scalar_one_or_none()
                if category:
                    category_id = category.id

            try:
                variantCreate = VariantCreate(
                    name=(data.get("variant") or "Default").strip(),
                    sku=data.get("sku"),
                    size=data.get("size"),
                    size_type=data.get("size_type"),
                    stock_quantity=_int_or_default(data.get("stock_quantity"), 0),
                    low_stock_threshold=_int_or_default(
                        data.get("low_stock_threshold"), 5
                    ),
                    prices=[
                        VariantPriceCreate(
                            price=price.quantize(Decimal("0.01")),
                            wholesale_price=_decimal_or_none(
                                data.get("wholesale_price")
                            ),
                            cost_price=_decimal_or_none(data.get("cost_price")),
                            mrp_price=_decimal_or_none(data.get("mrp_price")),
                            currency=currency,
                        )
                    ],
                )
                await self.create(
                    ProductCreate(
                        name=name,
                        description=data.get("description"),
                        category_id=category_id,
                        variants=[variantCreate],
                    )
                )
            except ConflictError as exc:
                row.error = exc.detail
            except Exception as exc:  # pragma: no cover - defensive row isolation
                row.error = f"Failed to create product: {exc}"
        return rows