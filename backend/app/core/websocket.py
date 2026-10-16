from typing import Dict, Set, Any
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # Maps session_id -> set of active WebSockets
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, session_id: int, websocket: WebSocket):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = set()
        self.active_connections[session_id].add(websocket)
        logger.info(f"WebSocket connected to session {session_id}. Total: {len(self.active_connections[session_id])}")

    def disconnect(self, session_id: int, websocket: WebSocket):
        if session_id in self.active_connections:
            self.active_connections[session_id].discard(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
        logger.info(f"WebSocket disconnected from session {session_id}")

    async def broadcast_to_session(self, session_id: int, message: Dict[str, Any]):
        if session_id in self.active_connections:
            dead_connections = set()
            for connection in self.active_connections[session_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.warning(f"Error broadcasting to WebSocket: {e}")
                    dead_connections.add(connection)
            for dead in dead_connections:
                self.active_connections[session_id].discard(dead)


manager = ConnectionManager()
