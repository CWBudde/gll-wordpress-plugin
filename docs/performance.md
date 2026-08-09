# Performance

Measured with `npm run perf`, which runs `scripts/perf-corpus.mjs` over the
reference corpus of 29 real manufacturer GLL files. Re-run it before a release
and diff the table below.

## What this measures, and why it is not a test

The numbers here report rather than assert, so they are not a Jest test and are
not gated in CI. The corpus is machine-local, roughly 180 MB of third-party
vendor data that is not vendored into this repository, and shared CI runners
vary enough on CPU-bound WebAssembly that any threshold tight enough to catch a
real regression would flake instead.

## The finding that matters

**The parser's memory cost, not its speed, is the limit.**

A GLL expands enormously on the way through the parser: the largest file in the
corpus is 15.4 MB on disk and produces **228.7 MB of JSON**, roughly a
fifteenfold expansion, and leaves the Go WebAssembly instance holding **1.3 GB**
of linear memory. Go's heap grows and is never returned to the host, so that
figure is a floor for the tab, not a transient peak.

Practical consequences:

* Files up to about 2 MB parse in under a second and stay under ~180 MB. That
  covers 21 of the 29 corpus files, and is comfortable everywhere.
* Files of 10 MB and up need 800 MB to 1.3 GB of WebAssembly memory and 6 to
  11 seconds of parsing on a current laptop. That is a poor experience on
  desktop and is likely to fail outright on mobile, where per-tab WebAssembly
  memory is capped well below a gigabyte. **The plugin should not be assumed to
  work on phones or tablets for the largest line-array files.**
* Everything after parsing is free by comparison. Normalization runs in single
  digit milliseconds even for the largest file, balloon mesh construction in
  under 15 ms, and case geometry in about 1 ms. Optimizing any of those would be
  optimizing noise.

The expansion happens because the parser returns its result as a JSON *string*
which the browser must then decode into objects — the `JSON` and `Decode`
columns. Decoding alone costs about a second on the largest files and roughly
doubles peak memory while both representations are live.

## Notes on reading the table

`Go heap` is `instance.exports.mem.buffer.byteLength` after the parse, measured
with a **fresh WebAssembly instance per file**. Reusing one instance across the
sweep would report each file's memory as the running total of every file before
it, which reads like a per-file cost and is not one.

`Peak RSS` is the Node process, sampled every 5 ms. It includes whatever the
previous file left uncollected, so treat it as an upper bound rather than a
per-file figure; `Go heap` is the reliable number.

`Tris` is the balloon mesh triangle count at the default quality preset. It is
5184 for essentially every file because the mesh is built on the balloon's
angular grid, and almost every manufacturer measures on the same 10° × 10° grid.

## On the "100 MB+" target

`PLAN.md` originally asked Task 12.4 to test with GLL files of 100 MB or more.
No such file exists. The largest in the corpus is 15.4 MB, and that appears to
be near the real-world ceiling for the format. Padding a file to reach 100 MB
would produce something the parser rejects, so the measurement would describe
the error path and mean nothing. The criterion was amended to the corpus
ceiling, which is what the table reports.

## Results

Corpus: /mnt/projekte/Code/gll-tools/testdata/gll (29 files)
Machine: 12th Gen Intel(R) Core(TM) i7-1255U, 12 threads, node v24.12.0

