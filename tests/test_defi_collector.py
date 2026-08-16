import pytest

from scripts import collect_defi


def test_rejects_range_above_finalized(monkeypatch):
    monkeypatch.setattr(collect_defi, "finalized_height", lambda: 100)
    with pytest.raises(ValueError, match="exceeds finalized height"):
        collect_defi.collect(90, 101)


def test_normalize_keeps_block_provenance():
    row = collect_defi.normalize_log(
        "aave-v3-pool",
        {
            "blockNumber": hex(100),
            "blockHash": "0xabc",
            "transactionHash": "0xdef",
            "transactionIndex": hex(2),
            "logIndex": hex(3),
            "topics": ["0x01"],
            "data": "0x",
            "removed": False,
        },
    )
    assert row["block_number"] == 100
    assert row["block_hash"] == "0xabc"
    assert row["protocol"] == "Aave"
