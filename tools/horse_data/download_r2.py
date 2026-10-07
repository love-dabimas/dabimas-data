"""Download the five masters from R2; validate the complete dataset before use."""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.error import URLError

from tools.horse_data.r2_source import FILES, DatasetVersionMismatch, load_r2

DEFAULT_ENDPOINT = "https://28b1c8418991144df39ed91917f7f401.r2.cloudflarestorage.com"
DEFAULT_BUCKET = "dabimas-data"
CREDENTIALS = ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")


def build_client(endpoint: str) -> Any:
    """SigV4 で R2 を読む client を作る。バケットは非公開なので認証が要る。"""
    missing = [name for name in CREDENTIALS if not os.environ.get(name, "").strip()]
    if missing:
        raise RuntimeError("R2 の認証情報が足りません: " + ", ".join(missing))

    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            retries={"max_attempts": 5, "mode": "standard"},
            # R2 はチェックサムを返さないことがあり、既定の検証のままだと
            # botocore 側で応答を解釈できずに落ちる（ダビふぁく側の
            # scripts/pedigree_master_fetch.py で踏んだ）。
            response_checksum_validation="when_required",
        ),
    )


def fetch_r2_objects(bucket: str, staging: Path, *, client: Any = None) -> None:
    """バケット直下の 5 ファイルを staging へ落とす。"""
    resolved = client or build_client(os.environ.get("R2_ENDPOINT_URL", "").strip() or DEFAULT_ENDPOINT)
    for filename in FILES.values():
        body = resolved.get_object(Bucket=bucket, Key=filename)["Body"].read()
        (staging / filename).write_bytes(body)


def _http_status(error: BaseException) -> int | None:
    response = getattr(error, "response", None)
    if isinstance(response, dict):
        status = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if isinstance(status, int):
            return status
    return None


def is_transient(error: BaseException) -> bool:
    """取り直す価値のある失敗かどうか。

    5 ファイルは順に置き換えられるので、その合間に読むと版が食い違う
    （DatasetVersionMismatch）。待てば直るので取り直す。通信の失敗も同じ。
    認証や鍵の誤り（4xx）は待っても直らないので、その場で止める。
    """
    if isinstance(error, (DatasetVersionMismatch, URLError, TimeoutError)):
        return True
    status = _http_status(error)
    if status is not None:
        return status == 429 or status >= 500
    try:
        from botocore.exceptions import BotoCoreError
    except ImportError:
        return False
    return isinstance(error, BotoCoreError)


def download_r2(
    source: str, output: Path, *, attempts: int = 3, retry_delay: float = 120,
    sleep: Callable[[float], None] = time.sleep,
    fetch: Callable[[str, Path], None] = fetch_r2_objects,
) -> None:
    if attempts < 1 or retry_delay < 0:
        raise ValueError("attempts must be positive and retry_delay must be nonnegative")
    for attempt in range(1, attempts + 1):
        # Each retry starts fresh and validates all five files before publishing.
        with tempfile.TemporaryDirectory() as temporary:
            staging = Path(temporary)
            try:
                fetch(source, staging)
                load_r2(staging)
            except Exception as error:
                if attempt == attempts or not is_transient(error):
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
    bucket = os.environ.get("R2_BUCKET", "").strip() or DEFAULT_BUCKET
    download_r2(bucket, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
