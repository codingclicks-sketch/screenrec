/*
 * fix-webm-duration  —  bundled, zero dependencies.
 * EBML/Matroska duration patcher (algorithm after github.com/yusitnikov/fix-webm-duration, MIT).
 *
 * WHY: MediaRecorder records an open-ended live stream, so the WebM it produces
 * has NO Duration element in Segment > Info. Players therefore show no total
 * length and can't seek/scrub. This parses just enough of the EBML to write the
 * real Duration into Segment > Info, and returns a fixed Blob.
 *
 * SAFETY MODEL (important): the ONLY elements ever descended into are Segment and
 * Info. Clusters, Tracks, SeekHead, the EBML header, etc. are treated as OPAQUE
 * and copied verbatim — we never parse media payload as EBML. The patcher also
 * REFUSES to touch (returns the original blob) any file it can't change safely:
 *   - an unknown-size element anywhere other than the top-level Segment,
 *   - a truncated/definite element that runs past EOF,
 *   - a Cues seek index (inserting Duration would shift its byte offsets).
 * On ANY error it returns the ORIGINAL blob. So a recording is never corrupted;
 * worst case it is left exactly as MediaRecorder produced it (no Duration added).
 *
 *   window.fixWebmDuration(blob, durationMs) -> Promise<Blob>
 */
