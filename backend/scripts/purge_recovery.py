"""Permanently remove recovery items past the admin retention window.

Usage::

    python -m scripts.purge_recovery [--limit 200] [--days 7]
"""

import argparse
import asyncio

from app.core.database import close_db, get_session, init_db
from app.modules.recovery.purge import purge_expired


async def main(limit: int, days: int) -> None:
    init_db()
    try:
        async with get_session() as session:
            purged = await purge_expired(session, limit=limit, retention_days=days)
        print(f"Permanently removed {purged} recovery item(s).")
    finally:
        await close_db()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()
    asyncio.run(main(args.limit, args.days))