| File | Size | Parse | JSON | Decode | Normalize | Balloon | Tris | Geometry | Go heap | Peak RSS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| example-cl.gll | 0.0 MB | 15 ms | 0.0 MB | 0 ms | 0 ms | 0 ms | 0 | 0 ms | 4.5 MB | 95.2 MB |
| example-la.gll | 0.0 MB | 5 ms | 0.0 MB | 0 ms | 0 ms | 0 ms | 0 | 0 ms | 4.5 MB | 107.5 MB |
| example-ls.gll | 0.0 MB | 5 ms | 0.0 MB | 0 ms | 0 ms | 0 ms | 0 | 0 ms | 4.5 MB | 107.8 MB |
| example-vis.gll | 0.0 MB | 13 ms | 0.0 MB | 0 ms | 1 ms | 1 ms | 144 | 0 ms | 4.5 MB | 107.8 MB |
| IG-100_gll.gll | 0.0 MB | 29 ms | 0.3 MB | 2 ms | 1 ms | 5 ms | 5184 | 2 ms | 6.5 MB | 110.0 MB |
| Omnio-5-V10.gll | 0.1 MB | 36 ms | 0.6 MB | 3 ms | 0 ms | 5 ms | 5184 | 4 ms | 8.0 MB | 115.0 MB |
| LX-10 ASX_gll.gll | 0.1 MB | 43 ms | 0.6 MB | 5 ms | 0 ms | 2 ms | 5184 | 1 ms | 8.8 MB | 118.6 MB |
| IG-80_gll.gll | 0.1 MB | 29 ms | 0.5 MB | 2 ms | 0 ms | 2 ms | 5184 | 1 ms | 8.3 MB | 119.5 MB |
| Scale-2_gll.gll | 0.3 MB | 451 ms | 8.3 MB | 43 ms | 1 ms | 13 ms | 5184 | 1 ms | 58.5 MB | 119.9 MB |
| Hybrid-1 active-Preset Standard_gll.gll | 0.4 MB | 487 ms | 8.3 MB | 40 ms | 1 ms | 10 ms | 5184 | 1 ms | 60.0 MB | 194.6 MB |
| Hybrid-1 passive-Preset Standard_gll.gll | 0.4 MB | 490 ms | 8.3 MB | 41 ms | 0 ms | 7 ms | 5184 | 1 ms | 60.0 MB | 213.0 MB |
| LX-60 ASX_gll.gll | 0.4 MB | 583 ms | 8.5 MB | 43 ms | 0 ms | 8 ms | 5184 | 1 ms | 65.0 MB | 220.0 MB |
| Scale-1_gll.gll | 0.6 MB | 1060 ms | 16.0 MB | 96 ms | 1 ms | 11 ms | 5184 | 1 ms | 88.5 MB | 235.0 MB |
| LX-20 ASX_gll.gll | 0.7 MB | 1139 ms | 16.0 MB | 113 ms | 1 ms | 19 ms | 5184 | 1 ms | 108.0 MB | 269.1 MB |
| XT-10_gll.gll | 0.7 MB | 904 ms | 16.1 MB | 46 ms | 0 ms | 8 ms | 5184 | 0 ms | 111.0 MB | 305.4 MB |
| Scale-1 POE_gll.gll | 0.7 MB | 970 ms | 16.2 MB | 90 ms | 1 ms | 15 ms | 5184 | 1 ms | 111.5 MB | 320.1 MB |
| D20-V10.gll | 0.9 MB | 1017 ms | 16.4 MB | 91 ms | 1 ms | 16 ms | 5184 | 1 ms | 88.0 MB | 335.8 MB |
| D12-v10.gll | 0.9 MB | 795 ms | 16.4 MB | 68 ms | 1 ms | 9 ms | 5184 | 0 ms | 88.0 MB | 324.6 MB |
| 3Way-LR.gll | 0.9 MB | 485 ms | 11.7 MB | 59 ms | 2 ms | 3 ms | 5184 | 0 ms | 79.5 MB | 429.7 MB |
| SCP-F-Sub Array V1_0.gll | 1.4 MB | 1186 ms | 28.5 MB | 83 ms | 1 ms | 11 ms | 5184 | 0 ms | 116.0 MB | 519.2 MB |
| SCP-F-V1_0.gll | 2.0 MB | 972 ms | 30.4 MB | 84 ms | 1 ms | 6 ms | 5184 | 0 ms | 178.5 MB | 600.8 MB |
| TiRAY-V1_3.gll | 6.1 MB | 4063 ms | 92.4 MB | 268 ms | 1 ms | 2 ms | 5184 | 0 ms | 429.5 MB | 676.7 MB |
| HOPS7-Pro V1_0.gll | 9.9 MB | 3157 ms | 84.3 MB | 228 ms | 1 ms | 4 ms | 5184 | 0 ms | 460.6 MB | 1112.3 MB |
| Coda-Audio G-Series-V1_2.gll | 10.0 MB | 5549 ms | 138.3 MB | 471 ms | 2 ms | 3 ms | 5184 | 1 ms | 819.8 MB | 1159.3 MB |
| APS-V1_1.gll | 12.7 MB | 10656 ms | 212.9 MB | 596 ms | 3 ms | 2 ms | 5184 | 0 ms | 1127.8 MB | 2299.2 MB |
| N-APS v1_0.gll | 13.1 MB | 7059 ms | 188.5 MB | 925 ms | 6 ms | 5 ms | 5184 | 1 ms | 1077.3 MB | 2837.6 MB |
| CoRay4-V1_5.gll | 13.4 MB | 15743 ms | 222.9 MB | 1496 ms | 2 ms | 7 ms | 5184 | 1 ms | 1180.5 MB | 2803.0 MB |
| N-RAY-V0_3 Beta.gll | 14.0 MB | 11675 ms | 226.1 MB | 808 ms | 2 ms | 2 ms | 5184 | 0 ms | 1230.0 MB | 2753.7 MB |
| CoRay4-Twin-V1_5.gll | 15.4 MB | 13367 ms | 228.7 MB | 1238 ms | 8 ms | 10 ms | 5184 | 1 ms | 1300.0 MB | 4446.3 MB |
