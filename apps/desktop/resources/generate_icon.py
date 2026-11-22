"""
把 chibi JK 图改成 AniBox 应用图标
流程：去白底 → 加圆角方块背景 → 居中 → 输出 PNG + ICO
"""
from PIL import Image, ImageDraw
import os

OUT_DIR = os.path.dirname(__file__)
SRC = os.path.join(os.path.dirname(OUT_DIR), "..", "568c41b7d5febc839eed815ea22295dd.png")

# 配色：sage green（默认主题色 #9CAF88）
BG_COLOR = (156, 175, 136)
BG_COLOR_DARK = (133, 153, 114)


def remove_white_bg(img: Image.Image, threshold: int = 235) -> Image.Image:
    """把白色/近白色像素变透明"""
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            # 接近白色 → 透明
            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (r, g, b, 0)
            # 边缘抗锯齿灰白 → 也设为透明
            elif r >= threshold - 20 and g >= threshold - 20 and b >= threshold - 20 and abs(r - g) < 10 and abs(g - b) < 10:
                pixels[x, y] = (r, g, b, max(0, a - 100))
    return img


def crop_to_content(img: Image.Image, padding: int = 8) -> Image.Image:
    """裁剪到非透明区域"""
    bbox = img.getbbox()
    if not bbox:
        return img
    left, top, right, bottom = bbox
    # 加 padding
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(img.width, right + padding)
    bottom = min(img.height, bottom + padding)
    return img.crop((left, top, right, bottom))


def make_rounded_box(size: int, bg_color: tuple, radius_ratio: float = 0.22) -> Image.Image:
    """画一个圆角方块"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = size * 0.0  # 图标填满整个尺寸
    box_size = size - 2 * margin
    radius = size * radius_ratio

    x0, y0 = margin, margin
    x1, y1 = margin + box_size, margin + box_size

    # 圆角矩形（用 RoundedRectangle 更准确，Pillow >= 8.2）
    try:
        draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=bg_color)
    except AttributeError:
        # 旧版本 fallback
        draw.rectangle([x0 + radius, y0, x1 - radius, y1], fill=bg_color)
        draw.rectangle([x0, y0 + radius, x1, y1 - radius], fill=bg_color)
        for cx, cy in [(x0 + radius, y0 + radius), (x1 - radius, y0 + radius),
                       (x0 + radius, y1 - radius), (x1 - radius, y1 - radius)]:
            draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=bg_color)

    # 顶部高光（轻微渐变模拟）
    highlight_h = int(box_size * 0.25)
    for i in range(highlight_h):
        y = int(y0) + i
        alpha = int(40 * (1 - i / highlight_h))
        if alpha > 0:
            for x in range(int(x0 + radius), int(x1 - radius)):
                if 0 <= x < size and 0 <= y < size:
                    existing = img.getpixel((x, y))
                    blended = _blend_pixel(existing, (255, 255, 255, alpha))
                    img.putpixel((x, y), blended)

    return img


def _blend_pixel(bg, fg):
    fa = fg[3] / 255.0
    ba = bg[3] / 255.0
    out_a = fa + ba * (1 - fa)
    if out_a == 0:
        return (0, 0, 0, 0)
    out_r = int((fg[0] * fa + bg[0] * ba * (1 - fa)) / out_a)
    out_g = int((fg[1] * fa + bg[1] * ba * (1 - fa)) / out_a)
    out_b = int((fg[2] * fa + bg[2] * ba * (1 - fa)) / out_a)
    return (out_r, out_g, out_b, int(out_a * 255))


def compose_icon(size: int, chibi: Image.Image) -> Image.Image:
    """组合：圆角背景 + 居中放置 chibi"""
    bg = make_rounded_box(size, BG_COLOR, radius_ratio=0.22)

    # chibi 缩放到合适大小（占图标 70%）
    chibi_target_size = int(size * 0.70)
    chibi_resized = chibi.resize(
        (chibi_target_size, chibi_target_size),
        Image.LANCZOS
    )

    # 居中粘贴
    x = (size - chibi_target_size) // 2
    y = (size - chibi_target_size) // 2
    bg.paste(chibi_resized, (x, y), chibi_resized)
    return bg


# --- 主流程 ---

print(f"加载源图: {SRC}")
chibi_raw = Image.open(SRC)
print(f"  尺寸: {chibi_raw.size}")

print("去白底...")
chibi_alpha = remove_white_bg(chibi_raw)

print("裁剪到内容...")
chibi_cropped = crop_to_content(chibi_alpha, padding=4)
print(f"  裁剪后: {chibi_cropped.size}")

# 缩放到统一尺寸以便复用
CHIBI_BASE = 512
chibi_scaled = chibi_cropped.resize((CHIBI_BASE, CHIBI_BASE), Image.LANCZOS)

# 输出 PNG 256
png_path = os.path.join(OUT_DIR, "icon.png")
icon256 = compose_icon(256, chibi_scaled)
icon256.save(png_path, "PNG")
print(f"✓ {png_path}")

# 输出 ICO（多尺寸）
ico_path = os.path.join(OUT_DIR, "icon.ico")
sizes = [16, 24, 32, 48, 64, 128, 256]
icons = [compose_icon(s, chibi_scaled) for s in sizes]
icons[0].save(
    ico_path,
    format="ICO",
    sizes=[(s, s) for s in sizes],
    append_images=icons[1:]
)
print(f"✓ {ico_path} ({len(sizes)} sizes)")
