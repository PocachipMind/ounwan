"""오운완 앱 아이콘 생성: 파스텔 보라 배경 + 흰 아령 + 노란 반짝이. python tools/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

S = 1024  # 크게 그리고 줄임 (안티에일리어싱)
OUT = Path(__file__).resolve().parent.parent
LAV, LAV_DARK, PINK, YEL, WHITE = (169, 139, 245), (132, 102, 217), (255, 143, 171), (255, 215, 106), (255, 255, 255)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def make(rounded: bool) -> Image.Image:
    # 배경: 왼쪽 위 보라 → 오른쪽 아래 분홍 살짝
    bg = Image.new('RGB', (S, S))
    px = bg.load()
    for y in range(S):
        for x in range(S):
            px[x, y] = lerp(LAV, PINK, ((x + y) / (2 * S)) ** 2 * 0.55)

    # 아령 (살짝 기울임): 따로 그려서 회전
    db = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(db)
    cx, cy = S // 2, S // 2
    d.rounded_rectangle((cx - 230, cy - 34, cx + 230, cy + 34), 30, fill=WHITE)            # 손잡이
    for sx in (-1, 1):
        d.rounded_rectangle((cx + sx * 175 - 55, cy - 175, cx + sx * 175 + 55, cy + 175), 40, fill=WHITE)  # 큰 원판
        d.rounded_rectangle((cx + sx * 285 - 42, cy - 105, cx + sx * 285 + 42, cy + 105), 34, fill=WHITE)  # 작은 원판
    db = db.rotate(-28, resample=Image.BICUBIC, center=(cx, cy))

    # 아령 그림자 (진보라, 아래로)
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sh.paste((*LAV_DARK, 255), (0, 0), db.split()[3])
    sh = sh.filter(ImageFilter.GaussianBlur(6))
    img = bg.convert('RGBA')
    img.alpha_composite(sh, (0, 26))
    img.alpha_composite(db, (0, 0))

    # 노란 반짝이 (오른쪽 위)
    d = ImageDraw.Draw(img)
    def sparkle(x, y, r):
        w = r * 0.28
        d.polygon([(x, y - r), (x + w, y - w), (x + r, y), (x + w, y + w), (x, y + r), (x - w, y + w), (x - r, y), (x - w, y - w)], fill=YEL)
    sparkle(770, 250, 92)
    sparkle(860, 400, 44)

    if rounded:  # 파비콘/일반 아이콘은 둥근 모서리
        mask = Image.new('L', (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), 230, fill=255)
        img.putalpha(mask)
    return img


full = make(rounded=False)   # 안드로이드/아이폰이 알아서 모양 자름
round_ = make(rounded=True)
for size in (512, 192):
    full.resize((size, size), Image.LANCZOS).save(OUT / f'icon-{size}.png')
full.convert('RGB').resize((180, 180), Image.LANCZOS).save(OUT / 'apple-touch-icon.png')
round_.resize((64, 64), Image.LANCZOS).save(OUT / 'favicon.png')
print('ok')
