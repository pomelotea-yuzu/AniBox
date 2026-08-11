# -*- coding: utf-8 -*-
"""打包 win-unpacked 为便携 ZIP：AniBox-1.0.0-portable-x64.zip"""
import os
import zipfile
import sys
import time

SRC = r"D:\AniBox\anibox\dist\win-unpacked"
OUT = r"D:\AniBox\AniBox-1.0.0-portable-x64.zip"

def main():
    t0 = time.time()
    total_files = 0
    total_bytes = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for root, dirs, files in os.walk(SRC):
            for f in files:
                full = os.path.join(root, f)
                rel = os.path.relpath(full, SRC)
                zf.write(full, rel)
                total_files += 1
                total_bytes += os.path.getsize(full)
                if total_files % 200 == 0:
                    print(f"  {total_files} files, {total_bytes/1024/1024:.0f} MB", flush=True)
    size = os.path.getsize(OUT) / 1024 / 1024
    print(f"DONE: {total_files} files, {total_bytes/1024/1024:.0f} MB -> zip {size:.0f} MB, {time.time()-t0:.0f}s")

if __name__ == "__main__":
    sys.exit(main())
