// Field filter: All · Backend · Infra · Systems · AI/ML · Web.
//
//   Fields.mount(barElement, {
//     groups: [{ noun: ['project', 'projects'], select: () => document.querySelectorAll('.project-card'),
//                empty: element shown when nothing in this group matches (optional) }],
//     after: (field) => { … },   // optional, runs after every change
//   });
//
// Items carry data-fields="backend infra". The choice lives in the URL
// (?field=infra), so a link can open the page already filtered.

window.Fields = (function () {
  const FIELDS = [
    ['all', 'All'], ['backend', 'Backend'], ['infra', 'Infra'],
    ['systems', 'Systems'], ['ai', 'AI / ML'], ['web', 'Web'],
  ];
  const known = (id) => FIELDS.some(([f]) => f === id);
  const labelOf = (id) => (FIELDS.find(([f]) => f === id) || [])[1];
  const count = (n, [one, many]) => `${n} ${n === 1 ? one : many}`;

  const current = () => {
    const f = new URLSearchParams(location.search).get('field');
    return known(f) ? f : 'all';
  };

  function remember(id) {
    const url = new URL(location.href);
    if (id === 'all') url.searchParams.delete('field');
    else url.searchParams.set('field', id);
    history.replaceState(null, '', url);
  }

  const attr = (fields) => (fields || []).join(' ');
  const matches = (el, id) => id === 'all' || (el.dataset.fields || '').split(' ').includes(id);

  function mount(bar, { groups, after }) {
    bar.innerHTML = `
      <span class="eyebrow field-label">Show</span>
      <span class="field-btns" role="group" aria-label="Filter by field">
        ${FIELDS.map(([id, label]) => `<button type="button" class="field-btn" data-field="${id}">${label}</button>`).join('')}
      </span>
      <span class="field-count" aria-live="polite"></span>`;

    function apply(id) {
      const counts = groups.map(({ noun, select, empty }) => {
        let shown = 0;
        select().forEach((el) => {
          const ok = matches(el, id);
          el.hidden = !ok;
          if (ok) shown += 1;
        });
        if (empty) {
          empty.hidden = shown > 0;
          if (!shown) empty.innerHTML = `No ${noun[1]} tagged ${labelOf(id)}. <button type="button" class="field-reset">Show all</button>`;
        }
        return count(shown, noun);
      });
      bar.querySelectorAll('.field-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.field === id)));
      bar.querySelector('.field-count').textContent = id === 'all' ? '' : counts.join(' · ');
      if (after) after(id);
    }

    const choose = (id) => { remember(id); apply(id); };
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('.field-btn');
      if (b) choose(b.dataset.field);
    });
    groups.forEach(({ empty }) => empty && empty.addEventListener('click', (e) => {
      if (e.target.closest('.field-reset')) choose('all');
    }));
    apply(current());
  }

  return { mount, attr };
})();
