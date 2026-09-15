"""CSV import helpers for bulk product creation.

Column layout (headers are case-insensitive, spaces are ignored, and a
trailing ``*`` marks a required column):

required:  name, variant, price
optional:  sku, description, category, size, size_type, unit,
           wholesale_price, cost_price, mrp_price, currency
"""

from __future__ import annotations

from app.shared.csv_import import parse_csv_rows

MANDATORY_COLUMNS = ("name", "variant", "price")
OPTIONAL_COLUMNS = (
    "sku",
    "description",
    "category",
    "size",
    "size_type",
    "unit",
    "wholesale_price",
    "cost_price",
    "mrp_price",
    "currency",
    "stock_quantity",
    "low_stock_threshold",
)
ALL_COLUMNS = MANDATORY_COLUMNS + OPTIONAL_COLUMNS

SAMPLE_HEADER = (
    "name*,variant*,price*,sku,description,category,size,size_type,unit,"
    "wholesale_price,cost_price,mrp_price,currency,stock_quantity,low_stock_threshold"
)


def parse_product_csv(content: bytes):
    return parse_csv_rows(content, ALL_COLUMNS, MANDATORY_COLUMNS)


def build_sample_csv() -> str:
    """A ready-to-upload sample file with header and two example rows."""
    lines = [
        SAMPLE_HEADER,
        "Mango Pickle,Classic,5.50,MANGO-500,Tangy spread,Pickles,500,g,jar,4.50,3.00,6.00,USD,120,20",
        "Lemon Pickle,Classic,6.00,LEMON-500,Citrusy,Pickles,,,kg,5.00,3.50,7.00,USD,40,10",
    ]
    return "\n".join(lines) + "\n"