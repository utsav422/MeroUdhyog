from __future__ import annotations

import asyncio
from collections.abc import Iterable
from contextlib import suppress
from typing import Any

Event = dict[str, Any]

PENDING_EVENTS_KEY = "realtime_events"


class RealtimeBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[Event]] = set()

    def subscribe(self) -> asyncio.Queue[Event]:
        queue: asyncio.Queue[Event] = asyncio.Queue(maxsize=100)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[Event]) -> None:
        self._subscribers.discard(queue)

    def publish(self, event: Event) -> None:
        for queue in tuple(self._subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                with suppress(asyncio.QueueEmpty):
                    queue.get_nowait()
                queue.put_nowait(event)

    def publish_many(self, events: Iterable[Event]) -> None:
        for event in events:
            self.publish(event)


realtime_bus = RealtimeBus()
