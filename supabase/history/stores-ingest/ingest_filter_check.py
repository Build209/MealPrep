#!/usr/bin/env python3
"""Unit checks for stores-ingest name filters. Run: python3 ingest_filter_check.py"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ingest import WALMART_PICKUP_RE, name_allowed

WALMART_PICKUP_NAMES = [
    "Walmart Pickup",
    "Walmart Grocery Pickup and Delivery",
    "Walmart Online Order Pickup",
    "Walmart Curbside Pickup",
    "Walmart Supercenter Pickup",
    "Walmart Pickup Today",
]


def main() -> None:
    for label in WALMART_PICKUP_NAMES:
        assert WALMART_PICKUP_RE.search(label), f"pickup regex should match: {label}"
        assert not name_allowed(label), f"name_allowed should reject: {label}"

    assert name_allowed("Walmart Supercenter"), "supercenter grocery name should pass"
    assert not WALMART_PICKUP_RE.search("Walmart Supercenter"), "supercenter alone is not pickup"

    print("ingest_filter_check: ok")


if __name__ == "__main__":
    main()
