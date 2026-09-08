# -*- coding: utf-8 -*-
"""把本地索引（D:\\AniBoxData）预置进便携目录的 resources\\anibox-index\\。

目的：新用户解压即用 / 用户清空 data 后，bootstrap 会自动把这份索引装进 userData，
新番时间表与元数据刮削不依赖在线源（AniList 已 403、Bangumi 超时）。

用法：python scripts/stage-index.py [目标 resources 目录]
"""
import hashlib
import json
import os
import shutil
import sys

SRC = r"D:\AniBoxData"
DEFAULT_DST = r"D:\AniBox\AniBox-1.2.3-portable-x64\resources"
FILES = ["core.json.gz", "summary.json.gz", "version.json"]


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    dst_root = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DST
    out = os.path.join(dst_root, "anibox-index")
    os.makedirs(out, exist_ok=True)

    ver = json.load(open(os.path.join(SRC, "version.json"), encoding="utf-8"))
    print("索引版本: dumpDate=%s entries=%s" % (ver.get("dumpDate"), ver.get("entries")))

    for f in FILES:
        src = os.path.join(SRC, f)
        if not os.path.isfile(src):
            print("ERROR: 缺少", src)
            return 1
        exp = (ver.get("files", {}).get(f.replace(".json.gz", ""), {}) or {}).get("sha256")
        got = sha256(src)
        if exp and got != exp:
            print("ERROR: %s sha256 不符\n  expected %s\n  got      %s" % (f, exp, got))
            return 1
        shutil.copy2(src, os.path.join(out, f))
        print("  ✓ %-16s %6.2f MB  sha256 ok" % (f, os.path.getsize(src) / 1024 / 1024))

    total = sum(os.path.getsize(os.path.join(out, f)) for f in FILES) / 1024 / 1024
    print("DONE: %s (%.1f MB)" % (out, total))
    return 0


if __name__ == "__main__":
    sys.exit(main())
