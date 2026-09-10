from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.dependencies import (
    get_current_tenant_id,
    get_current_user_id,
    get_db,
)
from app.core.paginator import pagination_params
from app.core.permissions import Permissions, require_permission
from app.modules.audits.schemas import (
    AuditFindingRead,
    AuditRunRead,
    ResolveFindingRequest,
    TriggerRunRequest,
)
from app.modules.audits.service import AuditService

router = APIRouter(prefix="/audits", tags=["audits"])


async def _service(db, tenant_id) -> AuditService:
    return AuditService(db, tenant_id)


@router.post("/runs", response_model=AuditRunRead, status_code=status.HTTP_201_CREATED)
async def trigger_run(
    data: TriggerRunRequest,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    user_id=Depends(get_current_user_id),
    _=Depends(require_permission(Permissions.MANAGE_AUDITS)),
):
    service = await _service(db, tenant_id)
    return await service.trigger(data.scope_month, user_id)


@router.get("/runs", response_model=list[AuditRunRead])
async def list_runs(
    pagination: tuple[int, int] = Depends(pagination_params),
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list_runs(limit, offset)


@router.get("/runs/{run_id}", response_model=AuditRunRead)
async def get_run(
    run_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    service = await _service(db, tenant_id)
    return await service.get_run(run_id)


@router.get("/findings", response_model=list[AuditFindingRead])
async def list_findings(
    pagination: tuple[int, int] = Depends(pagination_params),
    run_id: UUID | None = None,
    severity: str | None = None,
    resolved: bool | None = None,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    limit, offset = pagination
    service = await _service(db, tenant_id)
    return await service.list_findings(
        limit, offset, run_id=run_id, severity=severity, resolved=resolved
    )


@router.get("/findings/count", response_model=int)
async def count_findings(
    run_id: UUID | None = None,
    severity: str | None = None,
    resolved: bool | None = None,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    service = await _service(db, tenant_id)
    return await service.count_findings(run_id=run_id, severity=severity, resolved=resolved)


@router.get("/findings/{finding_id}", response_model=AuditFindingRead)
async def get_finding(
    finding_id: UUID,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.VIEW_ALL)),
):
    service = await _service(db, tenant_id)
    return await service.get_finding(finding_id)


@router.patch("/findings/{finding_id}/resolve", response_model=AuditFindingRead)
async def resolve_finding(
    finding_id: UUID,
    data: ResolveFindingRequest,
    db=Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
    _=Depends(require_permission(Permissions.MANAGE_AUDITS)),
):
    service = await _service(db, tenant_id)
    return await service.resolve(finding_id, data.note, data.resolved)
