from fastapi import APIRouter
from fastapi.responses import HTMLResponse, JSONResponse

from app.admin import ADMIN_PATH

router = APIRouter(include_in_schema=False)

_ADMIN_TITLE = "Mero Udhyog Admin"
_ADMIN_DESCRIPTION = (
    "Secure administration workspace for Mero Udhyog by Factoryze Tech — "
    "manage tenants, accounts, catalogues, orders and operations."
)

_INDEX_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="theme-color" content="#27675c" />
    <meta name="color-scheme" content="light" />
    <meta name="application-name" content="Mero Udhyog Admin" />
    <meta name="description" content="{{DESCRIPTION}}" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Mero Udhyog Admin" />
    <meta property="og:title" content="{{TITLE}}" />
    <meta property="og:description" content="{{DESCRIPTION}}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="{{TITLE}}" />
    <meta name="twitter:description" content="{{DESCRIPTION}}" />
    <title>{{TITLE}}</title>
    <link rel="icon" type="image/svg+xml" href="/brand/favicon.svg" />
    <link rel="icon" type="image/x-icon" href="/brand/favicon.ico" sizes="any" />
    <link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" />
    <link rel="manifest" href="{{ADMIN_PATH}}/manifest.webmanifest" />
    <script>
      window.SERVER_DOMAIN = "";
      window.SERVER_URL = "{{ADMIN_PATH}}/api";
    </script>
    <script
      defer="defer"
      src="{{ADMIN_PATH}}/static/index.min.js"
    ></script>
    <link
      href="{{ADMIN_PATH}}/static/index.min.css"
      rel="stylesheet"
    />
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
"""


def _render_index() -> str:
    return (
        _INDEX_TEMPLATE.replace("{{TITLE}}", _ADMIN_TITLE)
        .replace("{{DESCRIPTION}}", _ADMIN_DESCRIPTION)
        .replace("{{ADMIN_PATH}}", ADMIN_PATH)
    )


@router.get(ADMIN_PATH, response_class=HTMLResponse)
@router.get(f"{ADMIN_PATH}/", response_class=HTMLResponse)
def admin_index() -> HTMLResponse:
    return HTMLResponse(
        _render_index(),
        headers={
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex, nofollow, noarchive",
        },
    )


@router.get(f"{ADMIN_PATH}/manifest.webmanifest")
def admin_manifest() -> JSONResponse:
    return JSONResponse(
        {
            "name": _ADMIN_TITLE,
            "short_name": "Mero Udhyog Admin",
            "description": _ADMIN_DESCRIPTION,
            "start_url": ADMIN_PATH,
            "scope": ADMIN_PATH,
            "display": "standalone",
            "background_color": "#f7f5ef",
            "theme_color": "#27675c",
            "icons": [
                {
                    "src": "/brand/icon-192.png",
                    "sizes": "192x192",
                    "type": "image/png",
                    "purpose": "any",
                },
                {
                    "src": "/brand/icon-512.png",
                    "sizes": "512x512",
                    "type": "image/png",
                    "purpose": "any",
                },
                {
                    "src": "/brand/icon-512.png",
                    "sizes": "512x512",
                    "type": "image/png",
                    "purpose": "maskable",
                },
            ],
        },
        media_type="application/manifest+json",
        headers={"Cache-Control": "no-store"},
    )
