// Renders algorithms.html from data/algorithms.json. Names for the "Used in"
// links come from data/index.json, so a project is only named in one place.
//
// Each card: prose, the real code (linked to its lines on GitHub), what was
// measured, and what the technique costs. Demos live in js/demos.js and are
// mounted the first time their panel opens; diagrams come from js/diagrams.js.

(function () {
  const slot = (name) => document.querySelector(`[data-slot="${name}"]`);
  const list = (items, fn) => (items || []).map(fn).join('');
  // code is shown as text, never as markup
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const getJSON = (url) => fetch(url).then((res) => {
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  });

  // "project:donezo" / "exp:pepsico" → { label, href } pointing at that card on the home page
  function resolver(site) {
    const projects = new Map(site.projects.items.map((p) => [p.id, p]));
    const exps = new Map(site.experiences.items.map((e) => [e.id, e]));
    return (ref) => {
      const [kind, id] = ref.split(':');
      if (kind === 'project' && projects.has(id)) {
        return { label: projects.get(id).name, href: `index.html#project-${id}` };
      }
      if (kind === 'exp' && exps.has(id)) {
        const e = exps.get(id);
        return { label: /intern/i.test(e.role) ? `${e.short} internship` : e.short, href: `index.html#exp-${id}` };
      }
      return null;
    };
  }

  const usedIn = (refs, resolve) => {
    const links = refs.map(resolve).filter(Boolean).map((u) => `<a href="${u.href}">${u.label}</a>`);
    return links.length ? `Used in ${links.join(', ')}` : '';
  };

  const codeBlock = (c) => `
    <figure class="algo-code">
      <figcaption>
        <span class="algo-code-label">${esc(c.label)}</span>
        ${c.href ? `<a href="${c.href}" target="_blank" rel="noopener noreferrer">${esc(c.path)} ↗</a>` : ''}
      </figcaption>
      <pre><code>${esc(c.text)}</code></pre>
    </figure>`;

  function card(a, resolve) {
    return `
      <article class="algo card" id="${a.id}" data-fields="${(a.fields || []).join(' ')}">
        <p class="eyebrow">${a.group}</p>
        <h2 class="algo-title">${a.title}</h2>
        <p class="algo-used">${usedIn(a.used_in, resolve)}</p>

        <div class="algo-body">${list(a.body, (p) => `<p>${p}</p>`)}</div>

        ${list(a.code, codeBlock)}
        ${a.diagram ? `<div data-diagram="${a.diagram}"></div>` : ''}

        ${a.measured && a.measured.length ? `
        <div class="algo-measured">
          <h3 class="eyebrow">Measured</h3>
          <ul>${list(a.measured, (m) => `<li>${m}</li>`)}</ul>
        </div>` : ''}

        ${a.limits ? `
        <div class="algo-limits">
          <h3 class="eyebrow">Costs and limits</h3>
          <p>${a.limits}</p>
        </div>` : ''}

        ${a.writeup ? `<p class="algo-writeup-row"><a class="algo-writeup" href="${a.writeup}">Read the longer write-up →</a></p>` : ''}

        ${a.demo ? `
        <details class="demo" data-demo="${a.demo}">
          <summary>Try it</summary>
          <div class="demo-body"></div>
        </details>` : ''}
      </article>`;
  }

  function notes(items, resolve) {
    if (!items || !items.length) return '';
    return `
      <section class="algo-notes card" aria-labelledby="notes-title">
        <h2 class="algo-notes-title" id="notes-title">Smaller notes</h2>
        <dl>${list(items, (n) => `
          <div class="algo-note" id="${n.id}" data-fields="${(n.fields || []).join(' ')}">
            <dt>${n.title}</dt>
            <dd>${n.text} <span class="algo-used">${usedIn(n.used_in, resolve)}</span></dd>
          </div>`)}
        </dl>
      </section>`;
  }

  // contents, grouped the same way as the cards
  function toc(algos) {
    const groups = algos.groups.map((g) => ({ g, items: algos.items.filter((a) => a.group === g) }))
      .filter((x) => x.items.length);
    return list(groups, ({ g, items }) => `
      <div class="toc-group">
        <p class="eyebrow">${g}</p>
        <ul>${list(items, (a) => `<li data-for="${a.id}"><a href="#${a.id}">${a.title}</a></li>`)}</ul>
      </div>`) + (algos.notes && algos.notes.length ? `
      <div class="toc-group">
        <p class="eyebrow">Smaller notes</p>
        <ul>${list(algos.notes, (n) => `<li data-for="${n.id}"><a href="#${n.id}">${n.title}</a></li>`)}</ul>
      </div>` : '');
  }

  function mountDemos() {
    document.querySelectorAll('details.demo').forEach((d) => {
      d.addEventListener('toggle', () => {
        if (!d.open || d.dataset.mounted) return;
        const mount = window.Demos && window.Demos[d.dataset.demo];
        if (!mount) return;
        mount(d.querySelector('.demo-body'));
        d.dataset.mounted = '1';
      });
    });
  }

  Promise.all([getJSON('data/algorithms.json'), getJSON('data/index.json')])
    .then(([algos, site]) => {
      const resolve = resolver(site);
      // cards follow the group order used by the contents
      const ordered = algos.groups.flatMap((g) => algos.items.filter((a) => a.group === g));
      slot('intro').innerHTML = algos.intro;
      slot('toc').innerHTML = toc(algos);
      slot('algos').innerHTML = list(ordered, (a) => card(a, resolve)) + notes(algos.notes, resolve);
      if (window.Diagrams) window.Diagrams.mountAll(slot('algos'));
      mountDemos();
      if (window.Fields) {
        window.Fields.mount(slot('field-filter'), {
          groups: [
            { noun: ['technique', 'techniques'], select: () => document.querySelectorAll('.algo'), empty: slot('algos-empty') },
            { noun: ['note', 'notes'], select: () => document.querySelectorAll('.algo-note') },
          ],
          // keep the contents and the notes box in step with what's showing
          after: () => {
            document.querySelectorAll('.algo-toc li[data-for]').forEach((li) => {
              li.hidden = document.getElementById(li.dataset.for).hidden;
            });
            document.querySelectorAll('.toc-group').forEach((g) => {
              g.hidden = !g.querySelector('li:not([hidden])');
            });
            const box = document.querySelector('.algo-notes');
            if (box) box.hidden = !box.querySelector('.algo-note:not([hidden])');
          },
        });
      }

      // the cards arrived after the browser's jump to #id — jump again, and mark it
      const target = location.hash && document.getElementById(location.hash.slice(1));
      if (target && target.matches('.algo, .algo-note')) {
        target.scrollIntoView({ behavior: 'instant' });
        target.classList.add('is-target');
      }
    })
    .catch((err) => console.error('Failed to load page data:', err));
})();
