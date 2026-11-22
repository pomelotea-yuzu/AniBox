# -*- coding: utf-8 -*-
"""打包 win-unpacked 为便携 ZIP：AniBox-1.2.1-portable-x64.zip"""
import os, sys, zipfile, time

SRC = r"D:\AniBox\anibox\dist\win-unpacked"
OUT = r"D:\AniBox\AniBox-1.2.1-portable-x64.zip"

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
                if total_files % 500 == 0:
                    print("  %d files, %d MB" % (total_files, total_bytes / 1024 / 1024), flush=True)
    size = os.path.getsize(OUT) / 1024 / 1024
    print("DONE: %d files, %d MB -> zip %d MB, %.0fs" % (
        total_files, total_bytes / 1024 / 1024, size, time.time() - t0))

if __name__ == "__main__":
    sys.exit(main())