(function (global) {
  'use strict';

  // EBML element IDs, STRIPPED of their length-marker bit (how readUint returns
  // them). We only descend into Segment and Info; everything else stays opaque.
  var SEGMENT = 0x8538067;
  var INFO = 0x549a966;
  var TIMECODE_SCALE = 0xad7b1;
  var DURATION = 0x489;
  var CUES = 0xc53bb6b;            // 0x1C53BB6B — presence makes inserting unsafe
  var sections = {
    0x8538067: ['Segment', 'Container'],
    0x549a966: ['Info', 'Container'],
    0xad7b1: ['TimecodeScale', 'Uint'],
    0x489: ['Duration', 'Float'],
  };

  function inherit(Child, Parent) {
    Child.prototype = Object.create(Parent.prototype);
    Child.prototype.constructor = Child;
  }

  // ── Base (opaque element: source preserved verbatim) ────────────────────────
  function WebmBase(name, type) { this.name = name || 'Unknown'; this.type = type || 'Unknown'; }
  WebmBase.prototype.updateBySource = function () {};
  WebmBase.prototype.setSource = function (source) { this.source = source; this.updateBySource(); };
  WebmBase.prototype.updateByData = function () {};
  WebmBase.prototype.setData = function (data) { this.data = data; this.updateByData(); };

  // ── Unsigned int ────────────────────────────────────────────────────────────
  function WebmUint(name, type) { WebmBase.call(this, name, type || 'Uint'); }
  inherit(WebmUint, WebmBase);
  function padHex(hex) { return hex.length % 2 === 1 ? '0' + hex : hex; }
  WebmUint.prototype.updateBySource = function () {
    this.data = '';
    for (var i = 0; i < this.source.length; i++) this.data += padHex(this.source[i].toString(16));
  };
  WebmUint.prototype.updateByData = function () {
    var length = this.data.length / 2;
    this.source = new Uint8Array(length);
    for (var i = 0; i < length; i++) this.source[i] = parseInt(this.data.substr(i * 2, 2), 16);
  };
  WebmUint.prototype.getValue = function () { return parseInt(this.data, 16); };
  WebmUint.prototype.setValue = function (v) { this.setData(padHex(v.toString(16))); };

  // ── Float (Duration) ────────────────────────────────────────────────────────
  function WebmFloat(name, type) { WebmBase.call(this, name, type || 'Float'); }
  inherit(WebmFloat, WebmBase);
  WebmFloat.prototype.getFloatArrayType = function () {
    return this.source && this.source.length === 4 ? Float32Array : Float64Array;
  };
  WebmFloat.prototype.updateBySource = function () {
    var be = this.source.slice().reverse();            // EBML floats are big-endian
    var FloatArrayType = this.getFloatArrayType();
    this.data = new FloatArrayType(be.buffer)[0];
  };
  WebmFloat.prototype.updateByData = function () {
    var FloatArrayType = this.getFloatArrayType();
    var floatArray = new FloatArrayType([this.data]);
    this.source = new Uint8Array(floatArray.buffer).slice().reverse();
  };
  WebmFloat.prototype.getValue = function () { return this.data; };
  WebmFloat.prototype.setValue = function (v) { this.setData(v); };

  // ── vint / id helpers ────────────────────────────────────────────────────────
  function vintLength(value) { var len = 1; while (value >= Math.pow(2, 7 * len) - 1 && len < 8) len++; return len; }
  function writeVint(target, offset, value) {
    var len = vintLength(value);
    var v = value + Math.pow(2, 7 * len);
    for (var i = len - 1; i >= 0; i--) { target[offset + i] = v % 256; v = Math.floor(v / 256); }
    return len;
  }
  function idLength(id) { var len = 1; while (id >= Math.pow(2, 7 * len) && len < 4) len++; return len; }
  function writeId(target, offset, id) {
    var len = idLength(id);
    var v = id + Math.pow(2, 7 * len);
    for (var i = len - 1; i >= 0; i--) { target[offset + i] = v % 256; v = Math.floor(v / 256); }
    return len;
  }

  // ── Container (only Segment + Info are ever Containers) ───────────────────────
  function WebmContainer(name, type) { WebmBase.call(this, name, type || 'Container'); this.depth = 0; }
  inherit(WebmContainer, WebmBase);
  WebmContainer.prototype.readByte = function () { return this.source[this.offset++]; };
  WebmContainer.prototype.readUint = function () {
    var firstByte = this.readByte();
    if (firstByte === undefined) throw new Error('eof');
    if (firstByte === 0) throw new Error('invalid vint (0x00)');   // implies >8-byte vint
    var bytes = 8 - firstByte.toString(2).length;
    var value = firstByte - (1 << (7 - bytes));
    for (var i = 0; i < bytes; i++) {
      var b = this.readByte();
      if (b === undefined) throw new Error('eof in vint');
      value = value * 256 + b;
    }
    this._lastVintLen = bytes + 1;
    return value;
  };
  WebmContainer.prototype.updateBySource = function () {
    var end;
    this.data = [];
    for (this.offset = 0; this.offset < this.source.length; this.offset = end) {
      var id = this.readUint();
      var len = this.readUint();
      var vlen = this._lastVintLen;
      var unknown = (len === Math.pow(2, 7 * vlen) - 1);   // all data bits set = unknown size
      if (unknown) {
        // Unknown size is only safe for the outermost Segment (last top-level
        // element). Anywhere deeper, re-emitting would mis-merge siblings → bail.
        if (this.depth > 0) throw new Error('unsafe unknown-size element');
        end = this.source.length;
      } else {
        end = this.offset + len;
        if (end > this.source.length) throw new Error('truncated element');  // never silently clamp
      }
      var slice = this.source.slice(this.offset, end);
      var info = sections[id] || ['Unknown', null];
      var Ctor = info[1] === 'Container' ? WebmContainer
               : info[1] === 'Uint' ? WebmUint
               : info[1] === 'Float' ? WebmFloat : WebmBase;
      var section = new Ctor(info[0], info[1]);
      if (Ctor === WebmContainer) section.depth = this.depth + 1;
      section.setSource(slice);
      this.data.push({ id: id, data: section });
    }
  };
  WebmContainer.prototype.updateByData = function () {
    var total = 0, i;
    for (i = 0; i < this.data.length; i++) {
      var s = this.data[i].data.source;
      total += idLength(this.data[i].id) + vintLength(s.length) + s.length;
    }
    var out = new Uint8Array(total), off = 0;
    for (i = 0; i < this.data.length; i++) {
      var src = this.data[i].data.source;
      off += writeId(out, off, this.data[i].id);
      off += writeVint(out, off, src.length);
      out.set(src, off); off += src.length;
    }
    this.source = out;
  };
  WebmContainer.prototype.getById = function (id) {
    for (var i = 0; i < this.data.length; i++) if (this.data[i].id === id) return this.data[i].data;
    return null;
  };

  // ── Patch a parsed file in place. Returns true iff Duration was set. ──────────
  function patchDuration(file, durationMs) {
    var segment = file.getById(SEGMENT);
    if (!segment || segment.type !== 'Container') return false;
    // A Cues seek index stores absolute byte offsets; inserting/growing Duration
    // shifts everything after Info, so don't risk it — leave the file untouched.
    if (segment.getById(CUES)) return false;
    var info = segment.getById(INFO);
    if (!info || info.type !== 'Container') return false;

    // Matroska Duration is a float in TimecodeScale units (ns each).
    var scaleEl = info.getById(TIMECODE_SCALE);
    var timecodeScale = scaleEl && scaleEl.getValue ? scaleEl.getValue() : 1000000; // default 1ms
    if (!timecodeScale || !isFinite(timecodeScale)) timecodeScale = 1000000;
    var durationValue = (durationMs * 1000000) / timecodeScale;
    if (!isFinite(durationValue) || durationValue <= 0) return false;

    var duration = info.getById(DURATION);
    if (duration) {
      if (duration.type !== 'Float') return false;
      duration.setValue(durationValue);
    } else {
      duration = new WebmFloat('Duration', 'Float');
      duration.setValue(durationValue);
      info.data.push({ id: DURATION, data: duration });
    }
    info.updateByData();
    segment.updateByData();
    file.updateByData();
    return true;
  }

  function newFile() { var f = new WebmContainer('File', 'Container'); f.depth = 0; return f; }

  // ── Public API ────────────────────────────────────────────────────────────────
  function fixWebmDuration(blob, durationMs) {
    return new Promise(function (resolve) {
      var safeResolve = function (b) { resolve(b || blob); };
      try {
        if (!blob || !(durationMs > 0)) return safeResolve(blob);
        var reader = new FileReader();
        reader.onloadend = function () {
          try {
            var source = new Uint8Array(reader.result);
            var file = newFile();
            file.setSource(source);
            if (!patchDuration(file, durationMs)) return safeResolve(blob);

            // Re-parse the output and confirm Duration reads back before trusting it.
            var check = newFile();
            check.setSource(file.source);
            var seg = check.getById(SEGMENT);
            var inf = seg && seg.getById(INFO);
            var dur = inf && inf.getById(DURATION);
            if (!dur || !(dur.getValue() > 0)) return safeResolve(blob);

            safeResolve(new Blob([file.source], { type: blob.type || 'video/webm' }));
          } catch (e) { safeResolve(blob); }
        };
        reader.onerror = function () { safeResolve(blob); };
        reader.readAsArrayBuffer(blob);
      } catch (e) { safeResolve(blob); }
    });
  }

  global.fixWebmDuration = fixWebmDuration;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { fixWebmDuration, WebmContainer, WebmUint, WebmFloat, writeVint, writeId, vintLength, idLength, sections, patchDuration, newFile };
  }
})(typeof window !== 'undefined' ? window : this);
