#!/usr/bin/env python3
"""Read-only public ROSTA media check. Test bytes, never infer delivery from HEAD."""
import argparse
import concurrent.futures
import json
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

PANEL_THEME = "https://rostapanel.zeabur.app/api/public-store-design/theme"
STORAGE = "https://rosta-supabase.tail178b60.ts.net/storage/v1/object/public/"
GATEWAY = "https://rostacoffecompany.zeabur.app/api/rosta-media/"


def public_paths(value):
    if isinstance(value, str):
        path = urlsplit(value).path
        match = re.fullmatch(
            r"/(?:storage/v1/(?:object|render/image)/public|api/rosta-media)/"
            r"((?:rosta-media|website-media)/.+)", path,
        )
        if match:
            yield match.group(1)
    elif isinstance(value, dict):
        for item in value.values():
            yield from public_paths(item)
    elif isinstance(value, list):
        for item in value:
            yield from public_paths(item)


def check(path, origin):
    started = time.monotonic()
    result = {"path": path}
    for attempt in range(2):
        try:
            with urlopen(Request(origin + path, headers={"Range": "bytes=0-63"}), timeout=20) as response:
                content_type = response.headers.get("Content-Type", "").split(";")[0]
                data = response.read(64)
                result.update(status=response.status, content_type=content_type, bytes=len(data))
                result["ok"] = response.status in (200, 206) and bool(data) and content_type.startswith(("image/", "video/"))
        except HTTPError as error:
            result.update(ok=False, status=error.code)
            if attempt == 0 and error.code >= 500:
                continue
        except (URLError, TimeoutError, OSError) as error:
            result.update(ok=False, status=None, error=type(error).__name__)
            if attempt == 0:
                continue
        break
    if not result["ok"]:
        try:
            with urlopen(Request(origin + path, method="HEAD"), timeout=20) as response:
                result["head_status"] = response.status
        except HTTPError as error:
            result["head_status"] = error.code
        except (URLError, TimeoutError, OSError):
            result["head_status"] = None
    result["seconds"] = round(time.monotonic() - started, 3)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gateway", action="store_true", help="Test storefront delivery instead of direct Storage")
    args = parser.parse_args()
    try:
        with urlopen(Request(PANEL_THEME, headers={"Accept": "application/json"}), timeout=20) as response:
            theme = json.load(response)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
        raise SystemExit("Public ROSTA design could not be read: " + type(error).__name__)
    if theme.get("ok") is not True or not isinstance(theme.get("published"), dict):
        raise SystemExit("Public ROSTA published document is unavailable.")
    paths = sorted(set(public_paths(theme["published"])))
    if not paths:
        raise SystemExit("No published public media paths were found; this is not a successful delivery check.")
    origin = GATEWAY if args.gateway else STORAGE
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda path: check(path, origin), paths))
    print(json.dumps({
        "origin": origin, "revision": theme.get("revision"), "unique_media": len(paths),
        "delivered": sum(result["ok"] for result in results),
        "failed": sum(not result["ok"] for result in results),
        "results": results,
    }, indent=2))
    return 1 if any(not result["ok"] for result in results) else 0


if __name__ == "__main__":
    sys.exit(main())
