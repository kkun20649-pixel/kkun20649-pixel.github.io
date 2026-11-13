const search = document.querySelector('.catalogue-search input');
const filters = [...document.querySelectorAll('[data-category]')];
const groups = [...document.querySelectorAll('.work-group')];
const resultCount = document.querySelector('.result-count');
const empty = document.querySelector('.empty');

function updateCatalogue() {
  const category = location.hash.slice(10);
  const selected = location.hash.startsWith('#category-') &&
    filters.some(filter => filter.dataset.category === category) ? category : 'all';
  const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let total = 0;

  for (const filter of filters) {
    filter.setAttribute('aria-pressed', String(filter.dataset.category === selected));
  }
  for (const group of groups) {
    let count = 0;
    for (const card of group.querySelectorAll('.work-card')) {
      const text = card.textContent.toLowerCase();
      card.hidden = !terms.every(term => text.includes(term));
      if (!card.hidden) count++;
    }
    group.querySelector('.group-header span').textContent = count + ' 件';
    group.hidden = !count || (selected !== 'all' && group.id !== 'category-' + selected);
    if (!group.hidden) total += count;
  }
  resultCount.textContent = total + ' 件作品';
  empty.hidden = total > 0;
}

for (const filter of filters) {
  filter.addEventListener('click', () => {
    const category = filter.dataset.category;
    const hash = category === 'all' ? '#works' : '#category-' + category;
    if (location.hash !== hash) history.pushState(null, '', hash);
    updateCatalogue();
    document.getElementById('works').scrollIntoView();
  });
}
search.addEventListener('input', updateCatalogue);
window.addEventListener('hashchange', updateCatalogue);
updateCatalogue();
