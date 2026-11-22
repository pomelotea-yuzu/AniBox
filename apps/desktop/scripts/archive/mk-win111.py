# -*- coding: utf-8 -*-
"""组装 win111-unpacked：win110-unpacked 运行环境 + 新 app.asar/unpacked"""
import os, shutil, time

SRC = r"D:\AniBox\anibox\dist\win110-unpacked"
DST = r"D:\AniBox\anibox\dist\win111-unpacked"
ASAR = r"D:\AniBox\anibox\dist\app.asar-111"
ASAR_UNP = r"D:\AniBox\anibox\dist\app.asar-111.unpacked"

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
# 复制 resources/ 下的非 asar 文件（locales 等）
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

# 4) version 文件更新为 1.1.1
verfile = os.path.join(DST, "version")
if os.path.exists(verfile):
    with open(verfile, "r") as f:
        content = f.read()
    print("version 文件当前内容:", repr(content[:40]), flush=True)

print("DONE: win111-unpacked %.0f MB, %.0fs" % (sum(
    os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(DST) for f in fs
) / 1024 / 1024, time.time() - t0))
