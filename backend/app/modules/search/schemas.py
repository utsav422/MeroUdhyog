from pydantic import BaseModel


class SearchHit(BaseModel):
    type: str
    id: str
    title: str
    subtitle: str | None = None
    meta: str | None = None
    href: str


class SearchGroup(BaseModel):
    key: str
    label: str
    href: str | None = None
    items: list[SearchHit]