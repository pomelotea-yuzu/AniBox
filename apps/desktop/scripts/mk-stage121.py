# -*- coding: utf-8 -*-
"""组装 stage{N}：从上一个 stage 自举复制裁剪 node_modules + 新 out/ + 新 package.json。
用法：改 SRC_STAGE/DST_STAGE（或加参数），打包命令：python scripts/mk-stage121.py [src_stage] [dst_stage]
"""
import os
import shutil
import sys
import time
from pathlib import Path

# 路径一律从脚本位置推导：apps/desktop 是 package 根，一次性产物（stage）放仓库根 artifacts/
PKG = Path(__file__).resolve().parents[1]
ROOT = PKG.parents[1]
ARTIFACTS = ROOT / "artifacts"

SRC_STAGE = sys.argv[1] if len(sys.argv) > 1 else str(ARTIFACTS / "stage121")
DST_STAGE = sys.argv[2] if len(sys.argv) > 2 else str(ARTIFACTS / "stage121")
SRC_OUT = str(PKG / "out")
SRC_PKG = str(PKG / "package.json")
t0 = time.time()
if os.path.exists(DST_STAGE):
    shutil.rmtree(DST_STAGE, ignore_errors=True)
os.makedirs(DST_STAGE, exist_ok=True)

print("复制 node_modules（自举自 %s）..." % os.path.basename(SRC_STAGE), flush=True)
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


print("DONE: %s %.0f MB, %.0fs" % (os.path.basename(DST_STAGE), dirsize(DST_STAGE) / 1024 / 1024, time.time() - t0))
