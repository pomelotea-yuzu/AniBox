# -*- coding: utf-8 -*-
"""把 chibi 贴纸源图应用为 AniBox 图标（粉色圆角底 + 多尺寸 ICO）"""
import os
import numpy as np
from collections import deque
from PIL import Image, ImageDraw

SRC = r"D:\AniBox\161336d042150d97023018eaadfc0dc8.png"
OUT_DIR = r"D:\AniBox\anibox\resources"
PNG_OUT = os.path.join(OUT_DIR, "icon.png")
ICO_OUT = os.path.join(OUT_DIR, "icon.ico")

# 粉色（sakura 主题色）
BG = (196, 160, 168)      # #C4A0A8
BG_DARK = (179, 142, 152)  # #B38E98


def remove_white_bg_flood(img: Image.Image) -> Image.Image:
    """flood-fill 去白底：只去除与四角连通的白色背景，保留角色内部的白色（水手服/白花）"""
    img = img.convert("RGBA")
    arr = np.array(img).copy()
    h, w = arr.shape[:2]
    r = arr[:, :, 0].astype(int)
    g = arr[:, :, 1].astype(int)
    b = arr[:, :, 2].astype(int)
    white = (r > 240) & (g > 240) & (b > 240) & (np.abs(r - g) < 15) & (np.abs(g - b) < 15)
    visited = np.zeros((h, w), bool)
    q = deque()
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if white[y, x] and not visited[y, x]:
            q.append((x, y))
            visited[y, x] = True
    while q:
        x, y = q.popleft()
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny, nx] and white[ny, nx]:
                visited[ny, nx] = True
                q.append((nx, ny))
    arr[visited, 3] = 0
    return Image.fromarray(arr, "RGBA")


def crop_to_content(img: Image.Image, pad: int = 8) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(img.width, r + pad)
    b = min(img.height, b + pad)
    return img.crop((l, t, r, b))


def rounded_box(size: int, bg, dark, ratio: float = 0.22) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(size * ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=bg)
    # 顶部轻微高光
    hl = int(size * 0.22)
    for i in range(hl):
        y = i
        a = int(30 * (1 - i / hl))
        d.line([(radius, y), (size - radius, y)], fill=(255, 255, 255, a))
    return img


def compose(size: int, sticker: Image.Image) -> Image.Image:
    bg = rounded_box(size, BG, BG_DARK)
    target = int(size * 0.80)
    st = sticker.resize((target, target), Image.LANCZOS)
    x = (size - target) // 2
    y = (size - target) // 2
    bg.alpha_composite(st, (x, y))
    return bg


def main():
    src = Image.open(SRC)
    print("src:", src.size)

    alpha = remove_white_bg_flood(src)
    cropped = crop_to_content(alpha, pad=10)
    print("cropped:", cropped.size)

    # 保持宽高比缩放到 512 方框内，再居中放到 512×512 透明画布（避免拉伸）
    base = 512
    cropped.thumbnail((base, base), Image.LANCZOS)
    square = Image.new("RGBA", (base, base), (0, 0, 0, 0))
    square.paste(cropped, ((base - cropped.width) // 2, (base - cropped.height) // 2), cropped)

    icon256 = compose(256, square)
    icon256.save(PNG_OUT, "PNG")
    print("saved:", PNG_OUT)

    # Pillow ICO 写入用 base 图的尺寸判断哪些 size 可写（size > base 会被跳过），
    # 所以 base 必须用最大尺寸（256），其余作为 append_images 传入。
    sizes = [256, 128, 64, 48, 32, 24, 16]
    icons = [compose(s, square) for s in sizes]
    icons[0].save(ICO_OUT, format="ICO", sizes=[(s, s) for s in sizes], append_images=icons[1:])
    print("saved:", ICO_OUT, "(", len(sizes), "sizes )")


if __name__ == "__main__":
    main()
