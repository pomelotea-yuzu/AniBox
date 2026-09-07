# -*- coding: utf-8 -*-
"""打包 win-unpacked 为便携 ZIP：AniBox-1.2.3-portable-x64.zip
打包前校验 .portable 标志存在（便携数据目录重定向依赖此文件）。
"""
import os, sys, zipfile, time

SRC = r"D:\AniBox\anibox\dist\win-unpacked"
SRC_PORTABLE = r"D:\AniBox\AniBox-1.2.3-portable-x64"
OUT = r"D:\AniBox\AniBox-1.2.3-portable-x64.zip"

def main():
    src = SRC_PORTABLE if os.path.isdir(SRC_PORTABLE) else SRC
    flag = os.path.join(src, ".portable")
    if not os.path.isfile(flag):
        print("ERROR: .portable 标志缺失于", src)
        return 1
    t0 = time.time()
    total_files = 0
    total_bytes = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for root, dirs, files in os.walk(src):
            for f in files:
                full = os.path.join(root, f)
                rel = os.path.relpath(full, src)
                zf.write(full, rel)
                total_files += 1
                total_bytes += os.path.getsize(full)
                if total_files % 500 == 0:
                    print("  %d files, %d MB" % (total_files, total_bytes / 1024 / 1024), flush=True)
    size = os.path.getsize(OUT) / 1024 / 1024
    print("DONE: src=%s, %d files, %d MB -> zip %d MB, %.0fs" % (
        src, total_files, total_bytes / 1024 / 1024, size, time.time() - t0))
    return 0

if __name__ == "__main__":
    sys.exit(main())
