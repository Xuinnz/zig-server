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

    fill('quick-links', list(contact.items, (c) => `
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

  function renderProjects(d) {
    fill('projects-sub', d.subtitle);

    fill('projects', list(d.items, (p) => `
      <article class="project-card card${p.featured ? ' featured' : ''}">
        <div class="project-head">
          <div>
            ${p.featured ? '<p class="eyebrow">Featured</p>' : ''}
            <h3 class="project-name">${p.name}</h3>
          </div>
          <span class="badge ${p.badge === 'Active' ? 'badge-active' : 'badge-archived'}">${p.badge}</span>
        </div>
        <ul class="chips">${list(p.tags.split(/\s*·\s*/), (t) => `<li class="chip">${t}</li>`)}</ul>
        ${list(p.desc, (t) => `<p class="project-desc">${t}</p>`)}
        ${p.award ? `<span class="award">★ ${p.award.trim()}</span>` : ''}
        <div class="project-foot">
          <a href="${p.link.href}" class="project-link no-visited"${linkAttrs(p.link.href)}>
            ${p.link.label} ${isExternal(p.link.href) ? '↗' : '→'}
          </a>
        </div>
      </article>`));
  }

  function renderExperiences(d) {
    fill('experiences-sub', d.subtitle);

    fill('experiences', list(d.items, (e) => `
      <li class="tl-item">
        <time class="tl-date" datetime="${e.datetime}">${e.date}</time>
        <div class="tl-body">
          <h3 class="tl-role">${e.role}</h3>
          <p class="tl-org">${e.org}</p>
          <ul class="tl-points">${list(e.points, (t) => `<li>${t}</li>`)}</ul>
        </div>
      </li>`));
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
    slot('resp-headers').textContent = d.server.headers;

    fill('setup', list(d.setup, (s) => `<dt>${s.term}</dt><dd>${s.value}</dd>`));

    fill('contact-intro', d.contact.intro);
    fill('contact', list(d.contact.items, (c) => `
      <li class="contact-item">
        <span class="contact-type">${c.type}</span>
        <a href="${c.href}"${contactAttrs(c)} class="contact-val no-visited">${c.text}</a>
      </li>`));
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

  fetch('data/index.json')
    .then((res) => {
      if (!res.ok) throw new Error(`data/index.json: HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      renderHome(data.home, data.things.contact);
      renderProjects(data.projects);
      renderExperiences(data.experiences);
      renderBlog(data.blog);
      renderThings(data.things);

      // Content arrived after the browser's initial jump to #section, so
      // sections above it have grown — jump again to land in the right place.
      const target = location.hash && document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView({ behavior: 'instant' });

      trackActiveSection();
    })
    .catch((err) => console.error('Failed to load page data:', err));
})();
