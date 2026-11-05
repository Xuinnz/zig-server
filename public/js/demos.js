// Interactive demos for the Algorithms page. Each is a function that fills an
// element; js/algorithms.js calls it the first time its "Try it" panel opens.
// They are teaching models, not benchmarks — each one says what it simplifies.

window.Demos = (function () {
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? '' : 's'}`;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fmtTime(ms) {
    if (ms < 1000) return `${Math.round(ms)} ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
    return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
  }

  // ── Bitboards: a day of 15-minute slots as one 32-bit word ──────────────────
  function bitboard(root) {
    const SLOTS = 32; // 08:00–16:00
    const run = (start, len) => (((1 << len) - 1) << start) >>> 0;
    const time = (slot) => {
      const m = 8 * 60 + slot * 15;
      return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    };
    // slot 0 on the left, so the string lines up with the grid
    const bits = (m) => Array.from({ length: SLOTS }, (_, i) => (m >>> i) & 1).join('');
    const intervals = (m) => {
      let n = 0;
      for (let i = 0; i < SLOTS; i++) if (((m >>> i) & 1) && !(i > 0 && ((m >>> (i - 1)) & 1))) n++;
      return n;
    };
    const popcount = (m) => { let n = 0; for (; m; m >>>= 1) n += m & 1; return n; };

    let booked = (run(2, 4) | run(12, 3) | run(22, 5)) >>> 0; // three meetings
    let start = 8;
    let len = 4;

    root.innerHTML = `
      <p class="demo-hint">One day, 08:00–16:00, in 15-minute slots: 32 slots, one 32-bit word.
        Click the <strong>booked</strong> row to book or free a slot, and the <strong>task</strong> row to move the new task.</p>
      <div class="bb-grid">
        <span class="bb-label">booked</span><div class="bb-row" data-row="booked"></div>
        <span class="bb-label">task</span><div class="bb-row" data-row="task"></div>
        <span class="bb-label"></span><div class="bb-scale">${Array.from({ length: 8 }, (_, h) => `<span>${String(8 + h).padStart(2, '0')}</span>`).join('')}</div>
      </div>
      <label class="demo-ctl">task length <input type="range" min="1" max="12" value="${len}" data-len><output data-len-out></output></label>
      <pre class="demo-math" data-math></pre>
      <p class="demo-verdict" data-verdict></p>`;

    const rowB = root.querySelector('[data-row="booked"]');
    const rowT = root.querySelector('[data-row="task"]');
    const lenIn = root.querySelector('[data-len]');
    for (const [row, name] of [[rowB, 'booked'], [rowT, 'task']]) {
      for (let i = 0; i < SLOTS; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bb-cell';
        b.dataset.i = i;
        b.title = time(i);
        b.setAttribute('aria-label', `${name} ${time(i)}`);
        row.appendChild(b);
      }
    }

    function draw() {
      const task = run(start, len);
      const hit = (booked & task) >>> 0;
      [...rowB.children].forEach((c, i) => {
        c.classList.toggle('on', !!((booked >>> i) & 1));
        c.classList.toggle('clash', !!((hit >>> i) & 1));
      });
      [...rowT.children].forEach((c, i) => {
        c.classList.toggle('task', !!((task >>> i) & 1));
        c.classList.toggle('clash', !!((hit >>> i) & 1));
      });
      root.querySelector('[data-len-out]').textContent = `${len * 15} min`;
      root.querySelector('[data-math]').textContent =
        `booked  ${bits(booked)}\ntask    ${bits(task)}\nAND     ${bits(hit)}   ${hit ? '≠ 0 → conflict' : '= 0 → free'}`;

      const n = intervals(booked);
      const v = root.querySelector('[data-verdict]');
      v.className = `demo-verdict ${hit ? 'bad' : 'ok'}`;
      v.textContent = hit
        ? `Conflict: ${plural(popcount(hit), 'slot')} from ${time(31 - Math.clz32(hit & -hit))} already booked. Found with 1 AND; the naive way compares against ${plural(n, 'booked interval')}.`
        : `Free: ${time(start)}–${time(start + len)} fits. 1 AND, versus ${plural(n, 'interval comparison')} the naive way.`;
    }

    rowB.addEventListener('click', (e) => {
      if (e.target.dataset.i === undefined) return;
      booked = (booked ^ (1 << Number(e.target.dataset.i))) >>> 0;
      draw();
    });
    rowT.addEventListener('click', (e) => {
      if (e.target.dataset.i === undefined) return;
      start = Math.min(Number(e.target.dataset.i), SLOTS - len);
      draw();
    });
    lenIn.addEventListener('input', () => {
      len = Number(lenIn.value);
      start = Math.min(start, SLOTS - len);
      draw();
    });
    draw();
  }

  // ── Batching: round trips per row vs per batch ──────────────────────────────
  function batching(root) {
    root.innerHTML = `
      <p class="demo-hint">A network-only model. <em>Per-row</em>: one read and one write for every record.
        <em>Batched</em>: one set-based read, then one transaction (begin, write all rows, commit) — 4 round trips in total.
        Time spent inside the database is ignored.</p>
      <label class="demo-ctl">records <input type="range" min="10" max="3600" step="10" value="1000" data-n><output data-n-out></output></label>
      <label class="demo-ctl">round trip <input type="range" min="1" max="50" value="8" data-rtt><output data-rtt-out></output></label>
      <div class="rt-lanes">
        <div class="rt-lane"><span class="rt-name">per-row</span><span class="rt-track"><span class="rt-bar" data-bar="a"></span></span><span class="rt-val" data-val="a"></span></div>
        <div class="rt-lane ours"><span class="rt-name">batched</span><span class="rt-track"><span class="rt-bar" data-bar="b"></span></span><span class="rt-val" data-val="b"></span></div>
      </div>
      <div class="demo-btns"><button type="button" class="demo-btn primary" data-run>Run both</button></div>
      <p class="demo-verdict ok" data-verdict></p>`;

    const nIn = root.querySelector('[data-n]');
    const rttIn = root.querySelector('[data-rtt]');
    const bar = { a: root.querySelector('[data-bar="a"]'), b: root.querySelector('[data-bar="b"]') };
    const val = { a: root.querySelector('[data-val="a"]'), b: root.querySelector('[data-val="b"]') };
    let anim = 0;

    const model = () => {
      const n = Number(nIn.value);
      const rtt = Number(rttIn.value);
      return { n, rtt, a: { trips: 2 * n, ms: 2 * n * rtt }, b: { trips: 4, ms: 4 * rtt } };
    };
    const label = (lane, f = 1) => `${plural(lane.trips * f, 'round trip')} · ${fmtTime(lane.ms * f)}`;

    // f = how far along each lane is (0..1); bars share one time scale
    function paint(m, fa, fb) {
      bar.a.style.width = `${100 * fa}%`;
      bar.b.style.width = `${Math.max(100 * fb * (m.b.ms / m.a.ms), fb > 0 ? 0.6 : 0)}%`;
      val.a.textContent = label(m.a, fa);
      val.b.textContent = label(m.b, fb);
    }

    function draw() {
      cancelAnimationFrame(anim);
      const m = model();
      root.querySelector('[data-n-out]').textContent = plural(m.n, 'record');
      root.querySelector('[data-rtt-out]').textContent = `${m.rtt} ms`;
      paint(m, 1, 1);
      root.querySelector('[data-verdict]').textContent =
        `${fmt(m.a.trips / m.b.trips)}× fewer round trips: ${fmtTime(m.a.ms)} → ${fmtTime(m.b.ms)} on the network alone.`;
    }

    // replay both at the same speed: per-row takes 3 s on screen, batched finishes almost at once
    function play() {
      const m = model();
      if (reducedMotion()) return draw();
      const DUR = 3000;
      const t0 = performance.now();
      cancelAnimationFrame(anim);
      const step = (now) => {
        const t = now - t0;
        const fa = Math.min(1, t / DUR);
        const fb = Math.min(1, t / (DUR * (m.b.ms / m.a.ms)));
        paint(m, fa, fb);
        if (fa < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }

    nIn.addEventListener('input', draw);
    rttIn.addEventListener('input', draw);
    root.querySelector('[data-run]').addEventListener('click', play);
    draw();
  }

  // ── Arenas vs a general-purpose heap ────────────────────────────────────────
  function arena(root) {
    // same 48 cells on both sides: one heap, or two arenas split by lifetime
    const HEAP = 48;
    const REQ = 16;
    const LONG = 32;
    let heap, req, longA, reqTop, longTop, current, stats, rand, nextId, msg, failNote;

    // seeded, so every reset tells the same story
    const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

    function reset() {
      heap = Array(HEAP).fill(null);
      req = Array(REQ).fill(null);
      longA = Array(LONG).fill(null);
      reqTop = 0;
      longTop = 0;
      current = null; // objects of the request in flight
      rand = lcg(7);
      nextId = 1;
      stats = { reqs: 0, scanned: 0, frees: 0, heapFails: 0, bumps: 0, resets: 0, arenaFails: 0 };
      msg = 'Run a request: it allocates a handful of objects, some short-lived, some long-lived.';
      failNote = '';
    }

    // first fit: walk the heap for the first free run that's big enough
    function heapAlloc(obj) {
      let runStart = 0;
      let runLen = 0;
      for (let i = 0; i < HEAP; i++) {
        stats.scanned++;
        if (heap[i]) { runLen = 0; runStart = i + 1; continue; }
        if (++runLen === obj.size) {
          for (let j = runStart; j < runStart + obj.size; j++) heap[j] = obj;
          return true;
        }
      }
      stats.heapFails++;
      const free = freeCells();
      failNote = free >= obj.size
        ? `malloc(${obj.size}) failed with ${free} cells free: the largest hole is ${largestHole()}, so the free space is fragmented.`
        : `malloc(${obj.size}) failed: the heap is full.`;
      return false;
    }

    function arenaAlloc(obj) {
      const [cells, top, cap] = obj.long ? [longA, longTop, LONG] : [req, reqTop, REQ];
      if (top + obj.size > cap) { stats.arenaFails++; return false; }
      for (let j = top; j < top + obj.size; j++) cells[j] = obj;
      if (obj.long) longTop += obj.size; else reqTop += obj.size;
      stats.bumps++;
      return true;
    }

    function allocate() {
      current = [];
      const count = 4 + Math.floor(rand() * 3);
      let failed = 0;
      for (let k = 0; k < count; k++) {
        const obj = { id: nextId++, size: 1 + Math.floor(rand() * 3), long: rand() < 0.3 };
        obj.inHeap = heapAlloc(obj);
        arenaAlloc(obj);
        if (!obj.inHeap) failed++;
        current.push(obj);
      }
      stats.reqs++;
      msg = failed
        ? failNote
        : `Allocated ${plural(count, 'object')}. The heap searched for a hole for each one; each arena just moved its pointer.`;
    }

    function endRequest() {
      let freed = 0;
      for (const obj of current) {
        if (obj.long || !obj.inHeap) continue;
        for (let i = 0; i < HEAP; i++) if (heap[i] === obj) heap[i] = null;
        stats.frees++;
        freed++;
      }
      req.fill(null);
      reqTop = 0;
      stats.resets++;
      current = null;
      const note = msg === failNote ? `${failNote} ` : '';
      msg = `${note}Request done: the heap needed ${plural(freed, 'free() call')} and left holes between the long-lived objects; the request arena was reset in one step.`;
    }

    const freeCells = () => heap.filter((c) => !c).length;
    function largestHole() {
      let best = 0;
      let run = 0;
      for (const c of heap) { run = c ? 0 : run + 1; best = Math.max(best, run); }
      return best;
    }

    root.innerHTML = `
      <p class="demo-hint">Each request allocates a few objects of 1–3 cells; about 30% of them are long-lived and survive the request.
        Top: one general-purpose heap with first-fit <code>malloc</code>/<code>free</code>. Below: the same 48 cells split into two arenas by lifetime, each a bump pointer.</p>
      <div class="mem">
        <div><div class="mem-head"><span>general-purpose heap</span><span data-info="heap"></span></div><div class="mem-row" data-mem="heap"></div></div>
        <div><div class="mem-head"><span>request arena · reset per request</span><span data-info="req"></span></div><div class="mem-row" data-mem="req"></div></div>
        <div><div class="mem-head"><span>long-lived arena</span><span data-info="long"></span></div><div class="mem-row" data-mem="long"></div></div>
      </div>
      <p class="mem-legend"><span class="sw s"></span>short-lived <span class="sw l"></span>long-lived <span class="sw f"></span>free <span class="sw t"></span>arena pointer</p>
      <div class="demo-btns">
        <button type="button" class="demo-btn primary" data-act="alloc">Allocate a request</button>
        <button type="button" class="demo-btn" data-act="end">End the request</button>
        <button type="button" class="demo-btn" data-act="five">Run 5 requests</button>
        <button type="button" class="demo-btn" data-act="reset">Reset</button>
      </div>
      <div class="mem-stats">
        <p><strong>heap</strong> <span data-stat="heap"></span></p>
        <p><strong>arenas</strong> <span data-stat="arena"></span></p>
      </div>
      <p class="demo-verdict" data-verdict></p>`;

    function paintRow(name, cells, top) {
      const row = root.querySelector(`[data-mem="${name}"]`);
      row.innerHTML = cells.map((c, i) => {
        const cls = ['mem-cell'];
        if (c) cls.push(c.long ? 'l' : 's');
        if (c && (i === 0 || cells[i - 1] !== c)) cls.push('start');
        if (top !== undefined && i === top) cls.push('top');
        return `<span class="${cls.join(' ')}"></span>`;
      }).join('');
    }

    function draw() {
      paintRow('heap', heap);
      paintRow('req', req, reqTop);
      paintRow('long', longA, longTop);
      root.querySelector('[data-info="heap"]').textContent = `${freeCells()} free · largest hole ${largestHole()}`;
      root.querySelector('[data-info="req"]').textContent = `${REQ - reqTop} free`;
      root.querySelector('[data-info="long"]').textContent = `${LONG - longTop} free`;
      root.querySelector('[data-stat="heap"]').textContent =
        `${plural(stats.scanned, 'cell')} scanned · ${plural(stats.frees, 'free() call')} · ${plural(stats.heapFails, 'failed allocation')}`;
      root.querySelector('[data-stat="arena"]').textContent =
        `${plural(stats.bumps, 'pointer bump')} · ${plural(stats.resets, 'reset')} · ${plural(stats.arenaFails, 'failed allocation')}`;
      const v = root.querySelector('[data-verdict]');
      const arenaFull = stats.arenaFails
        ? ' The long-lived arena is full: splitting memory by lifetime doesn\'t remove the need to size it, it makes the sizing explicit. Choosing the split per allocation is what SAMM\'s lifetime prediction is for.'
        : '';
      v.className = `demo-verdict${stats.heapFails || stats.arenaFails ? ' bad' : ''}`;
      // a failure inside "Run 5 requests" would otherwise be overwritten by the next request
      const heapNote = stats.heapFails && !msg.includes(failNote) ? ` Last heap failure: ${failNote}` : '';
      v.textContent = msg + heapNote + arenaFull;
      root.querySelector('[data-act="alloc"]').disabled = !!current;
      root.querySelector('[data-act="end"]').disabled = !current;
      root.querySelector('[data-act="five"]').disabled = !!current;
    }

    root.querySelector('.demo-btns').addEventListener('click', (e) => {
      const act = e.target.dataset.act;
      if (act === 'alloc') allocate();
      if (act === 'end') endRequest();
      if (act === 'five') for (let k = 0; k < 5; k++) { allocate(); endRequest(); }
      if (act === 'reset') reset();
      if (act) draw();
    });
    reset();
    draw();
  }

  // ── Optimistic concurrency: a bulk approval racing an edit ──────────────────
  function occ(root) {
    const IDS = [101, 102, 103, 104, 105];
    const VALUES = [1200, 860, 4300, 515, 2040];
    let db, seen, stage;

    root.innerHTML = `
      <p class="demo-hint">A reviewer opens five pending records and approves them in one batch. Meanwhile someone else edits record 103.
        Step through it with the version check on, then again with it off.</p>
      <label class="demo-ctl"><input type="checkbox" checked data-check> version check: only write rows whose version is still the one the reviewer saw</label>
      <div class="occ-wrap">
        <table class="occ-table">
          <thead><tr><th>id</th><th>value</th><th>version</th><th>reviewer saw</th><th>status</th></tr></thead>
          <tbody data-rows></tbody>
        </table>
      </div>
      <div class="demo-btns">
        <button type="button" class="demo-btn primary" data-step="load">1. Reviewer loads 5 records</button>
        <button type="button" class="demo-btn" data-step="edit">2. Someone edits 103</button>
        <button type="button" class="demo-btn" data-step="approve">3. Approve all 5</button>
        <button type="button" class="demo-btn" data-step="reset">Reset</button>
      </div>
      <pre class="demo-math" data-sql></pre>
      <p class="demo-verdict" data-verdict></p>`;

    const checkIn = root.querySelector('[data-check]');
    const sql = root.querySelector('[data-sql]');
    const verdict = root.querySelector('[data-verdict]');

    function reset() {
      db = IDS.map((id, i) => ({ id, value: VALUES[i], version: 1, status: 'pending', edited: false }));
      seen = null;
      stage = 0;
      sql.textContent = '-- nothing has happened yet';
      verdict.className = 'demo-verdict';
      verdict.textContent = '';
    }

    function draw() {
      root.querySelector('[data-rows]').innerHTML = db.map((r, i) => `
        <tr class="${r.edited ? 'changed' : ''}">
          <td>${r.id}</td>
          <td>${fmt(r.value)}</td>
          <td>v${r.version}</td>
          <td>${seen ? `v${seen[i].version} · ${fmt(seen[i].value)}` : '—'}</td>
          <td class="st-${r.status === 'approved (stale)' ? 'stale' : r.status}">${r.status}</td>
        </tr>`).join('');
      root.querySelector('[data-step="load"]').disabled = stage !== 0;
      root.querySelector('[data-step="edit"]').disabled = stage !== 1;
      root.querySelector('[data-step="approve"]').disabled = stage !== 2;
    }

    function load() {
      seen = db.map((r) => ({ ...r }));
      stage = 1;
      sql.textContent = `SELECT id, value, version FROM records\n WHERE id IN (${IDS.join(', ')});`;
    }

    function edit() {
      const r = db[2];
      r.value = 5300;
      r.version += 1;
      r.edited = true;
      stage = 2;
      sql.textContent = `-- someone else, while the reviewer is still reading:\nUPDATE records SET value = 5300, version = version + 1\n WHERE id = 103;`;
    }

    function approve() {
      stage = 3;
      if (checkIn.checked) {
        sql.textContent =
          `UPDATE records SET status = 'approved', version = version + 1\n WHERE (id, version) IN (${seen.map((s) => `(${s.id}, ${s.version})`).join(', ')});\n-- 4 rows updated`;
        db.forEach((r, i) => {
          if (r.version === seen[i].version) { r.status = 'approved'; r.version += 1; } else r.status = 'skipped';
        });
        verdict.className = 'demo-verdict ok';
        verdict.textContent = '4 approved, 1 skipped: 103 changed after the reviewer saw it, so it goes back for review instead of being approved stale.';
      } else {
        sql.textContent = `UPDATE records SET status = 'approved'\n WHERE id IN (${IDS.join(', ')});\n-- 5 rows updated`;
        db.forEach((r) => { r.status = r.edited ? 'approved (stale)' : 'approved'; });
        verdict.className = 'demo-verdict bad';
        verdict.textContent = `All 5 approved, including 103 at ${fmt(db[2].value)}, a value the reviewer never saw (they saw ${fmt(seen[2].value)}).`;
      }
    }

    root.querySelector('.demo-btns').addEventListener('click', (e) => {
      const s = e.target.dataset.step;
      if (s === 'load') load();
      if (s === 'edit') edit();
      if (s === 'approve') approve();
      if (s === 'reset') reset();
      if (s) draw();
    });
    checkIn.addEventListener('change', () => { reset(); draw(); });
    reset();
    draw();
  }

  return { bitboard, batching, arena, occ };
})();
