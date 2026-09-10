from fastapi import Query

DEFAULT_LIMIT = 50
MAX_LIMIT = 100


def pagination_params(
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> tuple[int, int]:
    return limit, offset
