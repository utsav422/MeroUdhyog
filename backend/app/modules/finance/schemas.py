from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field


class MonthlySummaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tenant_id: UUID
    month: date
    currency: str
    revenue: Decimal
    cogs: Decimal
    operating_expense: Decimal
    gross_profit: Decimal
    net_profit: Decimal
    transaction_count: int
    sale_count: int
    purchase_count: int
    expense_count: int

    @computed_field  # type: ignore[prop-decorator]
    @property
    def gross_margin_percent(self) -> float | None:
        if not self.revenue:
            return None
        return round(float(self.gross_profit / self.revenue * 100), 2)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def net_margin_percent(self) -> float | None:
        if not self.revenue:
            return None
        return round(float(self.net_profit / self.revenue * 100), 2)