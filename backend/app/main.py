from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.admin import ADMIN_PATH, admin_app, register_models
from app.core.config import get_settings
from app.core.database import close_db, init_db
from app.core.logging import setup_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    init_db()
    register_models()
    yield
    await close_db()


settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _register_routers(application: FastAPI) -> None:
    from app.modules.audits.router import router as audits_router
    from app.modules.auth.router import router as auth_router
    from app.modules.categories.router import router as categories_router
    from app.modules.customer_prices.router import router as customer_prices_router
    from app.modules.customers.router import router as customers_router
    from app.modules.deliveries.router import router as deliveries_router
    from app.modules.finance.router import router as finance_router
    from app.modules.imports.router import router as imports_router
    from app.modules.khata.router import router as khata_router
    from app.modules.orders.router import router as orders_router
    from app.modules.predictions.router import router as predictions_router
    from app.modules.products.router import router as products_router
    from app.modules.roles.router import router as roles_router
    from app.modules.routes.router import router as routes_router
    from app.modules.tenants.router import router as tenants_router
    from app.modules.transaction_types.router import router as transaction_types_router
    from app.modules.transactions.router import router as transactions_router
    from app.modules.users.router import router as users_router

    application.include_router(auth_router, prefix=settings.API_V1_PREFIX)
    application.include_router(tenants_router, prefix=settings.API_V1_PREFIX)
    application.include_router(users_router, prefix=settings.API_V1_PREFIX)
    application.include_router(audits_router, prefix=settings.API_V1_PREFIX)
    application.include_router(categories_router, prefix=settings.API_V1_PREFIX)
    application.include_router(products_router, prefix=settings.API_V1_PREFIX)
    application.include_router(customers_router, prefix=settings.API_V1_PREFIX)
    application.include_router(customer_prices_router, prefix=settings.API_V1_PREFIX)
    application.include_router(roles_router, prefix=settings.API_V1_PREFIX)
    application.include_router(routes_router, prefix=settings.API_V1_PREFIX)
    application.include_router(transaction_types_router, prefix=settings.API_V1_PREFIX)
    application.include_router(transactions_router, prefix=settings.API_V1_PREFIX)
    application.include_router(imports_router, prefix=settings.API_V1_PREFIX)
    application.include_router(khata_router, prefix=settings.API_V1_PREFIX)
    application.include_router(finance_router, prefix=settings.API_V1_PREFIX)
    application.include_router(orders_router, prefix=settings.API_V1_PREFIX)
    application.include_router(predictions_router, prefix=settings.API_V1_PREFIX)
    application.include_router(deliveries_router, prefix=settings.API_V1_PREFIX)


_register_routers(app)

app.mount(ADMIN_PATH, admin_app)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": settings.APP_NAME}


@app.get("/")
async def root():
    return {"message": "Factory OS API", "version": "0.1.0"}