// Architecture diagrams as inline SVG. Inline, so the server needs no image
// MIME types and the drawings pick up the site's colours from css/style.css.
//
//   <div data-diagram="site"></div>   →   Diagrams.mountAll(document)
//
// Coordinates are in each diagram's own viewBox. On narrow screens the figure
// scrolls sideways instead of shrinking the text to nothing.

window.Diagrams = (function () {
  let uid = 0;

  // ── drawing helpers ──────────────────────────────────────────────────────────
  function node(x, y, w, h, title, sub, cls = '') {
    const cx = x + w / 2;
    const ty = sub ? y + h / 2 - 4 : y + h / 2 + 4.5;
    return `<g class="dg-node ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>` +
      `<text class="dg-title" x="${cx}" y="${ty}" text-anchor="middle">${title}</text>` +
      (sub ? `<text class="dg-sub" x="${cx}" y="${y + h / 2 + 12}" text-anchor="middle">${sub}</text>` : '') +
      '</g>';
  }

  // `bottom` puts the zone's label along its lower edge, out of the way of edges coming in from above
  const zone = (x, y, w, h, title, bottom = false) =>
    `<g class="dg-zone"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/><text x="${x + 14}" y="${bottom ? y + h - 12 : y + 20}">${title}</text></g>`;

  const label = (x, y, text, anchor = 'middle', accent = false) =>
    `<text class="dg-label${accent ? ' accent' : ''}" x="${x}" y="${y}" text-anchor="${anchor}">${text}</text>`;

  const text = (x, y, str, cls, anchor = 'middle') =>
    `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${str}</text>`;

  // pts: [[x, y], …] — o: { label, at: [x, y], anchor, accent, dashed, both, plain }
  function edge(m, pts, o = {}) {
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
    const head = `url(#${m}-${o.accent ? 'ha' : 'h'})`;
    const cls = ['dg-edge', o.accent && 'accent', o.dashed && 'dashed'].filter(Boolean).join(' ');
    const markers = o.plain ? '' : ` marker-end="${head}"${o.both ? ` marker-start="${head}"` : ''}`;
    return `<path class="${cls}" d="${d}"${markers}/>` +
      (o.label ? label(o.at[0], o.at[1], o.label, o.anchor, o.accent) : '');
  }

  function figure(def) {
    const m = `dg${++uid}`;
    const marker = (id, cls) =>
      `<marker id="${m}-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
      `<path class="${cls}" d="M0,0 L10,5 L0,10 z"/></marker>`;
    return `
      <figure class="dg-figure">
        <div class="dg-wrap">
          <svg class="dg" viewBox="0 0 ${def.w} ${def.h}" style="min-width:${def.minWidth || 660}px"
               role="img" aria-labelledby="${m}-t ${m}-d">
            <title id="${m}-t">${def.title}</title>
            <desc id="${m}-d">${def.caption}</desc>
            <defs>${marker('h', 'dg-head')}${marker('ha', 'dg-head accent')}</defs>
            ${def.body(m)}
          </svg>
        </div>
        <figcaption class="dg-caption">${def.caption}</figcaption>
      </figure>`;
  }

  // ── the diagrams ─────────────────────────────────────────────────────────────
  const DEFS = {
    // This site: browser → Azure VM → Caddy → zig-server → disk
    site: {
      w: 900, h: 230,
      title: 'How a request reaches this page',
      caption: 'Caddy terminates TLS and passes plain HTTP/1.1 to the Zig server on the same VM, which answers from disk with <code>sendfile</code>. systemd runs the server as a service.',
      body: (m) => [
        zone(170, 20, 714, 196, 'AZURE VM · B2ATS V2 · 2 vCPU · 1 GB'),
        node(16, 40, 116, 44, 'DNS', 'Namecheap', 'ext'),
        node(16, 128, 116, 56, 'Browser', 'you'),
        node(188, 128, 104, 56, 'Firewall', '22 · 80 · 443'),
        node(336, 128, 144, 56, 'Caddy', 'TLS · reverse proxy'),
        node(540, 128, 140, 56, 'zig-server', ':8080 · epoll loop', 'accent'),
        node(740, 128, 128, 56, 'public/', 'files on disk'),
        node(540, 52, 140, 44, 'systemd', 'service manager'),
        edge(m, [[74, 128], [74, 84]], { label: 'DNS lookup', at: [82, 112], anchor: 'start' }),
        edge(m, [[132, 156], [188, 156]], { label: 'HTTPS', at: [160, 148] }),
        edge(m, [[292, 156], [336, 156]]),
        edge(m, [[480, 156], [540, 156]], { label: 'HTTP/1.1', at: [510, 148], accent: true }),
        edge(m, [[680, 156], [740, 156]], { label: 'sendfile', at: [710, 148] }),
        edge(m, [[610, 96], [610, 128]], { label: 'supervises', at: [618, 117], anchor: 'start', dashed: true }),
      ].join(''),
    },

    // The event loop inside zig-server
    epoll: {
      w: 900, h: 300,
      title: 'The epoll event loop',
      caption: 'One thread, one loop: <code>epoll_wait</code> sleeps until the kernel reports ready sockets (or 5 s pass). The loop accepts new connections, reads and answers the ready ones, then closes any connection that has been idle for 60 s.',
      body: (m) => [
        node(16, 50, 150, 40, 'listen socket', ':8080'),
        node(16, 110, 150, 40, 'client fd 7'),
        node(16, 170, 150, 40, 'client fd 8'),
        text(91, 234, '… up to 500', 'dg-sub'),
        node(230, 120, 160, 70, 'epoll', 'interest list', 'accent'),
        edge(m, [[166, 70], [230, 138]], { plain: true }),
        edge(m, [[166, 130], [230, 155]], { plain: true }),
        edge(m, [[166, 190], [230, 172]], { plain: true }),

        node(470, 44, 170, 50, 'epoll_wait()', 'sleeps until ready, ≤ 5 s', 'accent'),
        node(700, 44, 184, 50, 'accept()', 'new connection'),
        node(700, 135, 184, 50, 'recv() until EAGAIN', 'parse · route'),
        node(700, 226, 184, 50, 'send + sendfile()', 'headers, then the file'),
        node(470, 226, 170, 50, 'idle sweep', 'close after 60 s quiet'),

        edge(m, [[390, 155], [430, 155], [430, 69], [470, 69]], { label: 'ready list', at: [436, 118], anchor: 'start', accent: true }),
        edge(m, [[640, 69], [700, 69]], { label: 'listen', at: [670, 61] }),
        edge(m, [[640, 84], [668, 84], [668, 160], [700, 160]], { label: 'client', at: [662, 124], anchor: 'end' }),
        edge(m, [[792, 185], [792, 226]]),
        edge(m, [[700, 251], [640, 251]], { label: 'done', at: [670, 243] }),
        edge(m, [[555, 226], [555, 94]], { label: 'loop', at: [563, 164], anchor: 'start', accent: true }),
        edge(m, [[792, 44], [792, 20], [310, 20], [310, 120]], { label: 'register the new fd (edge-triggered)', at: [551, 34], dashed: true }),
      ].join(''),
    },

    // Per-row vs batched database writes (generic, not production code)
    batching: {
      w: 900, h: 300,
      title: 'Per-row writes vs one batch',
      caption: 'The shape of the change, not production code. Per-row work pays a network round trip for every read and every write; the batched version pays four in total, however many records there are.',
      body: (m) => {
        const lane = (x, title) => node(x - 50, 36, 100, 30, title) +
          `<path class="dg-life" d="M${x},66 L${x},270"/>`;
        const call = (a, b, y, name, accent) =>
          edge(m, [[a, y], [b, y]], { label: name, at: [(a + b) / 2, y - 6], accent }) +
          edge(m, [[b, y + 12], [a, y + 12]], { dashed: true });
        return [
          text(24, 24, 'PER ROW', 'dg-panel', 'start'),
          lane(110, 'app'), lane(360, 'database'),
          call(110, 360, 84, 'read record 1'),
          call(110, 360, 120, 'write record 1'),
          call(110, 360, 156, 'read record 2'),
          call(110, 360, 192, 'write record 2'),
          text(235, 224, '⋮', 'dg-sub'),
          call(110, 360, 244, 'write record n'),
          text(235, 292, '2 round trips × n records', 'dg-label', 'middle'),

          '<path class="dg-divider" d="M450,16 L450,292"/>',

          text(474, 24, 'BATCHED', 'dg-panel', 'start'),
          lane(560, 'app'), lane(810, 'database'),
          call(560, 810, 84, 'SELECT … WHERE id IN (…)', true),
          call(560, 810, 132, 'BEGIN', true),
          call(560, 810, 180, 'write all rows (one batch)', true),
          call(560, 810, 228, 'COMMIT', true),
          text(685, 292, '4 round trips, whatever n is', 'dg-label accent', 'middle'),
        ].join('');
      },
    },

    // Flouw: production on a 1 GB droplet
    'small-box': {
      w: 900, h: 400,
      title: 'Production on a 1 GB droplet',
      caption: 'The 1 GB box only runs the app. Media goes from the browser straight to R2 with a presigned URL and comes back resized through Cloudflare. The database is one SQLite file whose write-ahead log Litestream streams to a private bucket.',
      body: (m) => [
        node(380, 12, 140, 50, 'Browser', 'customers · admins'),
        zone(16, 110, 470, 210, 'DIGITALOCEAN DROPLET · 1 GB · DOCKER', true),
        node(40, 150, 170, 56, 'Next.js 16', 'standalone image', 'accent'),
        node(290, 150, 170, 50, 'SQLite', 'WAL mode'),
        node(290, 240, 170, 50, 'Litestream', 'streams the WAL'),
        zone(520, 110, 364, 210, 'CLOUDFLARE'),
        node(544, 150, 150, 50, 'R2 · media', 'uploads land here'),
        node(714, 150, 150, 50, 'Image resizing', 'Transformations · CDN'),
        node(544, 240, 320, 50, 'R2 · private bucket', 'replica for disaster recovery', 'ext'),
        node(40, 344, 170, 40, 'GitHub Actions', 'builds the image'),
        node(290, 344, 170, 40, 'GHCR', 'image registry'),

        edge(m, [[420, 62], [420, 86], [125, 86], [125, 150]], { label: 'pages · API · presigned upload URL', at: [272, 80], both: true }),
        edge(m, [[480, 62], [480, 92], [619, 92], [619, 150]], { label: 'direct upload', at: [550, 86], accent: true }),
        edge(m, [[789, 150], [789, 37], [520, 37]], { label: 'resized images', at: [654, 31], accent: true }),
        edge(m, [[694, 175], [714, 175]]),
        edge(m, [[210, 175], [290, 175]], { label: 'Drizzle', at: [250, 168], both: true }),
        edge(m, [[375, 200], [375, 240]], { label: 'WAL', at: [382, 224], anchor: 'start' }),
        edge(m, [[460, 265], [544, 265]], { label: 'replicate', at: [502, 258] }),
        edge(m, [[210, 364], [290, 364]], { label: 'push', at: [250, 357] }),
        edge(m, [[375, 344], [375, 320]], { label: 'deploy', at: [382, 337], anchor: 'start' }),
      ].join(''),
    },

    // Ambigui2: expectimax over superposed pieces
    expectimax: {
      w: 900, h: 320,
      title: 'Expectimax over a piece in superposition',
      caption: 'The AI picks a placement, then the piece collapses into shape A or B, so each placement is worth the probability-weighted value of both futures. Only the best few placements are searched deeper, and positions reached twice come from a cache.',
      body: (m) => [
        node(350, 12, 200, 46, 'max', 'choose a placement (or hold)', 'accent'),
        node(60, 110, 200, 46, 'chance', 'placement 1'),
        node(350, 110, 200, 46, 'chance', 'placement 2'),
        node(640, 110, 200, 46, 'chance', 'placement 3 · pruned', 'muted'),
        label(740, 180, 'beam: only the best few go deeper'),
        edge(m, [[450, 58], [450, 110]]),
        edge(m, [[450, 80], [160, 80], [160, 110]]),
        edge(m, [[450, 80], [740, 80], [740, 110]], { dashed: true }),

        node(20, 210, 130, 46, 'max', 'next piece, if A'),
        node(170, 210, 130, 46, 'max', 'next piece, if B'),
        edge(m, [[160, 156], [160, 182], [85, 182], [85, 210]], { label: 'p', at: [122, 176], accent: true }),
        edge(m, [[160, 182], [235, 182], [235, 210]], { label: '1 − p', at: [198, 176], accent: true }),

        node(310, 210, 130, 46, 'max', 'next piece, if A'),
        node(460, 210, 130, 46, 'max', 'next piece, if B'),
        edge(m, [[450, 156], [450, 182], [375, 182], [375, 210]], { label: 'p', at: [412, 176], accent: true }),
        edge(m, [[450, 182], [525, 182], [525, 210]], { label: '1 − p', at: [488, 176], accent: true }),

        node(640, 210, 200, 46, 'transposition table', 'repeated positions → cached', 'ext'),
        text(450, 300, 'value(chance) = p · value(A) + (1 − p) · value(B)', 'dg-formula'),
      ].join(''),
    },
  };

  function mountAll(root = document) {
    root.querySelectorAll('[data-diagram]').forEach((el) => {
      const def = DEFS[el.dataset.diagram];
      if (def && !el.dataset.mounted) {
        el.innerHTML = figure(def);
        el.dataset.mounted = '1';
      }
    });
  }

  return { mountAll };
})();
