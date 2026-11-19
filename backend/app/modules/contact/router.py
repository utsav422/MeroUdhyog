from fastapi import APIRouter, HTTPException, status
from starlette.concurrency import run_in_threadpool

from app.modules.contact import service
from app.modules.contact.schemas import ContactMessageIn, ContactMessageResponse

router = APIRouter(prefix="/contact", tags=["contact"])


@router.post(
    "",
    response_model=ContactMessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def submit_contact_message(data: ContactMessageIn):
    if not data.website:
        try:
            await run_in_threadpool(service.send_contact_message, data)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "We couldn't send your message right now. "
                    "Please email info.meroudhyog@gmail.com or call +977 9840934837."
                ),
            ) from exc
    return ContactMessageResponse()
