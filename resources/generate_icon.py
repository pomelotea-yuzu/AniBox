"""
生成 AniBox 应用图标：深色圆角方块 + 白色播放三角
输出 PNG(256x256) 和 ICO(多尺寸)
"""
from PIL import Image, ImageDraw
import math
import os

OUT_DIR = os.path.dirname(__file__)

# 配色
BG_COLOR = (99, 102, 241)      # indigo #6366f1
BG_DARK = (15, 15, 15)          # 暗色背景用
FG_COLOR = (255, 255, 255)      # 白色播放键
GLOW_COLOR = (129, 140, 248)    # 浅紫发光

def create_icon(size: int, with_glow: bool = True) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = size * 0.12
    radius = size * 0.22
    box_size = size - 2 * margin

    # 圆角矩形背景
    x0, y0 = margin, margin
    x1, y1 = margin + box_size, margin + box_size

    # 用多个圆形+矩形模拟圆角矩形
    # 主体
    draw.rectangle([x0 + radius, y0, x1 - radius, y1], fill=BG_COLOR)
    draw.rectangle([x0, y0 + radius, x1, y1 - radius], fill=BG_COLOR)
    # 四角圆
    for cx, cy in [(x0 + radius, y0 + radius), (x1 - radius, y0 + radius),
                   (x0 + radius, y1 - radius), (x1 - radius, y1 - radius)]:
        draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=BG_COLOR)

    # 轻微渐变高光（顶部的亮条）
    highlight_y0 = margin + box_size * 0.05
    highlight_y1 = margin + box_size * 0.18
    for y in range(int(highlight_y0), int(highlight_y1)):
        alpha = int(60 * (1 - (y - highlight_y0) / (highlight_y1 - highlight_y0)))
        color = (255, 255, 255, alpha)
        # 只能用带alpha的像素级绘制
        left = int(x0 + radius)
        right = int(x1 - radius)
        for x in range(left, right):
            if 0 <= x < size and 0 <= y < size:
                existing = img.getpixel((x, y))
                blended = _blend_pixel(existing, color)
                img.putpixel((x, y), blended)

    # 播放三角
    # 视觉居中偏移（三角形重心偏左，稍微右移）
    tri_center_x = size / 2 + size * 0.02
    tri_center_y = size / 2
    tri_size = size * 0.28

    # 三角顶点
    px = tri_center_x + tri_size * 0.55
    py_top = tri_center_y - tri_size
    py_bot = tri_center_y + tri_size
    px_left = tri_center_x - tri_size * 0.45

    draw.polygon([(px_left, py_top), (px, tri_center_y), (px_left, py_bot)], fill=FG_COLOR)

    return img

def _blend_pixel(bg: tuple, fg: tuple) -> tuple:
    """blend fg onto bg, both RGBA"""
    fa = fg[3] / 255.0
    ba = bg[3] / 255.0
    out_a = fa + ba * (1 - fa)
    if out_a == 0:
        return (0, 0, 0, 0)
    out_r = int((fg[0] * fa + bg[0] * ba * (1 - fa)) / out_a)
    out_g = int((fg[1] * fa + bg[1] * ba * (1 - fa)) / out_a)
    out_b = int((fg[2] * fa + bg[2] * ba * (1 - fa)) / out_a)
    return (out_r, out_g, out_b, int(out_a * 255))

# --- 生成 ---

# PNG 256
png_path = os.path.join(OUT_DIR, "icon.png")
icon256 = create_icon(256)
icon256.save(png_path, "PNG")
print(f"✓ {png_path}")

# ICO (多尺寸)
ico_path = os.path.join(OUT_DIR, "icon.ico")
sizes = [16, 24, 32, 48, 64, 128, 256]
icons = [create_icon(s, with_glow=(s >= 64)) for s in sizes]
icons[0].save(ico_path, format="ICO", sizes=[(s, s) for s in sizes], append_images=icons[1:])
print(f"✓ {ico_path} ({len(sizes)} sizes)")
