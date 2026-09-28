// Shared page chrome: <site-nav> (browser chrome) and <site-footer> (status bar).
// Load this synchronously in <head> so the elements render as the parser reaches
// them — no flash, no layout shift.
//
//   <site-nav active="blog" path="/blog/zig-server" root="../"></site-nav>
//   <site-footer server="..." proto="..."></site-footer>
//
// `root` is the relative path back to index.html. Omit it on index.html itself;
// that also disables the back button, since there is nowhere to go back to.

(function () {
  const TABS = [
    { id: 'home', label: 'Red Tagura' },
    { id: 'projects', label: 'Projects' },
    { id: 'experiences', label: 'Experiences' },
    { id: 'blog', label: 'Blog' },
    { id: 'things', label: 'Things' },
  ];

  const HOST = 'red.systems';
  const DEFAULT_SERVER = 'Server: zig-httpd/0.1 &nbsp;·&nbsp; epoll &nbsp;·&nbsp; linux/x86_64';
  const DEFAULT_PROTO = 'HTTP/1.1';

  function renderNav(el) {
    const active = el.getAttribute('active');
    const path = el.getAttribute('path') || '/';
    const root = el.getAttribute('root');
    const isIndex = root === null;

    const tabs = TABS.map((t) => `
        <a href="${isIndex ? '' : root + 'index.html'}#${t.id}" class="tab-item${t.id === active ? ' tab-active' : ''}">
          <span class="tab-favicon" aria-hidden="true">⬡</span>
          <span class="tab-label">${t.label}</span>
          <span class="tab-x" aria-hidden="true">×</span>
        </a>`).join('\n');

    const back = isIndex
      ? '<button class="toolbar-btn" disabled>'
      : '<button class="toolbar-btn" onclick="history.back()">';

    return `
  <div class="browser-chrome" role="banner">

    <div class="tab-bar">

      <div class="wc-group" aria-hidden="true">
        <span class="wc wc-close"></span>
        <span class="wc wc-min"></span>
        <span class="wc wc-max"></span>
      </div>

      <nav class="tab-nav" aria-label="Site sections">
${tabs}

        <button class="tab-new-btn" aria-hidden="true" tabindex="-1">+</button>
      </nav>
    </div>

    <div class="toolbar">

      <div class="nav-btns" aria-hidden="true">
        ${back}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="toolbar-btn" disabled>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="toolbar-btn">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13 8A5 5 0 1 1 8 3c1.5 0 2.8.6 3.8 1.6L13 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 3v3h-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>

      <div class="address-bar" role="search" aria-label="Address bar">
        <svg class="lock-icon" width="10" height="13" viewBox="0 0 12 14" fill="none" aria-label="Secure">
          <rect x="1" y="5.5" width="10" height="7.5" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M3.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        <span class="addr-host">${HOST}</span>
        <span class="addr-path">${path}</span>
      </div>

      <div class="toolbar-right" aria-hidden="true">
        <button class="toolbar-btn">
          <svg width="12" height="14" viewBox="0 0 14 16" fill="none"><path d="M2 2h10v13L7 11.5 2 15V2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
        </button>
        <button class="toolbar-btn ham-btn">
          <span class="ham-line"></span>
          <span class="ham-line"></span>
          <span class="ham-line"></span>
        </button>
      </div>

    </div>
  </div>`;
  }

  function renderFooter(el) {
    const server = el.getAttribute('server') || DEFAULT_SERVER;
    const proto = el.getAttribute('proto') || DEFAULT_PROTO;

    return `
  <footer class="status-bar" role="contentinfo" aria-label="Page information">
    <span class="status-done">Done</span>
    <span class="status-host">${HOST}</span>
    <span class="status-right">
      <span class="status-server">${server}</span>
      <span class="status-divider" aria-hidden="true">|</span>
      <span class="status-proto">${proto}</span>
    </span>
  </footer>`;
  }

  // Each element replaces itself with plain markup so the DOM (and every CSS
  // selector) is identical to the old hand-copied version.
  function define(tag, render) {
    customElements.define(tag, class extends HTMLElement {
      connectedCallback() {
        this.outerHTML = render(this);
      }
    });
  }

  define('site-nav', renderNav);
  define('site-footer', renderFooter);
})();
