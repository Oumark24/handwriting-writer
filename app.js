/* My Handwriting Writer - plain JS, no dependencies, runs fully in the browser. */
(function () {
  "use strict";

  var FONT = '"My Handwriting", sans-serif';
  // Characters that exist in the owner's font (everything else shows in a plain fallback font).
  var SUPPORTED = new Set(
    ("!\"#$&'()+,-./0123456789:;?@ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz \n" +
     // added from the "extra characters" page: symbols + Spanish accents
     "%=<>_[]`{}~^|\\" +
     "\u00E9\u00E8\u00EA\u00E1\u00E0\u00E2\u00ED\u00F3\u00F4\u00FA\u00FC\u00E7" + // é è ê á à â í ó ô ú ü ç
     "\u00C9\u00D1\u00C1\u00CD\u00D3\u00DA\u00BF\u00A1").split("")
  );

  var AI_NOTE =
    "Please answer the questions in the attached worksheet in PLAIN TEXT only.\n" +
    "- Number every answer to match the question number: 1. 2. 3. (one answer per number).\n" +
    "- If a question has parts, label them a) b) c) on separate lines under that number.\n" +
    "- No bold, no italics, no bullet points, no tables, no headings, no LaTeX, no emoji.\n" +
    "- Keep each answer short enough to fit in a blank on the worksheet. No explanations unless a question asks for one.\n" +
    "- Only use letters, numbers and these symbols: . , ; : ! ? ' \" ( ) - + / & @ # $ % = < > [ ] { } ~ ^ | \\ _ and `\n" +
    "- Accents are fine for these letters: \u00E1 \u00E9 \u00ED \u00F3 \u00FA \u00FC \u00E7 \u00E0 \u00E8 \u00E2 \u00EA \u00F4 \u00C1 \u00C9 \u00CD \u00D3 \u00DA \u00D1 and \u00BF \u00A1. Write \u00F1 as \"n\".\n" +
    "- Write any other symbol out in words (say \"times\" instead of *, \"euros\" instead of the euro sign, \"pounds\" instead of the pound sign, \"degrees\" instead of the degree sign).\n" +
    "- Write math simply, like 3/4, x^2, sqrt(9), 2 x 5.\n" +
    "- Give me only the numbered answers, nothing before or after them.";

  var $ = function (id) { return document.getElementById(id); };
  var cv = $("cv"), ctx = cv.getContext("2d");
  var measure = document.createElement("canvas").getContext("2d");

  var LINED_W = 816, LINED_H = 1056, LINED_SCALE = 2.5;

  var state = {
    mode: "photo",
    photoPages: [],        // {kind:'photo', canvas, w, h, boxes:[]}
    cur: 0,
    sel: null,             // selected box
    nextId: 1,
    ink: "#141414",
    zoom: 1,
    lined: { size: 30, space: 34, rules: true, margin: true }
  };
  var ready = false;
  var drag = null;

  /* ------------------------------------------------------------ text helpers */
  function normalize(t) {
    return String(t == null ? "" : t)
      .normalize("NFC") // so "e" + combining accent counts as the single letter
      .replace(/\r\n?/g, "\n")
      .replace(/[\u2018\u2019\u02BC\u00B4]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014\u2212\u2011\u2010]/g, "-")
      .replace(/\u2026/g, "...")
      .replace(/[\u00A0\u2009\u202F\u2002\u2003]/g, " ")
      .replace(/\u00D7/g, "x")
      .replace(/\u00F7/g, "/")
      .replace(/\t/g, "    ")
      .replace(/\*\*|__/g, ""); // chatbot bold/underline marks
  }
  function unsupportedIn(texts) {
    var seen = {}, out = [];
    texts.forEach(function (t) {
      normalize(t).split("").forEach(function (ch) {
        if (!SUPPORTED.has(ch) && !seen[ch]) { seen[ch] = 1; out.push(ch); }
      });
    });
    return out;
  }
  function wrapText(text, size, maxW) {
    measure.font = size + "px " + FONT;
    var out = [];
    normalize(text).split("\n").forEach(function (para) {
      if (para === "") { out.push(""); return; }
      var words = para.split(" "), line = "";
      words.forEach(function (w) {
        var test = line === "" ? w : line + " " + w;
        if (maxW > 0 && line !== "" && measure.measureText(test).width > maxW) {
          out.push(line); line = w;
        } else { line = test; }
      });
      out.push(line);
    });
    return out;
  }

  /* ------------------------------------------------------------ pages */
  function linedPages() {
    var L = state.lined;
    var top = 84, left = 96, right = 48, bottom = 56;
    var perPage = Math.max(1, Math.floor((LINED_H - top - bottom) / L.space));
    var lines = wrapText($("answers").value, L.size, LINED_W - left - right);
    var pages = [], i = 0;
    do {
      pages.push({ kind: "lined", w: LINED_W, h: LINED_H, lines: lines.slice(i, i + perPage), perPage: perPage,
                   top: top, left: left });
      i += perPage;
    } while (i < lines.length);
    return pages;
  }
  function getPages() { return state.mode === "photo" ? state.photoPages : linedPages(); }
  function curPage() {
    var p = getPages();
    if (!p.length) return null;
    if (state.cur >= p.length) state.cur = p.length - 1;
    if (state.cur < 0) state.cur = 0;
    return p[state.cur];
  }

  /* ------------------------------------------------------------ boxes */
  function newBox(page, opts) {
    var b = {
      id: state.nextId++, text: "", x: page.w * 0.06, y: page.h * 0.06,
      size: Math.round(page.w * 0.034), width: page.w * 0.5, rot: 0, lh: 1.25,
      color: state.ink, label: ""
    };
    for (var k in opts) b[k] = opts[k];
    return b;
  }
  function layoutBox(b) {
    var lines = wrapText(b.text, b.size, b.width);
    measure.font = b.size + "px " + FONT;
    var w = 0;
    lines.forEach(function (l) { w = Math.max(w, measure.measureText(l).width); });
    return { lines: lines, w: w, frameW: Math.max(b.width, w), h: Math.max(1, lines.length) * b.size * b.lh };
  }
  function drawBoxText(c, b) {
    var L = layoutBox(b);
    c.save();
    c.translate(b.x, b.y);
    c.rotate(b.rot * Math.PI / 180);
    c.font = b.size + "px " + FONT;
    c.textBaseline = "alphabetic";
    c.fillStyle = b.color;
    L.lines.forEach(function (ln, i) { c.fillText(ln, 0, b.size * 0.8 + i * b.size * b.lh); });
    c.restore();
    return L;
  }

  /* ------------------------------------------------------------ rendering */
  function drawPage(c, page, s, ui) {
    c.setTransform(s, 0, 0, s, 0, 0);
    c.clearRect(0, 0, page.w, page.h);
    if (page.kind === "photo") {
      c.imageSmoothingQuality = "high";
      c.drawImage(page.canvas, 0, 0, page.w, page.h);
      c.globalCompositeOperation = "multiply";
      page.boxes.forEach(function (b) { drawBoxText(c, b); });
      c.globalCompositeOperation = "source-over";
      if (ui) drawOverlays(c, page);
    } else {
      var L = state.lined;
      c.fillStyle = "#ffffff"; c.fillRect(0, 0, page.w, page.h);
      if (L.rules) {
        c.strokeStyle = "#b7cde8"; c.lineWidth = 1;
        for (var i = 0; i < page.perPage; i++) {
          var y = Math.round(page.top + (i + 1) * L.space) + 0.5;
          c.beginPath(); c.moveTo(0, y); c.lineTo(page.w, y); c.stroke();
        }
      }
      if (L.margin) {
        c.strokeStyle = "#e9a3a3"; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(page.left - 14, 0); c.lineTo(page.left - 14, page.h); c.stroke();
      }
      c.font = L.size + "px " + FONT; c.textBaseline = "alphabetic"; c.fillStyle = state.ink;
      page.lines.forEach(function (ln, i) {
        c.fillText(ln, page.left, page.top + (i + 1) * L.space - 3);
      });
    }
  }
  function unit() { // page units per CSS pixel on the preview
    var page = curPage();
    return page ? page.w / (cv.getBoundingClientRect().width || 1) : 1;
  }
  function handles(b, L) {
    var u = unit(), r = 12 * u;
    return {
      r: r,
      width: { x: L.frameW + 0 * u, y: -r * 1.3 },
      size: { x: L.frameW, y: L.h + r * 1.3 }
    };
  }
  function drawOverlays(c, page) {
    var u = unit();
    page.boxes.forEach(function (b) {
      var L = layoutBox(b), sel = b === state.sel;
      c.save();
      c.translate(b.x, b.y); c.rotate(b.rot * Math.PI / 180);
      c.lineWidth = (sel ? 2 : 1) * u;
      c.setLineDash([6 * u, 4 * u]);
      c.strokeStyle = sel ? "#1c6bff" : "rgba(28,107,255,.45)";
      c.strokeRect(0, 0, L.frameW, L.h);
      c.setLineDash([]);
      if (b.label !== "") { // small tag with the answer number
        var t = "#" + b.label, fs = 10 * u;
        c.font = "bold " + fs + "px system-ui, sans-serif";
        var tw = c.measureText(t).width + 8 * u;
        c.fillStyle = sel ? "rgba(28,107,255,.9)" : "rgba(28,107,255,.45)";
        c.fillRect(0, -fs - 5 * u, tw, fs + 5 * u);
        c.fillStyle = "#fff"; c.textBaseline = "middle";
        c.fillText(t, 4 * u, -(fs + 5 * u) / 2);
      }
      if (sel) {
        var h = handles(b, L);
        c.fillStyle = "#1c6bff"; c.strokeStyle = "#fff"; c.lineWidth = 2 * u;
        c.beginPath(); c.arc(h.size.x, h.size.y, h.r, 0, 7); c.fill(); c.stroke();
        c.fillRect(h.width.x - h.r, h.width.y - h.r, h.r * 2, h.r * 2);
        c.strokeRect(h.width.x - h.r, h.width.y - h.r, h.r * 2, h.r * 2);
        // little glyphs inside handles
        c.strokeStyle = "#fff"; c.lineWidth = 2 * u; c.beginPath();
        c.moveTo(h.size.x - h.r * .45, h.size.y - h.r * .45); c.lineTo(h.size.x + h.r * .45, h.size.y + h.r * .45);
        c.moveTo(h.width.x - h.r * .5, h.width.y); c.lineTo(h.width.x + h.r * .5, h.width.y);
        c.stroke();
      }
      c.restore();
    });
  }

  function render() {
    var page = curPage();
    var stage = $("stage"), empty = $("empty");
    var has = !!page;
    stage.hidden = !has; empty.hidden = has;
    $("boxPanel").hidden = !(state.mode === "photo" && state.sel);
    $("pageActions").hidden = state.mode !== "photo";
    $("placeHint").hidden = state.mode !== "photo";
    updateLabels();
    $("step3").textContent = state.mode === "photo" ? "Place the writing" : "Check the page";
    if (!has) return;
    var pages = getPages();
    $("pgLabel").textContent = "Page " + (state.cur + 1) + " of " + pages.length;
    $("prevPg").disabled = state.cur === 0;
    $("nextPg").disabled = state.cur >= pages.length - 1;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = (state.zoom * 100) + "%";
    var cssW = cv.getBoundingClientRect().width || stage.clientWidth;
    var bw = Math.max(50, Math.round(cssW * dpr));
    var bh = Math.round(bw * page.h / page.w);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    drawPage(ctx, page, bw / page.w, true);
    updateWarn();
  }

  function updateLabels() {
    var photo = state.mode === "photo";
    $("photoSetup").hidden = !photo; $("linedSetup").hidden = photo;
    $("photoButtons").hidden = !photo; $("linedButtons").hidden = photo;
    $("modePhoto").classList.toggle("on", photo); $("modeLined").classList.toggle("on", !photo);
    $("empty").textContent = "Upload a worksheet photo to start.";
    $("rmPage").disabled = !state.photoPages.length;
    $("addBox").disabled = !state.photoPages.length;
    $("splitBtn").disabled = !state.photoPages.length;
    $("oneBtn").disabled = !state.photoPages.length;
    document.querySelectorAll(".ink").forEach(function (b) {
      b.classList.toggle("on", state.sel ? b.dataset.ink === state.sel.color : b.dataset.ink === state.ink);
    });
  }
  function updateWarn() {
    var texts = state.mode === "photo"
      ? state.photoPages.reduce(function (a, p) { return a.concat(p.boxes.map(function (b) { return b.text; })); }, [])
      : [$("answers").value];
    var bad = unsupportedIn(texts);
    var w = $("warn");
    if (bad.length) {
      w.hidden = false;
      w.textContent = "Your handwriting font doesn't have these yet: " + bad.map(function (c) { return c === "\u00A0" ? "(space)" : c; }).join("  ") +
        ". They will show in a plain font. Ask the chatbot to write them in words (for example \"times\" instead of *).";
    } else { w.hidden = true; }
  }

  /* ------------------------------------------------------------ photos */
  function loadPhoto(file) {
    return new Promise(function (resolve, reject) {
      function fromSource(src, sw, sh) {
        var max = 2200, k = Math.min(1, max / Math.max(sw, sh));
        var c = document.createElement("canvas");
        c.width = Math.round(sw * k); c.height = Math.round(sh * k);
        var g = c.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
        g.imageSmoothingQuality = "high";
        g.drawImage(src, 0, 0, c.width, c.height);
        resolve({ kind: "photo", canvas: c, w: c.width, h: c.height, boxes: [] });
      }
      if (window.createImageBitmap) {
        createImageBitmap(file, { imageOrientation: "from-image" }).then(function (bm) {
          fromSource(bm, bm.width, bm.height);
        }).catch(viaImg);
      } else viaImg();
      function viaImg() {
        var url = URL.createObjectURL(file), im = new Image();
        im.onload = function () { fromSource(im, im.naturalWidth, im.naturalHeight); URL.revokeObjectURL(url); };
        im.onerror = function () { reject(new Error("Could not read that image.")); };
        im.src = url;
      }
    });
  }
  function addPhotos(files) {
    var list = Array.prototype.slice.call(files);
    if (!list.length) return;
    status("Loading photo…");
    list.reduce(function (p, f) {
      return p.then(function () {
        return loadPhoto(f).then(function (pg) { state.photoPages.push(pg); state.cur = state.photoPages.length - 1; state.sel = null; });
      });
    }, Promise.resolve()).then(function () {
      status(""); render();
    }).catch(function (e) { status(e.message); });
  }

  /* ------------------------------------------------------------ answers -> boxes */
  function parseNumbered(text) {
    var items = [], re = /^\s*\(?(\d{1,3})[.):]\s+\S/;
    text.replace(/\r\n?/g, "\n").split("\n").forEach(function (ln) {
      var m = re.exec(ln);
      if (m) {
        items.push({ n: m[1], lines: [ln.replace(/^\s*\(?\d{1,3}[.):]\s+/, "")] });
      } else if (items.length) {
        if (ln.trim() === "" ) return;
        items[items.length - 1].lines.push(ln.trim());
      } else if (ln.trim() !== "") {
        items.push({ n: "", lines: [ln.trim()] });
      }
    });
    return items;
  }
  function splitIntoBoxes() {
    var page = curPage(); if (!page || page.kind !== "photo") return;
    var items = parseNumbered($("answers").value);
    if (!items.length) { status("Paste some answers first."); return; }
    var keep = $("keepNums") && $("keepNums").checked;
    var colW = page.w * 0.42, x = page.w * 0.06, y = page.h * 0.05, gap = page.w * 0.012;
    var col = 0, made = [];
    items.forEach(function (it) {
      var txt = it.lines.join("\n");
      if (keep && it.n) txt = it.n + ". " + txt;
      var b = newBox(page, { text: txt, label: it.n, width: colW, x: x, y: y });
      var L = layoutBox(b);
      if (y + L.h > page.h * 0.97 && col === 0) { col = 1; x = page.w * 0.52; y = page.h * 0.05; b.x = x; b.y = y; }
      y += L.h + gap; b.y = b.y; made.push(b);
      page.boxes.push(b);
    });
    state.sel = made[0] || null;
    syncPanel(); render();
    status(made.length + " boxes added. Drag each one onto its blank.");
  }
  function oneBox() {
    var page = curPage(); if (!page || page.kind !== "photo") return;
    var t = $("answers").value;
    if (!t.trim()) { status("Paste some answers first."); return; }
    var b = newBox(page, { text: t.trim(), width: page.w * 0.88 });
    page.boxes.push(b); state.sel = b; syncPanel(); render();
    status("Added one box. Drag it where you want it.");
  }

  /* ------------------------------------------------------------ panel sync */
  function syncPanel() {
    var b = state.sel, page = curPage();
    if (!b || !page) return;
    $("bxText").value = b.text;
    $("bxSize").value = b.size; $("bxSize").max = Math.round(page.w * 0.12);
    $("bxWidth").value = Math.round(b.width / page.w * 100);
    $("bxRot").value = b.rot; $("bxLh").value = b.lh;
  }

  /* ------------------------------------------------------------ pointer interaction */
  function pagePoint(e) {
    var r = cv.getBoundingClientRect(), page = curPage();
    return { x: (e.clientX - r.left) * page.w / r.width, y: (e.clientY - r.top) * page.h / r.height };
  }
  function toLocal(b, p) {
    var a = -b.rot * Math.PI / 180, dx = p.x - b.x, dy = p.y - b.y;
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
  }
  function hitTest(e) {
    var page = curPage();
    if (!page || page.kind !== "photo") return null;
    var p = pagePoint(e), u = unit(), hitR = 24 * u, i;
    var sb = state.sel;
    if (sb && page.boxes.indexOf(sb) >= 0) {
      var L = layoutBox(sb), h = handles(sb, L), lp = toLocal(sb, p);
      if (Math.hypot(lp.x - h.size.x, lp.y - h.size.y) < hitR) return { box: sb, part: "size", p: p, lp: lp, L: L };
      if (Math.hypot(lp.x - h.width.x, lp.y - h.width.y) < hitR) return { box: sb, part: "width", p: p, lp: lp, L: L };
    }
    for (i = page.boxes.length - 1; i >= 0; i--) {
      var b = page.boxes[i], l2 = layoutBox(b), q = toLocal(b, p), pad = 6 * u;
      if (q.x >= -pad && q.x <= l2.frameW + pad && q.y >= -pad && q.y <= l2.h + pad)
        return { box: b, part: "move", p: p, lp: q, L: l2 };
    }
    return null;
  }
  cv.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) return;
    var t = e.touches[0];
    if (hitTest({ clientX: t.clientX, clientY: t.clientY })) e.preventDefault(); // grab the box, don't scroll
  }, { passive: false });

  cv.addEventListener("pointerdown", function (e) {
    var h = hitTest(e);
    if (!h) { if (state.sel) { state.sel = null; render(); } return; }
    state.sel = h.box; syncPanel();
    drag = { part: h.part, box: h.box, start: h.p, bx: h.box.x, by: h.box.y, size: h.box.size, width: h.box.width,
             d0: Math.max(1, Math.hypot(h.lp.x, h.lp.y)), lx0: h.lp.x, id: e.pointerId };
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault(); render();
  });
  cv.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var p = pagePoint(e), b = drag.box, page = curPage();
    if (drag.part === "move") {
      b.x = drag.bx + (p.x - drag.start.x); b.y = drag.by + (p.y - drag.start.y);
    } else if (drag.part === "size") {
      var lp = toLocal(b, p), d = Math.hypot(lp.x, lp.y);
      b.size = Math.max(8, Math.min(page.w * 0.12, drag.size * d / drag.d0));
      b.size = Math.round(b.size * 2) / 2;
    } else if (drag.part === "width") {
      var lw = toLocal(b, p);
      b.width = Math.max(page.w * 0.05, Math.min(page.w * 1.2, drag.width + (lw.x - drag.lx0)));
    }
    syncPanel(); render();
  });
  function endDrag(e) { if (drag && (!e || e.pointerId === drag.id)) drag = null; }
  cv.addEventListener("pointerup", endDrag);
  cv.addEventListener("pointercancel", endDrag);

  /* ------------------------------------------------------------ PDF + image export */
  function exportCanvas(page) {
    var s = page.kind === "lined" ? LINED_SCALE : 1;
    var c = document.createElement("canvas");
    c.width = Math.round(page.w * s); c.height = Math.round(page.h * s);
    var g = c.getContext("2d");
    drawPage(g, page, c.width / page.w, false);
    return c;
  }
  function canvasBlob(c, type, q) {
    return new Promise(function (res) { c.toBlob(res, type, q); });
  }
  function buildPdf(imgs) {
    var enc = new TextEncoder(), chunks = [], offsets = [], len = 0;
    function put(x) { var u = typeof x === "string" ? enc.encode(x) : x; chunks.push(u); len += u.length; }
    function obj(n, body) { offsets[n] = len; put(n + " 0 obj\n" + body + "\nendobj\n"); }
    put("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    var n = imgs.length, kids = [];
    for (var i = 0; i < n; i++) kids.push((3 + i * 3) + " 0 R");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + n + " >>");
    imgs.forEach(function (im, i) {
      var pg = 3 + i * 3, ct = pg + 1, xi = pg + 2;
      var pw = 612, ph = Math.round(612 * im.h / im.w * 100) / 100;
      obj(pg, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pw + " " + ph + "] /Resources << /XObject << /Im0 " + xi +
             " 0 R >> >> /Contents " + ct + " 0 R >>");
      var cs = "q " + pw + " 0 0 " + ph + " 0 0 cm /Im0 Do Q";
      obj(ct, "<< /Length " + cs.length + " >>\nstream\n" + cs + "\nendstream");
      offsets[xi] = len;
      put(xi + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + im.w + " /Height " + im.h +
          " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + im.data.length + " >>\nstream\n");
      put(im.data); put("\nendstream\nendobj\n");
    });
    var total = 3 + n * 3, xref = len;
    var x = "xref\n0 " + total + "\n0000000000 65535 f \n";
    for (var k = 1; k < total; k++) x += ("0000000000" + offsets[k]).slice(-10) + " 00000 n \n";
    x += "trailer\n<< /Size " + total + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    put(x);
    return new Blob(chunks, { type: "application/pdf" });
  }
  function save(blob, name) {
    var a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }
  function makePdf() {
    var pages = getPages();
    if (!pages.length || (state.mode === "photo" && !state.photoPages.length)) { status("Nothing to download yet."); return Promise.resolve(null); }
    status("Making your PDF…");
    var out = [];
    return pages.reduce(function (p, pg) {
      return p.then(function () {
        var c = exportCanvas(pg);
        return canvasBlob(c, "image/jpeg", 0.92).then(function (b) { return b.arrayBuffer(); }).then(function (ab) {
          out.push({ data: new Uint8Array(ab), w: c.width, h: c.height });
        });
      });
    }, Promise.resolve()).then(function () { return buildPdf(out); });
  }
  function stamp() {
    var d = new Date(), z = function (n) { return ("0" + n).slice(-2); };
    return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes());
  }
  $("dlPdf").addEventListener("click", function () {
    makePdf().then(function (blob) {
      if (!blob) return;
      save(blob, "my-handwriting-" + stamp() + ".pdf");
      status("PDF ready (" + Math.round(blob.size / 1024) + " KB). Check your downloads.");
      window.__lastPdf = blob;
    }).catch(function (e) { status("Could not make the PDF: " + e.message); });
  });
  $("dlPng").addEventListener("click", function () {
    var pg = curPage(); if (!pg) { status("Nothing to download yet."); return; }
    canvasBlob(exportCanvas(pg), "image/png").then(function (b) {
      save(b, "my-handwriting-page" + (state.cur + 1) + "-" + stamp() + ".png");
      status("Image saved.");
    });
  });
  if (navigator.canShare && navigator.share) {
    $("shareBtn").hidden = false;
    $("shareBtn").addEventListener("click", function () {
      makePdf().then(function (blob) {
        if (!blob) return;
        var f = new File([blob], "my-handwriting.pdf", { type: "application/pdf" });
        if (navigator.canShare({ files: [f] })) return navigator.share({ files: [f], title: "My handwriting" });
        status("Sharing files isn't supported here. Use Download PDF.");
      }).catch(function () {});
    });
  }

  function status(t) { $("status").textContent = t; }

  /* ------------------------------------------------------------ wiring */
  $("aiNote").textContent = AI_NOTE;
  $("copyNote").addEventListener("click", function () {
    var done = function () { status("Note copied. Paste it into your chatbot with the worksheet photo."); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(AI_NOTE).then(done, fallbackCopy);
    else fallbackCopy();
    function fallbackCopy() {
      var t = document.createElement("textarea"); t.value = AI_NOTE; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); done(); } catch (_) {} t.remove();
    }
  });

  $("modePhoto").addEventListener("click", function () { state.mode = "photo"; state.cur = Math.max(0, state.photoPages.length - 1); state.sel = null; render(); });
  $("modeLined").addEventListener("click", function () { state.mode = "lined"; state.cur = 0; state.sel = null; render(); });
  $("photoInput").addEventListener("change", function (e) { addPhotos(e.target.files); e.target.value = ""; });
  $("splitBtn").addEventListener("click", splitIntoBoxes);
  $("oneBtn").addEventListener("click", oneBox);
  $("answers").addEventListener("input", function () { if (state.mode === "lined") render(); else updateWarn(); });
  $("prevPg").addEventListener("click", function () { state.cur--; state.sel = null; render(); });
  $("nextPg").addEventListener("click", function () { state.cur++; state.sel = null; render(); });
  $("zoom").addEventListener("change", function (e) { state.zoom = parseFloat(e.target.value); render(); });
  $("addBox").addEventListener("click", function () {
    var page = curPage(); if (!page) return;
    var b = newBox(page, { text: "Type here", x: page.w * 0.1, y: page.h * 0.1 });
    page.boxes.push(b); state.sel = b; syncPanel(); render();
  });
  $("rmPage").addEventListener("click", function () {
    if (!state.photoPages.length) return;
    if (!confirm("Remove this photo and its text boxes?")) return;
    state.photoPages.splice(state.cur, 1); state.sel = null; state.cur = Math.max(0, state.cur - 1); render();
  });

  function bind(id, fn) { $(id).addEventListener("input", function (e) { if (!state.sel) return; fn(state.sel, e.target.value, curPage()); render(); }); }
  bind("bxText", function (b, v) { b.text = v; });
  bind("bxSize", function (b, v) { b.size = parseFloat(v); });
  bind("bxWidth", function (b, v, p) { b.width = parseFloat(v) / 100 * p.w; });
  bind("bxRot", function (b, v) { b.rot = parseFloat(v); });
  bind("bxLh", function (b, v) { b.lh = parseFloat(v); });
  document.querySelectorAll(".ink").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.ink = btn.dataset.ink; if (state.sel) state.sel.color = btn.dataset.ink; render();
    });
  });
  document.querySelectorAll(".nudge [data-n]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!state.sel) return;
      var d = btn.dataset.n.split(",").map(Number), step = Math.max(1, curPage().w * 0.003);
      state.sel.x += d[0] * step; state.sel.y += d[1] * step; render();
    });
  });
  $("bxDel").addEventListener("click", function () {
    var page = curPage(); if (!page || !state.sel) return;
    page.boxes.splice(page.boxes.indexOf(state.sel), 1); state.sel = null; render();
  });
  $("bxDup").addEventListener("click", function () {
    var page = curPage(); if (!page || !state.sel) return;
    var c = JSON.parse(JSON.stringify(state.sel)); c.id = state.nextId++; c.x += page.w * 0.02; c.y += page.w * 0.02; c.label = "";
    page.boxes.push(c); state.sel = c; syncPanel(); render();
  });

  // lined settings
  function linedBind(id, key, out, isChk) {
    $(id).addEventListener("input", function (e) {
      state.lined[key] = isChk ? e.target.checked : parseFloat(e.target.value);
      if (out) $(out).textContent = e.target.value;
      render();
    });
  }
  linedBind("lnSize", "size", "lnSizeO"); linedBind("lnSpace", "space", "lnSpaceO");
  linedBind("lnRules", "rules", null, true); linedBind("lnMargin", "margin", null, true);

  // Keep-the-numbers checkbox (added here so index.html stays simple)
  (function () {
    var lab = document.createElement("label");
    lab.className = "chk"; lab.style.flex = "1 1 100%"; lab.style.fontSize = "14px";
    lab.innerHTML = '<input id="keepNums" type="checkbox"> Keep the numbers (1., 2.) in the boxes';
    $("photoButtons").insertBefore(lab, $("photoButtons").firstChild);
  })();

  var rt;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(render, 120); });

  // Load the font before the first draw so measurements are right.
  var fontP = (document.fonts && document.fonts.load)
    ? document.fonts.load('40px "My Handwriting"', "Aa1").then(function () { return document.fonts.ready; })
    : Promise.resolve();
  fontP.catch(function () {}).then(function () { ready = true; render(); window.__ready = true; });

  window.__app = { state: state, render: render, addPhotos: addPhotos, normalize: normalize };
})();
