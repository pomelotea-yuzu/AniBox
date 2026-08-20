# -*- coding: utf-8 -*-
"""组装 stage111：stage110 的 node_modules + 新 out/ + 新 package.json"""
import os, shutil, time

SRC_STAGE = r"D:\AniBox\anibox\stage110"
DST_STAGE = r"D:\AniBox\anibox\stage111"
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

print("清理 devDeps 大件 ...", flush=True)
NM = os.path.join(DST_STAGE, "node_modules")
REMOVE = ["electron", "electron-vite", "electron-builder", "esbuild", "@electron", "@esbuild",
          "vitest", "@vitest", "playwright", "typescript", "husky", "lint-staged",
          "@typescript-eslint", "@vitejs", "vite", "rollup", "@rollup", "@napi-rs",
          "@develar", "@malept", "@sindresorhus", "ajv", "ajv-keywords", "builder-util",
          "builder-util-runtime", "app-builder-bin", "dmg-builder", "read-config-file",
          "config-file-ts", "electron-publish", "js-yaml", "yaml", "lazy-val", "7zip-bin"]
for d in REMOVE:
    p = os.path.join(NM, d)
    if os.path.exists(p):
        shutil.rmtree(p, ignore_errors=True)
        print("  removed " + d, flush=True)

KORO = os.path.join(NM, "@koromix")
if os.path.exists(KORO):
    for name in os.listdir(KORO):
        if name != "koffi-win32-x64":
            shutil.rmtree(os.path.join(KORO, name), ignore_errors=True)
            print("  removed @koromix/" + name, flush=True)

ORT = os.path.join(NM, "onnxruntime-node", "bin", "napi-v3")
if os.path.exists(ORT):
    for plat in os.listdir(ORT):
        if plat != "win32":
            shutil.rmtree(os.path.join(ORT, plat), ignore_errors=True)
            print("  removed onnxruntime bin/" + plat, flush=True)
    W32 = os.path.join(ORT, "win32")
    if os.path.exists(W32):
        for arch in os.listdir(W32):
            if arch != "x64":
                shutil.rmtree(os.path.join(W32, arch), ignore_errors=True)
                print("  removed onnxruntime win32/" + arch, flush=True)

def dirsize(p):
    s = 0
    for root, _, files in os.walk(p):
        for f in files:
            try:
                s += os.path.getsize(os.path.join(root, f))
            except Exception:
                pass
    return s
print("DONE: stage111 %.0f MB, %.0fs" % (dirsize(DST_STAGE) / 1024 / 1024, time.time() - t0))
