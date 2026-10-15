import subprocess, sys, struct, math
for f in sys.argv[1:]:
    raw = subprocess.run(["ffmpeg","-v","quiet","-i",f,"-ac","1","-ar","4000","-f","s16le","-"],capture_output=True).stdout
    n = len(raw)//2
    s = struct.unpack("<%dh"%n, raw)
    win = 4000
    vals=[]
    for i in range(0, n, win):
        seg = s[i:i+win]
        if not seg: break
        r = math.sqrt(sum(x*x for x in seg)/len(seg))
        vals.append(20*math.log10(r/32768+1e-9))
    print(f"{f.split('/')[-1]:14s} {n/4000:5.1f}s  " + " ".join(f"{v:4.0f}" for v in vals))
