import os
import tempfile

from app.core.audit import SecureAuditor


def test_hash_chain_links_sequential_entries():
    with tempfile.TemporaryDirectory() as tmp:
        auditor = SecureAuditor(db_path=os.path.join(tmp, "test_ledger.db"))
        h1 = auditor.log_decision("Perception", "TEST", {"a": 1})
        h2 = auditor.log_decision("MotionPlanner", "TEST", {"a": 2})

        ledger = auditor.get_ledger()
        assert len(ledger) == 2
        # Most recent first
        assert ledger[0]["hash"] == h2
        assert ledger[0]["prev_hash"] == h1


def test_verify_integrity_detects_tampering():
    import sqlite3

    with tempfile.TemporaryDirectory() as tmp:
        db_path = os.path.join(tmp, "test_ledger.db")
        auditor = SecureAuditor(db_path=db_path)
        auditor.log_decision("Perception", "TEST", {"a": 1})
        auditor.log_decision("MotionPlanner", "TEST", {"a": 2})

        assert auditor.verify_integrity()["valid"] is True

        with sqlite3.connect(db_path) as conn:
            conn.execute("UPDATE ledger SET decision_payload = ? WHERE id = 1", ('{"a": 999}',))
            conn.commit()

        result = auditor.verify_integrity()
        assert result["valid"] is False
