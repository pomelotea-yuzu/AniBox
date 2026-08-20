# -*- coding: utf-8 -*-
"""组装 win113-unpacked：win112-unpacked 运行环境 + 新 app.asar/unpacked（版本 1.1.3）"""
import os, shutil, time

SRC = r"D:\AniBox\anibox\dist\win112-unpacked"
DST = r"D:\AniBox\anibox\dist\win113-unpacked"
ASAR = r"D:\AniBox\anibox\dist\app.asar-113"
ASAR_UNP = r"D:\AniBox\anibox\dist\app.asar-113.unpacked"

t0 = time.time()
if os.path.exists(DST):
    shutil.rmtree(DST, ignore_errors=True)
os.makedirs(DST, exist_ok=True)

# 1) 复制 Electron 运行环境（排除 resources/ 旧 asar）
print("复制运行环境 ...", flush=True)
for name in os.listdir(SRC):
    s = os.path.join(SRC, name)
    d = os.path.join(DST, name)
    if name == "resources":
        continue
    if os.path.isdir(s):
        shutil.copytree(s, d)
    else:
        shutil.copy2(s, d)

# 2) resources 结构
res = os.path.join(DST, "resources")
os.makedirs(res, exist_ok=True)
for name in os.listdir(os.path.join(SRC, "resources")):
    s = os.path.join(SRC, "resources", name)
    d = os.path.join(res, name)
    if name in ("app.asar", "app.asar.unpacked"):
        continue
    if os.path.isdir(s):
        shutil.copytree(s, d)
    else:
        shutil.copy2(s, d)

# 3) 放入新 app.asar + unpacked
shutil.copy2(ASAR, os.path.join(res, "app.asar"))
if os.path.exists(ASAR_UNP):
    shutil.copytree(ASAR_UNP, os.path.join(res, "app.asar.unpacked"))

print("DONE: win113-unpacked %.0f MB, %.0fs" % (sum(
    os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(DST) for f in fs
) / 1024 / 1024, time.time() - t0))
