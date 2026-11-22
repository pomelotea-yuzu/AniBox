"""
去白底 + 边缘抗锯齿
"""
from PIL import Image
import numpy as np
from collections import deque
from pathlib import Path
import sys

RES = Path(__file__).resolve().parent
src_path = str(RES / 'icon.png')
src = Image.open(src_path)
img = src.convert('RGBA')
arr = np.array(img).copy()
h, w = arr.shape[:2]

# 更宽松的白底阈值：RGB 都 > 240 且三色差异 < 15
r = arr[:,:,0].astype(int)
g = arr[:,:,1].astype(int)
b = arr[:,:,2].astype(int)
white_mask = (r > 240) & (g > 240) & (b > 240) & (np.abs(r-g) < 15) & (np.abs(g-b) < 15)

# BFS flood fill from 4 corners
visited = np.zeros((h, w), dtype=bool)
queue = deque()
for x, y in [(0,0), (w-1,0), (0,h-1), (w-1,h-1)]:
    if white_mask[y, x] and not visited[y, x]:
        queue.append((x, y))
        visited[y, x] = True

while queue:
    x, y = queue.popleft()
    for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
        nx, ny = x+dx, y+dy
        if 0 <= nx < w and 0 <= ny < h and not visited[ny, nx] and white_mask[ny, nx]:
            visited[ny, nx] = True
            queue.append((nx, ny))

arr[visited, 3] = 0

# 边缘抗锯齿：找 alpha>0 但有透明邻居的浅色像素 → 降透明度
for y in range(h):
    for x in range(w):
        if arr[y, x, 3] == 0:
            continue
        has_transparent_neighbor = False
        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                nx, ny = x+dx, y+dy
                if 0 <= nx < w and 0 <= ny < h and arr[ny, nx, 3] == 0:
                    has_transparent_neighbor = True
                    break
            if has_transparent_neighbor:
                break
        if has_transparent_neighbor:
            cr = int(arr[y, x, 0])
            cg = int(arr[y, x, 1])
            cb = int(arr[y, x, 2])
            if cr > 230 and cg > 230 and cb > 230 and abs(cr-cg) < 15 and abs(cg-cb) < 15:
                arr[y, x, 3] = max(0, int(arr[y, x, 3]) - 130)

result = Image.fromarray(arr, 'RGBA')
result.save(src_path, 'PNG')

# 验证关键点
print(f"size: {w}x{h}")
for label, (x, y) in [('左上角',(2,2)),('右上角',(w-3,2)),('左下角',(2,h-3)),('右下角',(w-3,h-3)),('中心肤色',(w//2,h//2)),('头发',(w//2,h//3))]:
    p = result.getpixel((x, y))
    print(f"  {label} ({x},{y}): RGBA={p}")

# 重新生成 ICO（白底版）
white_bg = Image.new('RGBA', src.size, (255, 255, 255, 255))
ico_src = src.convert('RGBA')
mask = result.split()[3]
white_bg.paste(ico_src, mask=mask)
sizes = [16, 24, 32, 48, 64, 128, 256]
icons = [white_bg.resize((s, s), Image.LANCZOS) for s in sizes]
icons[0].save(str(RES / 'icon.ico'), format='ICO',
              sizes=[(s, s) for s in sizes], append_images=icons[1:])
print('icon.ico 重新生成')
