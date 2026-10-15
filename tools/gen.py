#!/usr/bin/env python3
"""Parallel runner for `varlik image` jobs.
Job file format (one per line, '|' separated):  name | flags | prompt
Lines starting with # are ignored. Existing outputs are skipped unless --force.
"""
import subprocess, sys, os, shlex, time
from concurrent.futures import ThreadPoolExecutor

STYLE = ("1930s rubber hose cartoon style, thick black ink outlines, vintage grainy print texture, "
         "muted warm colors, flat cel shading")

def run(job, outdir, force):
    name, flags, prompt = job
    out = os.path.join(outdir, name + ".png")
    if os.path.exists(out) and not force:
        return f"skip {name}"
    prompt = prompt.replace("{STYLE}", STYLE)
    cmd = ["varlik", "image", prompt, "--out", out] + shlex.split(flags)
    t = time.time()
    r = subprocess.run(cmd, capture_output=True, text=True)
    msg = (r.stdout + r.stderr).strip().splitlines()
    return f"{name}: {msg[-1] if msg else r.returncode} ({time.time()-t:.0f}s)"

def main():
    jobfile, outdir = sys.argv[1], sys.argv[2]
    par = int(sys.argv[3]) if len(sys.argv) > 3 else 6
    force = "--force" in sys.argv
    only = [a[len("--only="):].split(",") for a in sys.argv if a.startswith("--only=")]
    only = set(only[0]) if only else None
    os.makedirs(outdir, exist_ok=True)
    jobs = []
    for line in open(jobfile):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, flags, prompt = [p.strip() for p in line.split("|", 2)]
        if only and name not in only:
            continue
        jobs.append((name, flags, prompt))
    with ThreadPoolExecutor(par) as ex:
        for res in ex.map(lambda j: run(j, outdir, force), jobs):
            print(res, flush=True)

if __name__ == "__main__":
    main()
