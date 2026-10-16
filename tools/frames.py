
exec(open('tools/process.py').read().split("if __name__ == '__main__':")[0])
from PIL import Image
names = ['toadstool','raindrop','wateringcan','snufflet','beetle','stump','knight','frog','moth','mold','wisp','waxghost','cloud','balloon','slime','wraith']
info = {}
for n in names:
    a = fit(despill(Image.open(RAW + '/e_' + n + '.png')), 10000, 10000)
    b = fit(despill(Image.open(RAW + '/e_' + n + '_b.png')), 10000, 10000)
    s = min(200 / a.width, 200 / a.height, 1.0)
    bb = b.resize((max(1, round(b.width * s)), max(1, round(b.height * s))), Image.LANCZOS)
    cap = min(260 / bb.width, 260 / bb.height, 1.0)
    if cap < 1: bb = bb.resize((max(1, round(bb.width * cap)), max(1, round(bb.height * cap))), Image.LANCZOS)
    save_webp(bb, OUT + '/e_' + n + '_b.webp')
    info[n] = [round(a.height * s), bb.height]
    print(n, 'A h', round(a.height * s), 'B h', bb.height)

# area-matched scale corrections -> src/game/frames.ts
import json
def area(p):
    a = Image.open(p).convert('RGBA').getchannel('A')
    return sum(1 for v in a.getdata() if v > 128)
ks = {}
for n in names:
    ks['e_' + n] = round((area(OUT + '/e_' + n + '.webp') / max(1, area(OUT + '/e_' + n + '_b.webp'))) ** 0.5, 3)
open('src/game/frames.ts', 'w').write("/** Second animation frames for enemies: texture -> scale correction so both frames read the same size. */\nexport const FRAME_B: Record<string, number> = " + json.dumps(ks, indent=2) + ";\n")
