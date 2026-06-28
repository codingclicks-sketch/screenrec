// Correctness test for fix-webm-duration.js (run: node tests/fixwebm.test.js)
// Kept OUT of extension/ — Chrome rejects unpacked folders containing files
// whose names start with "_".
const lib = require('../extension/fix-webm-duration.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL:', m); } };
const parse = (arr) => { const f = lib.newFile(); f.setSource(new Uint8Array(arr)); return f; };

// helpers to hand-build EBML (independent of the lib's own encoders)
const tcScale = [0x2A,0xD7,0xB1, 0x83, 0x0F,0x42,0x40];          // TimecodeScale=1000000
const seg = (body) => [0x18,0x53,0x80,0x67, 0x80 + body.length, ...body];
const info = (body) => [0x15,0x49,0xA9,0x66, 0x80 + body.length, ...body];
const clusterDef = (payload) => [0x1F,0x43,0xB6,0x75, 0x80 + payload.length, ...payload];

// 1) Element-ID round-trip.
const bid = (id) => { const a = new Uint8Array(4); const n = lib.writeId(a, 0, id); return Array.from(a.slice(0, n)); };
ok(JSON.stringify(bid(0x8538067)) === JSON.stringify([0x18,0x53,0x80,0x67]), 'Segment id');
ok(JSON.stringify(bid(0x549a966)) === JSON.stringify([0x15,0x49,0xA9,0x66]), 'Info id');
ok(JSON.stringify(bid(0xad7b1)) === JSON.stringify([0x2A,0xD7,0xB1]), 'TimecodeScale id');
ok(JSON.stringify(bid(0x489)) === JSON.stringify([0x44,0x89]), 'Duration id');

// 2) Parse + patch + reparse, with an OPAQUE cluster (definite size).
{
  const clusterPayload = [0xAA,0xBB,0xCC,0xDD,0xEE];
  const f = parse(seg([...info(tcScale), ...clusterDef(clusterPayload)]));
  const s = f.getById(0x8538067);
  ok(!!s, 'parsed Segment');
  ok(s && s.getById(0x549a966), 'parsed Info');
  ok(s && s.getById(0x549a966).getById(0xad7b1) && s.getById(0x549a966).getById(0xad7b1).getValue() === 1000000, 'TimecodeScale reachable via Info = 1000000');
  ok(s && s.getById(0xf43b675) && JSON.stringify(Array.from(s.getById(0xf43b675).source)) === JSON.stringify(clusterPayload), 'cluster stays opaque + intact');
  ok(lib.patchDuration(f, 7500) === true, 'patchDuration true');
  const r = parse(Array.from(f.source));
  const dur = r.getById(0x8538067).getById(0x549a966).getById(0x489);
  ok(dur && Math.abs(dur.getValue() - 7500) < 0.001, 'Duration reads back 7500');
  const clu2 = r.getById(0x8538067).getById(0xf43b675);
  ok(clu2 && JSON.stringify(Array.from(clu2.source)) === JSON.stringify(clusterPayload), 'cluster byte-identical after patch');
}

// 3) FINDING #1 fix: cluster payload that is NON-EBML binary must NOT be recursed
//    (would have thrown before). Real SimpleBlock-ish bytes.
{
  const nasty = [0xA3,0x81,0x00,0x00,0x80,0xDE,0xAD,0xBE,0xEF];
  let threw = false, patched = false, preserved = false;
  try {
    const f = parse(seg([...info(tcScale), ...clusterDef(nasty)]));
    patched = lib.patchDuration(f, 1000) === true;
    const r = parse(Array.from(f.source));
    const c = r.getById(0x8538067).getById(0xf43b675);
    preserved = c && JSON.stringify(Array.from(c.source)) === JSON.stringify(nasty);
  } catch (e) { threw = true; }
  ok(!threw, 'non-EBML cluster payload does NOT throw');
  ok(patched, 'patch applies despite non-EBML cluster payload');
  ok(preserved, 'non-EBML cluster payload preserved verbatim');
}

// 4) FINDING #2 fix: unknown-size CHILD (cluster size = 0xFF) must BAIL (throw on parse).
{
  const unknownCluster = [0x1F,0x43,0xB6,0x75, 0xFF, 0xDE,0xAD];   // unknown 1-byte size
  let threw = false;
  try { parse(seg(unknownCluster)); } catch (e) { threw = true; }
  ok(threw, 'unknown-size child element bails (throws → fall back to original)');
}

// 5) Unknown-size SEGMENT (the normal MediaRecorder case) is allowed and patched.
{
  // Segment with 1-byte UNKNOWN size 0xFF, body = Info(tcScale) (runs to end).
  const body = info(tcScale);
  const f = parse([0x18,0x53,0x80,0x67, 0xFF, ...body]);
  ok(!!f.getById(0x8538067), 'unknown-size Segment parses');
  ok(lib.patchDuration(f, 3000) === true, 'unknown-size Segment patched');
  const r = parse(Array.from(f.source));
  const d = r.getById(0x8538067).getById(0x549a966).getById(0x489);
  ok(d && Math.abs(d.getValue() - 3000) < 0.001, 'Duration set on unknown-size Segment');
}

// 6) FINDING #3 fix: a Cues element present → refuse to patch (return false).
{
  const cues = [0x1C,0x53,0xBB,0x6B, 0x82, 0x00,0x00];   // Cues, 2 opaque bytes
  const f = parse(seg([...info(tcScale), ...cues]));
  ok(lib.patchDuration(f, 1000) === false, 'patch refused when Cues present');
}

// 7) Non-default TimecodeScale scales the duration value.
{
  const tc2 = [0x2A,0xD7,0xB1, 0x82, 0x27,0x10];          // 10000
  const f = parse(seg(info(tc2)));
  lib.patchDuration(f, 1000);
  const r = parse(Array.from(f.source));
  const d = r.getById(0x8538067).getById(0x549a966).getById(0x489).getValue();
  ok(Math.abs(d - (1000 * 1000000 / 10000)) < 0.001, 'duration scaled by TimecodeScale (100000)');
}

// 8) Truncated definite element bails.
{
  let threw = false;
  try { parse([0x18,0x53,0x80,0x67, 0x88, 0x00]); } catch (e) { threw = true; } // claims 8 bytes, has 1
  ok(threw, 'truncated element bails');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
