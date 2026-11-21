from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings
from app.core.realtime import PENDING_EVENTS_KEY, realtime_bus


class Base(DeclarativeBase):
    pass


engine: AsyncEngine | None = None
async_session_maker: async_sessionmaker[AsyncSession] | None = None


def init_db() -> None:
    global engine, async_session_maker
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