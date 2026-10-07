"""Download the five public masters; validate the complete dataset before use."""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
import time
from collections.abc import Callable
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

from tools.horse_data.r2_source import FILES, DatasetVersionMismatch, load_r2


def fetch_r2_files(base_url: str, staging: Path) -> None:
    for filename in FILES.values():
        with urlopen(f"{base_url}/{filename}", timeout=120) as response:
            (staging / filename).write_bytes(response.read())


def download_r2(
    base_url: str, output: Path, *, attempts: int = 3, retry_delay: float = 120,
    sleep: Callable[[float], None] = time.sleep,
    fetch: Callable[[str, Path], None] = fetch_r2_files,
) -> None:
    if attempts < 1 or retry_delay < 0:
        raise ValueError("attempts must be positive and retry_delay must be nonnegative")
    for attempt in range(1, attempts + 1):
        # Each retry starts fresh and validates all five files before publishing.
        with tempfile.TemporaryDirectory() as temporary:
            staging = Path(temporary)
            try:
                fetch(base_url, staging)
                load_r2(staging)
            except (DatasetVersionMismatch, URLError, TimeoutError) as error:
                if attempt == attempts:
                    raise
                reason = " ".join(str(error).splitlines())
                print(f"R2 attempt {attempt}/{attempts} failed: {reason}; retrying in {retry_delay:g}s", file=sys.stderr)
                sleep(retry_delay)
                continue
            output.mkdir(parents=True, exist_ok=True)
            for filename in FILES.values():
                shutil.copyfile(staging / filename, output / filename)
            return


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    base_url = os.environ.get("R2_BASE_URL", "").rstrip("/")
    if not base_url.startswith("https://"):
        raise ValueError("Set R2_BASE_URL to the public HTTPS directory containing the five masters")
    download_r2(base_url, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
