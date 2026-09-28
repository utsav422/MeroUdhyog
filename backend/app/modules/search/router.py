from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_current_tenant_id, get_db
from app.modules.search.schemas import SearchGroup
from app.modules.search.service import GlobalSearchService

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=list[SearchGroup])
async def global_search(
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=5, ge=1, le=10),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    service = GlobalSearchService(db, tenant_id, limit=limit)
    return await service.search(q.strip())