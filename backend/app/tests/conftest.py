import os

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:cagtu@localhost:5432/fastapi_test"
)

import pytest
from httpx import ASGITransport, AsyncClient

from app.core import database
from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test"
    ) as ac:
        yield ac


@pytest.fixture(autouse=True)
async def _dispose_pool_between_tests():
    """Drop pooled connections after every test.

    pytest-asyncio gives each test its own event loop, but the module-level
    engine is created once for the whole session. Any connection returned to
    the pool is still bound to the loop it was opened on, so the next test
    checks a connection out and gets
    `Queue ... is bound to a different event loop`. Disposing forces the next
    test to open fresh connections on its own loop.
    """
    yield
    if database.engine is not None:
        await database.engine.dispose()