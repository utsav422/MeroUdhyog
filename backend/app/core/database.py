from contextlib import asynccontextmanager

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, with_loader_criteria

from app.core.config import get_settings
from app.core.realtime import PENDING_EVENTS_KEY, realtime_bus
from app.core.soft_delete import SoftDeletable


class Base(DeclarativeBase):
    pass


@event.listens_for(Session, "do_orm_execute")
def _hide_soft_deleted_rows(execute_state) -> None:
    """Keep trashed records out of ordinary application queries.

    Recovery endpoints and the backend admin opt in explicitly so they can
    still show a deleted record until its retention window closes.
    """
    if not execute_state.is_select:
        return
    if execute_state.execution_options.get("include_deleted", False):
        return
    if execute_state.session.info.get("include_deleted", False):
        return
    execute_state.statement = execute_state.statement.options(
        with_loader_criteria(
            SoftDeletable,
            lambda cls: cls.deleted_at.is_(None),
            include_aliases=True,
            propagate_to_loaders=True,
        )
    )


engine: AsyncEngine | None = None
async_session_maker: async_sessionmaker[AsyncSession] | None = None
admin_session_maker: async_sessionmaker[AsyncSession] | None = None


def init_db() -> None:
    global engine, async_session_maker, admin_session_maker
    settings = get_settings()

    engine = create_async_engine(
        settings.DATABASE_URL.replace("postgresql://", "postgresql+psycopg://"),
        pool_size=settings.DATABASE_POOL_SIZE,
        max_overflow=settings.DATABASE_MAX_OVERFLOW,
        pool_pre_ping=True,
        echo=settings.DEBUG,
    )
    async_session_maker = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    admin_session_maker = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        info={"include_deleted": True},
    )


async def close_db() -> None:
    global engine
    if engine:
        await engine.dispose()


@asynccontextmanager
async def get_session() -> AsyncSession:
    if async_session_maker is None:
        init_db()
    async with async_session_maker() as session:
        events: list[dict] = []
        try:
            yield session
            events = list(session.info.pop(PENDING_EVENTS_KEY, []))
            await session.commit()
        except Exception:
            session.info.pop(PENDING_EVENTS_KEY, None)
            await session.rollback()
            raise
        finally:
            await session.close()
        realtime_bus.publish_many(events)


async def get_session_dependency() -> AsyncSession:
    async with get_session() as session:
        yield session