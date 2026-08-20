# -*- coding: utf-8 -*-
"""组装 stage113：stage111 的裁剪 node_modules + 新 out/ + 新 package.json（版本 1.1.3）"""
import os, shutil, time

SRC_STAGE = r"D:\AniBox\anibox\stage111"
DST_STAGE = r"D:\AniBox\anibox\stage113"
SRC_OUT = r"D:\AniBox\anibox\out"
SRC_PKG = r"D:\AniBox\anibox\package.json"

t0 = time.time()
if os.path.exists(DST_STAGE):
    shutil.rmtree(DST_STAGE, ignore_errors=True)
os.makedirs(DST_STAGE, exist_ok=True)

print("复制 node_modules ...", flush=True)
shutil.copytree(os.path.join(SRC_STAGE, "node_modules"), os.path.join(DST_STAGE, "node_modules"))
print("  node_modules 完成 (%.0fs)" % (time.time() - t0), flush=True)

print("复制 out ...", flush=True)
shutil.copytree(SRC_OUT, os.path.join(DST_STAGE, "out"))

shutil.copy2(SRC_PKG, os.path.join(DST_STAGE, "package.json"))

def dirsize(p):
    s = 0
    for root, _, files in os.walk(p):
        for f in files:
            try:
                s += os.path.getsize(os.path.join(root, f))
            except Exception:
                pass
    return s
print("DONE: stage113 %.0f MB, %.0fs" % (dirsize(DST_STAGE) / 1024 / 1024, time.time() - t0))
