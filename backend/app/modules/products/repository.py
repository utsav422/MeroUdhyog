from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.products.models import Product, ProductVariant, VariantPrice
from app.shared.exceptions import NotFoundError


class ProductRepository:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id

    async def _load_variants(self, product: Product) -> list[ProductVariant]:
        result = await self.session.execute(
            select(ProductVariant)
            .where(
                ProductVariant.tenant_id == self.tenant_id,
                ProductVariant.product_id == product.id,
            )
            .order_by(ProductVariant.sort_order.asc(), ProductVariant.created_at.asc())
        )
        variants = list(result.scalars().all())
        for variant in variants:
            await self._load_prices(variant)
        return variants

    async def _load_prices(self, variant: ProductVariant) -> None:
        result = await self.session.execute(
            select(VariantPrice)
            .where(VariantPrice.variant_id == variant.id)
            .order_by(VariantPrice.created_at.asc())
        )
        variant.prices = list(result.scalars().all())

    async def list(self, limit: int, offset: int) -> list[Product]:
        result = await self.session.execute(
            select(Product)
            .where(Product.tenant_id == self.tenant_id)
            .order_by(Product.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        products = list(result.scalars().all())
        for product in products:
            product.variants = await self._load_variants(product)
        return products

    async def get(self, product_id: UUID) -> Product:
        result = await self.session.execute(
            select(Product).where(
                Product.id == product_id,
                Product.tenant_id == self.tenant_id,
            )
        )
        product = result.scalar_one_or_none()
        if not product:
            raise NotFoundError("Product not found")
        product.variants = await self._load_variants(product)
        return product

    async def get_by_slug(self, slug: str) -> Product | None:
        result = await self.session.execute(
            select(Product).where(
                Product.tenant_id == self.tenant_id,
                Product.slug == slug,
            )
        )
        return result.scalar_one_or_none()

    async def get_by_sku(self, sku: str) -> Product | None:
        result = await self.session.execute(
            select(Product).where(
                Product.tenant_id == self.tenant_id,
                Product.sku == sku,
            )
        )
        return result.scalar_one_or_none()

    async def add(self, product: Product) -> Product:
        self.session.add(product)
        await self.session.flush()
        await self.session.refresh(product)
        return product

    async def update(self, product: Product) -> Product:
        await self.session.flush()
        await self.session.refresh(product)
        return product

    async def delete(self, product: Product) -> None:
        await self.session.delete(product)
        await self.session.flush()

    async def add_variant(self, variant: ProductVariant) -> ProductVariant:
        self.session.add(variant)
        await self.session.flush()
        await self.session.refresh(variant)
        return variant

    async def get_variant(self, product_id: UUID, variant_id: UUID) -> ProductVariant:
        result = await self.session.execute(
            select(ProductVariant).where(
                ProductVariant.id == variant_id,
                ProductVariant.product_id == product_id,
                ProductVariant.tenant_id == self.tenant_id,
            )
        )
        variant = result.scalar_one_or_none()
        if not variant:
            raise NotFoundError("Variant not found")
        await self._load_prices(variant)
        return variant

    async def add_price(self, price: VariantPrice) -> VariantPrice:
        self.session.add(price)
        await self.session.flush()
        await self.session.refresh(price)
        return price

    async def get_variant_price(
        self, variant_id: UUID, price_id: UUID
    ) -> VariantPrice:
        result = await self.session.execute(
            select(VariantPrice).where(
                VariantPrice.id == price_id,
                VariantPrice.variant_id == variant_id,
                VariantPrice.tenant_id == self.tenant_id,
            )
        )
        price = result.scalar_one_or_none()
        if not price:
            raise NotFoundError("Variant price not found")
        return price

    async def update_variant(self, variant: ProductVariant) -> ProductVariant:
        await self.session.flush()
        await self.session.refresh(variant)
        await self._load_prices(variant)
        return variant

    async def delete_variant(self, variant: ProductVariant) -> None:
        await self.session.delete(variant)
        await self.session.flush()

    async def count_variants(self, product_id: UUID) -> int:
        from sqlalchemy import func

        result = await self.session.execute(
            select(func.count()).select_from(ProductVariant).where(
                ProductVariant.tenant_id == self.tenant_id,
                ProductVariant.product_id == product_id,
            )
        )
        return int(result.scalar_one())

    async def update_variant_price(self, price: VariantPrice) -> VariantPrice:
        await self.session.flush()
        await self.session.refresh(price)
        return price