// Renders index.html content from data/index.json, then keeps the browser-chrome
// tabs and address bar in sync with the section being read.
//
// String fields may contain inline HTML (<code>, <strong>, links) — the JSON is
// our own content, so it's inserted as-is.

(function () {
  const slot = (name) => document.querySelector(`[data-slot="${name}"]`);
  const fill = (name, html) => { slot(name).innerHTML = html; };
  const list = (items, fn) => items.map(fn).join('');

  const isExternal = (href) => /^https?:\/\//.test(href);
  const linkAttrs = (href) => isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : '';

  function contactAttrs(c) {
    if (c.external) return ' target="_blank" rel="noopener noreferrer"';
    if (c.download) return ' download';
    return '';
  }

  function renderHome(d, contact) {
    fill('name', d.name);
    fill('role', d.role);
    fill('bio', list(d.bio, (p) => `<p>${p}</p>`));

    fill('skills', list(d.skills, (s) => `
      <div class="skills-group">
        <span class="eyebrow skills-label">${s.label}</span>
        <ul class="chips">${list(s.list.split(/,\s*/), (x) => `<li class="chip">${x}</li>`)}</ul>
      </div>`));

    fill('quick-links', list(contact.items.filter((c) => !c.hidden), (c) => `
      <li>
        <span class="eyebrow">${c.type}</span>
        <a href="${c.href}"${contactAttrs(c)} class="no-visited">${c.text}</a>
      </li>`));

    fill('browse', list(d.browse, (b) => `
      <li>
        <a href="${b.href}" class="jump-card">
          <span class="jump-path">→ ${b.path}</span>
          <span class="jump-text">${b.text}</span>
        </a>
      </li>`));
  }

  // data/algorithms.json says which techniques each project / experience used
  // ("project:donezo", "exp:pepsico"); turn that into ref → [technique, …].
  function usesIndex(algos) {
    const map = new Map();
    for (const a of [...((algos && algos.items) || []), ...((algos && algos.notes) || [])]) {
      for (const ref of a.used_in) {
        if (!map.has(ref)) map.set(ref, []);
        map.get(ref).push(a);
      }
    }
    return map;
  }

  const usesLinks = (techs) =>
    techs.map((a) => `<a href="algorithms.html#${a.id}">${a.short}</a>`).join(' · ');

  function renderProjects(d, uses) {
    fill('projects-sub', d.subtitle);

    fill('projects', list(d.items, (p) => {
      const techs = uses.get(`project:${p.id}`) || [];
      const links = p.links || [];
      return `
      <article class="project-card card${p.featured ? ' featured' : ''}" id="project-${p.id}" data-fields="${(p.fields || []).join(' ')}">
        <div class="project-head">
          <div>
            ${p.featured ? '<p class="eyebrow">Featured</p>' : ''}
            <h3 class="project-name">${p.name}</h3>
            ${p.subtitle ? `<p class="project-sub">${p.subtitle}</p>` : ''}
          </div>
          <span class="project-badges">
            ${p.team ? '<span class="badge badge-team" title="Built with a team">team</span>' : ''}
            <span class="badge ${p.badge === 'Active' ? 'badge-active' : 'badge-archived'}">${p.badge}</span>
          </span>
        </div>
        <ul class="chips">${list(p.tags.split(/\s*·\s*/), (t) => `<li class="chip">${t}</li>`)}</ul>
        ${list(p.desc, (t) => `<p class="project-desc">${t}</p>`)}
        ${p.award ? `<span class="award">★ ${p.award.trim()}</span>` : ''}
        ${techs.length || links.length ? `
        <div class="project-foot">
          ${techs.length ? `<span class="project-uses">uses: ${usesLinks(techs)}</span>` : ''}${list(links, (l) => `
          <a href="${l.href}" class="project-link no-visited"${linkAttrs(l.href)}>
            ${l.label} ${isExternal(l.href) ? '↗' : '→'}
          </a>`)}
        </div>` : ''}
      </article>`;
    }));
  }

  function renderExperiences(d, uses) {
    fill('experiences-sub', d.subtitle);

    fill('experiences', list(d.items, (e) => {
      const techs = uses.get(`exp:${e.id}`) || [];
      return `
      <li class="tl-item" id="exp-${e.id}" data-fields="${(e.fields || []).join(' ')}">
        <time class="tl-date" datetime="${e.datetime}">${e.date}</time>
        <div class="tl-body">
          <h3 class="tl-role">${e.role}</h3>
          <p class="tl-org">${e.org}${e.location ? ` · ${e.location}` : ''}</p>
          <ul class="tl-points">${list(e.points, (t) => `<li>${t}</li>`)}</ul>
          ${techs.length ? `<p class="tl-uses">techniques: ${usesLinks(techs)}</p>` : ''}
        </div>
      </li>`;
    }));
  }

  function renderBlog(d) {
    fill('blog-sub', d.subtitle);

    fill('posts', list(d.posts, (p) => `
      <li>
        <a href="${p.href}" class="post-card card">
          <time class="blog-date" datetime="${p.datetime}">${p.date}</time>
          <div>
            <h3 class="post-card-title">${p.title}</h3>
            <p class="post-card-excerpt">${p.excerpt}</p>
          </div>
          <span class="post-card-go" aria-hidden="true">read →</span>
        </a>
      </li>`));
  }

  function renderThings(d) {
    fill('things-sub', d.subtitle);
    fill('server', list(d.server.paragraphs, (p) => `<p class="prose-sm">${p}</p>`));
    showLiveHeaders();

    fill('setup', list(d.setup, (s) => `<dt>${s.term}</dt><dd>${s.value}</dd>`));

    fill('contact-intro', d.contact.intro);
    fill('contact', list(d.contact.items.filter((c) => !c.hidden), (c) => `
      <li class="contact-item">
        <span class="contact-type">${c.type}</span>
        <a href="${c.href}"${contactAttrs(c)} class="contact-val no-visited">${c.text}</a>
      </li>`));
  }

  // The headers pane shows what the server really sends for this page: a HEAD
  // request to this URL, as the browser received it (through Caddy on the live
  // site). The protocol comes from the page's own navigation timing.
  async function showLiveHeaders() {
    const out = slot('resp-headers');
    const note = slot('resp-note');
    const url = location.pathname;
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      await new Promise((r) => setTimeout(r, 50)); // timing entries land just after the fetch resolves
      // time from sending the request to the first byte back, which leaves out
      // the browser queueing it behind the page's other loads
      const timing = performance.getEntriesByName(new URL(url, location.href).href)
        .filter((e) => e.initiatorType === 'fetch').pop();
      const ms = timing && timing.responseStart > 0 ? timing.responseStart - timing.requestStart : null;
      const nav = performance.getEntriesByType('navigation')[0];
      const proto = { h2: 'HTTP/2', h3: 'HTTP/3', 'http/1.1': 'HTTP/1.1', 'http/1.0': 'HTTP/1.0' }[nav && nav.nextHopProtocol] || 'HTTP';
      const lines = [`${proto} ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`];
      res.headers.forEach((value, name) => lines.push(`${name}: ${value}`));
      out.textContent = lines.join('\n');
      const took = ms === null ? '' : `, first byte after ${ms < 1 ? '<1' : Math.round(ms)} ms`;
      note.textContent = `Fetched just now: HEAD ${url}${took}. Browsers lowercase header names.`;
    } catch {
      out.textContent = "Couldn't read the headers (offline?).";
    }
  }

  // Highlight the tab for whichever section sits under the top of the viewport,
  // and mirror it in the address bar — like the tabs are real.
  function trackActiveSection() {
    const sections = [...document.querySelectorAll('main > section[id]')];
    const tabs = new Map(
      [...document.querySelectorAll('.tab-item')].map((a) => [a.hash.slice(1), a]));
    const addr = document.querySelector('.addr-path');
    let current = null;

    // On narrow screens the tab strip scrolls sideways; keep the active tab
    // visible. (Not scrollIntoView — that would cancel a smooth page scroll.)
    function revealTab(tab) {
      if (!tab) return;
      const nav = tab.parentElement;
      const t = tab.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      if (t.left < n.left || t.right > n.right) nav.scrollLeft += t.left - n.left - 8;
    }

    function update() {
      const probe = window.innerHeight * 0.3;
      let active = sections[0];
      for (const s of sections) {
        if (s.getBoundingClientRect().top <= probe) active = s;
      }
      // At the very bottom, the last section wins even if it's short.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        active = sections[sections.length - 1];
      }
      if (active.id === current) return;
      current = active.id;

      tabs.forEach((tab, id) => tab.classList.toggle('tab-active', id === current));
      revealTab(tabs.get(current));
      if (addr) addr.textContent = '/' + current;
    }

    let queued = false;
    window.addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; update(); });
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  const getJSON = (url) => fetch(url).then((res) => {
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  });

  Promise.all([
    getJSON('data/index.json'),
    getJSON('data/algorithms.json').catch(() => null), // optional: only adds the "uses" links
  ])
    .then(([data, algos]) => {
      const uses = usesIndex(algos);
      renderHome(data.home, data.things.contact);
      renderProjects(data.projects, uses);
      renderExperiences(data.experiences, uses);
      renderBlog(data.blog);
      renderThings(data.things);
      if (window.Diagrams) window.Diagrams.mountAll(document);
      if (window.Fields) {
        window.Fields.mount(slot('field-filter'), {
          groups: [
            { noun: ['project', 'projects'], select: () => document.querySelectorAll('.project-card'), empty: slot('projects-empty') },
            { noun: ['role', 'roles'], select: () => document.querySelectorAll('.tl-item'), empty: slot('experiences-empty') },
          ],
        });
      }

      // Content arrived after the browser's initial jump to #section, so
      // sections above it have grown — jump again to land in the right place.
      // Links from the Algorithms page point at a single card; highlight it.
      const target = location.hash && document.getElementById(location.hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: 'instant' });
        if (target.matches('.project-card, .tl-item')) target.classList.add('is-target');
      }

      trackActiveSection();
    })
    .catch((err) => console.error('Failed to load page data:', err));
})();
