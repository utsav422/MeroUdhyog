"""CSV import helpers for bulk customer creation.

Column layout (headers are case-insensitive, spaces are ignored, and a
trailing ``*`` marks a required column):

required:  name
optional:  email, phone, contact_number, tax_id, company, address, city,
           latitude, longitude, notes
"""

from __future__ import annotations

from app.shared.csv_import import parse_csv_rows

MANDATORY_COLUMNS = ("name",)
OPTIONAL_COLUMNS = (
    "email",
    "phone",
    "contact_number",
    "tax_id",
    "company",
    "address",
    "city",
    "latitude",
    "longitude",
    "notes",
)
ALL_COLUMNS = MANDATORY_COLUMNS + OPTIONAL_COLUMNS

SAMPLE_HEADER = (
    "name*,email,phone,contact_number,tax_id,company,address,"
    "city,latitude,longitude,notes"
)


def parse_customer_csv(content: bytes):
    return parse_csv_rows(content, ALL_COLUMNS, MANDATORY_COLUMNS)


def build_sample_csv() -> str:
    """A ready-to-upload sample file with header and two example rows."""
    lines = [
        SAMPLE_HEADER,
        "Alice Cooper,alice@acme.com,555-0100,,TAX-1001,Acme Corp,"
        "1 Factory Way,Springfield,42.123456,-71.654321,Corporate account",
        "Bob Ross,bob@paints.com,555-0111,,,Happy Trees LLC,2 Oak Lane,Boston,,,",
    ]
    return "\n".join(lines) + "\n"