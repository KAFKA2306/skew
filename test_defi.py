import tempfile
import unittest
from pathlib import Path

from defi import AAVE_EVENT_SIGNATURES, aave_daily, canonical_json, decode_int256, load_raw_ref, sha256, uniswap_daily


class DefiEvidenceTests(unittest.TestCase):
    def test_decode_signed_int256(self):
        self.assertEqual(decode_int256("0" * 63 + "a"), 10)
        self.assertEqual(decode_int256("f" * 64), -1)

    def test_aave_daily_counts_protocol_events_without_mixing_amounts(self):
        topics = {f"aave_{name}": "0x" + f"{index:064x}" for index, name in enumerate(AAVE_EVENT_SIGNATURES, start=1)}
        reserve = "0x" + "11" * 20
        debt = "0x" + "22" * 20
        logs = [
            {"topics": [topics["aave_supply"], "0x" + reserve[2:].rjust(64, "0")]},
            {"topics": [topics["aave_borrow"], "0x" + reserve[2:].rjust(64, "0")]},
            {"topics": [topics["aave_liquidation"], "0x" + reserve[2:].rjust(64, "0"), "0x" + debt[2:].rjust(64, "0")]},
        ]
        row = aave_daily(logs, topics, "2026-01-01")
        self.assertEqual(row["event_count"], 3)
        self.assertEqual(row["event_counts"]["supply"], 1)
        self.assertEqual(row["event_counts"]["borrow"], 1)
        self.assertEqual(row["event_counts"]["liquidation"], 1)
        self.assertEqual(row["reserve_count"], 2)

    def test_uniswap_swap_aggregates_absolute_token_deltas(self):
        def word(value: int) -> str:
            if value < 0:
                value = (1 << 256) + value
            return f"{value:064x}"

        logs = [
            {"data": "0x" + word(2_000_000) + word(-10**18) + word(1) + word(2) + word(3)},
            {"data": "0x" + word(-3_000_000) + word(2 * 10**18) + word(1) + word(2) + word(3)},
        ]
        contracts = {"uniswap_v3": {"pool": "0xpool", "fee": 3000, "token0": "0xusdc", "token1": "0xweth", "token0_decimals": 6, "token1_decimals": 18}}
        row = uniswap_daily(logs, contracts, "2026-01-01")
        self.assertEqual(row["swap_count"], 2)
        self.assertEqual(row["gross_token0"], 5.0)
        self.assertEqual(row["gross_token1"], 3.0)

    def test_raw_reference_hash_is_verified(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            raw_dir = root / "raw" / "objects"
            raw_dir.mkdir(parents=True)
            raw = canonical_json({"jsonrpc": "2.0", "id": 1, "result": []})
            digest = sha256(raw)
            path = raw_dir / f"{digest}.json"
            path.write_bytes(raw)
            ref = {"path": path.relative_to(root).as_posix(), "sha256": digest, "source_url": "https://example.invalid"}
            self.assertEqual(load_raw_ref(root, ref), [])
            path.write_text("{}")
            with self.assertRaisesRegex(ValueError, "raw evidence hash mismatch"):
                load_raw_ref(root, ref)


if __name__ == "__main__":
    unittest.main()
