import hashlib
import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "audit_ledger.db")

GENESIS_HASH = "0" * 64


class SecureAuditor:
    """
    Hash-chained (blockchain-style) audit ledger for the multi-agent pipeline.

    Every logged decision embeds the hash of the previous entry, so tampering
    with any historical row invalidates every hash after it -- this is what
    makes the ledger tamper-evident rather than merely "logged". Addresses the
    Non-Compositionality concern from the project's MASEC literature review:
    individually reasonable agent decisions can still be audited end-to-end.
    """

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ledger (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT,
                    agent_name TEXT,
                    action_type TEXT,
                    decision_payload TEXT,
                    prev_hash TEXT,
                    hash TEXT
                )
                """
            )
            conn.commit()

    def _last_hash(self, conn: sqlite3.Connection) -> str:
        cur = conn.execute("SELECT hash FROM ledger ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        return row[0] if row else GENESIS_HASH

    def log_decision(self, agent_name: str, action_type: str, payload: Dict[str, Any]) -> str:
        timestamp = datetime.now(timezone.utc).isoformat()
        payload_str = json.dumps(payload, sort_keys=True, default=str)

        # The read-last-hash-then-insert sequence below must be atomic: two
        # concurrent writers (e.g. two backend processes sharing this db file)
        # can otherwise both read the same prev_hash and fork the chain, which
        # verify_integrity() then reports as tampering. threading.Lock serializes
        # writers within this process; BEGIN IMMEDIATE takes a write lock at the
        # SQLite level so a second process blocks until this transaction commits.
        with self._lock:
            with sqlite3.connect(self.db_path, timeout=30, isolation_level=None) as conn:
                conn.execute("BEGIN IMMEDIATE")
                try:
                    prev_hash = self._last_hash(conn)
                    block = f"{timestamp}|{agent_name}|{action_type}|{payload_str}|{prev_hash}"
                    current_hash = hashlib.sha256(block.encode("utf-8")).hexdigest()
                    conn.execute(
                        "INSERT INTO ledger (timestamp, agent_name, action_type, decision_payload, prev_hash, hash) "
                        "VALUES (?, ?, ?, ?, ?, ?)",
                        (timestamp, agent_name, action_type, payload_str, prev_hash, current_hash),
                    )
                    conn.commit()
                except Exception:
                    conn.rollback()
                    raise
        return current_hash

    def get_ledger(self, limit: int = 100) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute("SELECT * FROM ledger ORDER BY id DESC LIMIT ?", (limit,))
            return [dict(row) for row in cur.fetchall()]

    def verify_integrity(self) -> Dict[str, Any]:
        """Replay the entire chain and confirm every hash matches its recomputation."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM ledger ORDER BY id ASC").fetchall()

        expected_prev = GENESIS_HASH
        for row in rows:
            block = f"{row['timestamp']}|{row['agent_name']}|{row['action_type']}|{row['decision_payload']}|{row['prev_hash']}"
            recomputed = hashlib.sha256(block.encode("utf-8")).hexdigest()
            if row["prev_hash"] != expected_prev or recomputed != row["hash"]:
                return {"valid": False, "broken_at_id": row["id"]}
            expected_prev = row["hash"]
        return {"valid": True, "entries": len(rows)}


# Global instance shared by all agents
auditor = SecureAuditor()
