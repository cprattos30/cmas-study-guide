// CAMS Study Guide - Interactive Platform
// All-in-one app.js (no build step required)

(function() {
  'use strict';

  // ==========================================
  // STATE
  // ==========================================
  const state = {
    glossaryData: null,
    studyPlanData: null,
    guideCache: {},
    searchIndex: [],
    flashcardDeck: [],
    flashcardIdx: 0,
    flashcardFlipped: false,
    flashcardKnown: JSON.parse(localStorage.getItem('cams-fc-known') || '{}'),
    planProgress: JSON.parse(localStorage.getItem('cams-plan-progress') || '{}'),
    currentView: 'welcome',
    currentGuide: null,
    theme: localStorage.getItem('cams-theme') || 'light'
  };

  const EXAM_DATE = new Date('2026-05-01T09:00:00');
  const START_DATE = new Date('2026-03-31');
  const GUIDES = [
    { file: '01-Risks-and-Methods-of-ML-TF.md', name: 'Domain I: Risks & Methods', domain: 'I' },
    { file: '02-International-AML-CFT-Standards.md', name: 'Domain II: International Standards', domain: 'II' },
    { file: '03-AML-CFT-Compliance-Programs.md', name: 'Domain III: Compliance Programs', domain: 'III' },
    { file: '04-Conducting-Responding-Investigations.md', name: 'Domain IV: Investigations', domain: 'IV' },
    { file: '05-FATF-Interpretive-Notes.md', name: 'FATF Reference Guide', domain: 'FATF' }
  ];

  // ==========================================
  // INIT
  // ==========================================
  async function init() {
    applyTheme();
    updateCountdown();
    setInterval(updateCountdown, 60000);

    // Load data
    const [glossary, plan] = await Promise.all([
      fetch('data/glossary.json').then(r => r.json()),
      fetch('data/study-plan.json').then(r => r.json())
    ]);
    state.glossaryData = glossary;
    state.studyPlanData = plan;

    // Pre-load all guides for search indexing
    for (const g of GUIDES) {
      try {
        const text = await fetch('../study-guide/' + g.file).then(r => r.text());
        state.guideCache[g.file] = text;
        indexGuide(g, text);
      } catch (e) {
        console.warn('Failed to load', g.file, e);
      }
    }

    // Set up event listeners
    setupNavigation();
    setupSearch();
    setupThemeToggle();
    setupSidebar();
    setupWelcome();

    // Show welcome
    showView('welcome');
  }

  // ==========================================
  // COUNTDOWN
  // ==========================================
  function updateCountdown() {
    const now = new Date();
    const diff = EXAM_DATE - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    const el = document.getElementById('exam-countdown');
    const welcomeEl = document.getElementById('welcome-countdown');

    let text, cls;
    if (days > 14) {
      text = days + ' days to exam';
      cls = '';
    } else if (days > 7) {
      text = days + ' days to exam';
      cls = 'warning';
    } else if (days > 0) {
      text = days + ' days to exam!';
      cls = 'urgent';
    } else if (days === 0) {
      text = 'EXAM DAY!';
      cls = 'urgent';
    } else {
      text = 'Exam complete';
      cls = '';
    }

    if (el) {
      el.textContent = text;
      el.style.background = cls === 'urgent' ? 'rgba(220,38,38,0.3)' :
                            cls === 'warning' ? 'rgba(217,119,6,0.3)' :
                            'rgba(255,255,255,0.15)';
    }
    if (welcomeEl) {
      welcomeEl.textContent = days > 0 ? days + ' days' : text;
    }
  }

  // ==========================================
  // NAVIGATION
  // ==========================================
  function setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const view = link.dataset.view;
        const file = link.dataset.file;

        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        if (view === 'guide') {
          loadGuide(file);
        } else {
          showView(view);
        }
      });
    });
  }

  function showView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    state.currentView = viewName;

    const tocContainer = document.getElementById('toc-container');

    switch (viewName) {
      case 'welcome':
        document.getElementById('welcome').classList.add('active');
        tocContainer.style.display = 'none';
        updateWelcomeProgress();
        break;
      case 'glossary':
        document.getElementById('glossary-view').classList.add('active');
        tocContainer.style.display = 'none';
        renderGlossary();
        break;
      case 'flashcards':
        document.getElementById('flashcard-view').classList.add('active');
        tocContainer.style.display = 'none';
        initFlashcards();
        break;
      case 'plan':
        document.getElementById('plan-view').classList.add('active');
        tocContainer.style.display = 'none';
        renderStudyPlan();
        break;
      case 'guide':
        document.getElementById('guide-view').classList.add('active');
        tocContainer.style.display = 'block';
        break;
    }
  }

  // ==========================================
  // WELCOME
  // ==========================================
  function setupWelcome() {
    document.querySelectorAll('.welcome-card').forEach(card => {
      card.addEventListener('click', () => {
        const nav = card.dataset.nav;
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        const link = document.querySelector(`.nav-link[data-view="${nav}"]`);
        if (link) link.classList.add('active');
        showView(nav);
      });
    });
  }

  function updateWelcomeProgress() {
    const el = document.getElementById('welcome-progress');
    if (!el || !state.studyPlanData) return;
    const total = state.studyPlanData.days.reduce((s, d) => s + d.tasks.length, 0);
    const done = Object.values(state.planProgress).filter(Boolean).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    el.innerHTML = `<strong>${pct}%</strong> of study plan complete (${done}/${total} tasks)`;
  }

  // ==========================================
  // GUIDE VIEWER
  // ==========================================
  async function loadGuide(file) {
    showView('guide');

    let md = state.guideCache[file];
    if (!md) {
      try {
        md = await fetch('../study-guide/' + file).then(r => r.text());
        state.guideCache[file] = md;
      } catch (e) {
        document.getElementById('guide-content').innerHTML = '<p>Error loading guide. Make sure you launched from the web/ directory.</p>';
        return;
      }
    }

    state.currentGuide = file;
    const html = marked.parse(md);
    document.getElementById('guide-content').innerHTML = html;

    // Build TOC from rendered headings
    buildTOC();

    // Scroll to top
    document.getElementById('content').scrollTop = 0;
  }

  function buildTOC() {
    const toc = document.getElementById('toc');
    const headings = document.querySelectorAll('#guide-content h2, #guide-content h3');
    let tocHTML = '';

    headings.forEach((h, i) => {
      const id = 'heading-' + i;
      h.id = id;
      const level = h.tagName === 'H3' ? 'toc-h3' : '';
      const text = h.textContent.replace(/\(pp?\.\s*\d+.*?\)/g, '').trim();
      tocHTML += `<a href="#${id}" class="${level}" title="${text}">${text}</a>`;
    });

    toc.innerHTML = tocHTML;

    // TOC click scrolling
    toc.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        const target = document.getElementById(a.getAttribute('href').slice(1));
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  // ==========================================
  // GLOSSARY
  // ==========================================
  function renderGlossary(searchText, typeFilter, domainFilter) {
    if (!state.glossaryData) return;

    searchText = searchText || '';
    typeFilter = typeFilter || 'all';
    domainFilter = domainFilter || 'all';

    let items = [];

    // Combine all sources
    if (typeFilter === 'all' || typeFilter === 'terms') {
      state.glossaryData.terms.forEach(t => items.push({ type: 'term', term: t.term, def: t.definition, domain: t.domain, extra: t.fatf_rec, key: t.key_exam }));
    }
    if (typeFilter === 'all' || typeFilter === 'acronyms') {
      state.glossaryData.acronyms.forEach(a => items.push({ type: 'acronym', term: a.acronym, def: `**${a.full_name}** -- ${a.description}`, domain: '', extra: '', key: '' }));
    }
    if (typeFilter === 'all' || typeFilter === 'fatf') {
      state.glossaryData.fatf_recs.forEach(r => items.push({ type: 'fatf', term: `R.${r.number}: ${r.title}`, def: r.key_points, domain: r.cams_domain, extra: r.group, key: '' }));
    }
    if (typeFilter === 'all' || typeFilter === 'numbers') {
      state.glossaryData.key_numbers.forEach(n => items.push({ type: 'number', term: n.item, def: `**${n.threshold}** -- ${n.context}`, domain: '', extra: '', key: '' }));
    }

    // Filter by search
    if (searchText) {
      const q = searchText.toLowerCase();
      items = items.filter(i => i.term.toLowerCase().includes(q) || i.def.toLowerCase().includes(q));
    }

    // Filter by domain
    if (domainFilter !== 'all') {
      items = items.filter(i => i.domain && i.domain.includes(domainFilter));
    }

    // Render
    document.getElementById('glossary-count').textContent = `Showing ${items.length} items`;

    const container = document.getElementById('glossary-table');
    container.innerHTML = items.map(i => `
      <div class="glossary-item">
        <div class="glossary-item-header">
          <span class="glossary-term">${escapeHtml(i.term)}</span>
        </div>
        <div class="glossary-def">${marked.parseInline(i.def)}</div>
        <div class="glossary-tags">
          ${i.domain ? `<span class="tag tag-domain">Domain ${escapeHtml(i.domain)}</span>` : ''}
          ${i.key === 'YES' ? '<span class="tag tag-key">Key Exam</span>' : ''}
          ${i.extra ? `<span class="tag tag-fatf">${escapeHtml(i.extra)}</span>` : ''}
        </div>
      </div>
    `).join('');

    // Set up filter listeners (only once)
    if (!state._glossaryListenersSet) {
      state._glossaryListenersSet = true;

      document.getElementById('glossary-search').addEventListener('input', e => {
        renderGlossary(e.target.value, getActiveFilter(), getActiveDomain());
      });

      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderGlossary(document.getElementById('glossary-search').value, btn.dataset.filter, getActiveDomain());
        });
      });

      document.querySelectorAll('.domain-filter').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.domain-filter').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderGlossary(document.getElementById('glossary-search').value, getActiveFilter(), btn.dataset.domain);
        });
      });
    }
  }

  function getActiveFilter() {
    const btn = document.querySelector('.filter-btn.active');
    return btn ? btn.dataset.filter : 'all';
  }

  function getActiveDomain() {
    const btn = document.querySelector('.domain-filter.active');
    return btn ? btn.dataset.domain : 'all';
  }

  // ==========================================
  // FLASHCARDS
  // ==========================================
  function initFlashcards() {
    buildDeck();
    showCard();

    if (!state._fcListenersSet) {
      state._fcListenersSet = true;

      document.getElementById('flashcard').addEventListener('click', () => {
        state.flashcardFlipped = !state.flashcardFlipped;
        document.getElementById('flashcard').classList.toggle('flipped', state.flashcardFlipped);
      });

      document.getElementById('fc-know').addEventListener('click', () => markCard(true));
      document.getElementById('fc-review').addEventListener('click', () => markCard(false));
      document.getElementById('shuffle-btn').addEventListener('click', () => { buildDeck(); showCard(); });

      document.getElementById('flashcard-source').addEventListener('change', () => { buildDeck(); showCard(); });
    }
  }

  function buildDeck() {
    if (!state.glossaryData) return;

    const source = document.getElementById('flashcard-source').value;
    let items = [];

    if (source === 'all' || source === 'terms-only' || source === 'key-exam') {
      state.glossaryData.terms.forEach(t => {
        if (source === 'key-exam' && t.key_exam !== 'YES') return;
        items.push({ id: 'term-' + t.term, term: t.term, def: t.definition, meta: t.domain ? `Domain ${t.domain}` : '' });
      });
    }

    if (source === 'all' || source === 'acronyms-only') {
      state.glossaryData.acronyms.forEach(a => {
        items.push({ id: 'acr-' + a.acronym, term: a.acronym, def: `${a.full_name} -- ${a.description}`, meta: 'Acronym' });
      });
    }

    if (source === 'needs-review') {
      // All items that were marked "needs review"
      const allItems = [
        ...state.glossaryData.terms.map(t => ({ id: 'term-' + t.term, term: t.term, def: t.definition, meta: t.domain ? `Domain ${t.domain}` : '' })),
        ...state.glossaryData.acronyms.map(a => ({ id: 'acr-' + a.acronym, term: a.acronym, def: `${a.full_name} -- ${a.description}`, meta: 'Acronym' }))
      ];
      items = allItems.filter(i => state.flashcardKnown[i.id] === false);
    }

    // Shuffle
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }

    state.flashcardDeck = items;
    state.flashcardIdx = 0;
  }

  function showCard() {
    const deck = state.flashcardDeck;
    const card = document.getElementById('flashcard');

    state.flashcardFlipped = false;
    card.classList.remove('flipped');

    if (deck.length === 0) {
      document.querySelector('.flashcard-term').textContent = 'No cards in deck';
      document.querySelector('.flashcard-hint').textContent = 'Change filter to see cards';
      document.querySelector('.flashcard-definition').textContent = '';
      document.querySelector('.flashcard-meta').textContent = '';
      document.getElementById('flashcard-progress').textContent = '';
      return;
    }

    const item = deck[state.flashcardIdx];
    document.querySelector('.flashcard-term').textContent = item.term;
    document.querySelector('.flashcard-hint').textContent = 'Click to reveal';
    document.querySelector('.flashcard-definition').textContent = item.def;
    document.querySelector('.flashcard-meta').textContent = item.meta;
    document.getElementById('flashcard-progress').textContent = `${state.flashcardIdx + 1} / ${deck.length}`;

    updateFlashcardStats();
  }

  function markCard(known) {
    const deck = state.flashcardDeck;
    if (deck.length === 0) return;

    const item = deck[state.flashcardIdx];
    state.flashcardKnown[item.id] = known;
    localStorage.setItem('cams-fc-known', JSON.stringify(state.flashcardKnown));

    state.flashcardIdx = (state.flashcardIdx + 1) % deck.length;
    showCard();
  }

  function updateFlashcardStats() {
    const total = state.flashcardDeck.length;
    const known = state.flashcardDeck.filter(i => state.flashcardKnown[i.id] === true).length;
    const review = state.flashcardDeck.filter(i => state.flashcardKnown[i.id] === false).length;
    const unseen = total - known - review;

    document.getElementById('flashcard-stats').innerHTML =
      `<span style="color:var(--success)">Know: ${known}</span> &middot; ` +
      `<span style="color:var(--warning)">Review: ${review}</span> &middot; ` +
      `<span style="color:var(--text-secondary)">Unseen: ${unseen}</span>`;
  }

  // ==========================================
  // STUDY PLAN
  // ==========================================
  function renderStudyPlan() {
    if (!state.studyPlanData) return;

    const container = document.getElementById('plan-days');
    const now = new Date();
    const todayDay = Math.ceil((now - START_DATE) / (1000 * 60 * 60 * 24));
    let currentWeek = '';
    let html = '';

    state.studyPlanData.days.forEach(day => {
      // Week header
      if (day.week && day.week !== currentWeek) {
        currentWeek = day.week;
        html += `<div class="plan-week-header">${escapeHtml(currentWeek)}</div>`;
      }

      const isToday = day.day === todayDay;
      const isPast = day.day < todayDay;
      const completedTasks = day.tasks.filter(t => state.planProgress[t.id]).length;
      const totalTasks = day.tasks.length;
      const allDone = completedTasks === totalTasks && totalTasks > 0;

      html += `
        <div class="plan-day ${isToday ? 'today open' : ''} ${isPast && !isToday ? '' : ''}" data-day="${day.day}">
          <div class="plan-day-header" onclick="this.parentElement.classList.toggle('open')">
            <span class="plan-day-title">
              <span class="day-num">Day ${day.day}</span> (${escapeHtml(day.date)}) -- ${escapeHtml(day.title)}
            </span>
            <span class="plan-day-meta">
              ${isToday ? '<strong style="color:var(--accent)">TODAY</strong>' : ''}
              <span>${completedTasks}/${totalTasks} ${allDone ? '&#10003;' : ''}</span>
            </span>
          </div>
          <div class="plan-day-tasks">
            ${day.tasks.map(t => `
              <div class="plan-task ${state.planProgress[t.id] ? 'completed' : ''}">
                <input type="checkbox" id="${t.id}" ${state.planProgress[t.id] ? 'checked' : ''} onchange="window._toggleTask('${t.id}', this.checked)">
                <label for="${t.id}">${escapeHtml(t.text)}</label>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    updatePlanProgress();
  }

  // Expose task toggle globally for inline handlers
  window._toggleTask = function(taskId, checked) {
    state.planProgress[taskId] = checked;
    localStorage.setItem('cams-plan-progress', JSON.stringify(state.planProgress));

    // Update visual
    const taskEl = document.getElementById(taskId);
    if (taskEl) {
      taskEl.closest('.plan-task').classList.toggle('completed', checked);
    }

    updatePlanProgress();
    updateWelcomeProgress();
  };

  function updatePlanProgress() {
    if (!state.studyPlanData) return;
    const total = state.studyPlanData.days.reduce((s, d) => s + d.tasks.length, 0);
    const done = Object.values(state.planProgress).filter(Boolean).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const fill = document.getElementById('plan-progress-fill');
    const text = document.getElementById('plan-progress-text');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = `${pct}% complete (${done}/${total} tasks)`;
  }

  // ==========================================
  // SEARCH
  // ==========================================
  function indexGuide(guide, text) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (line.trim()) {
        state.searchIndex.push({
          text: line,
          file: guide.file,
          name: guide.name,
          line: i
        });
      }
    });
  }

  function setupSearch() {
    const input = document.getElementById('global-search');
    const results = document.getElementById('search-results');
    let debounceTimer;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const q = input.value.trim().toLowerCase();
        if (q.length < 2) {
          results.classList.add('hidden');
          return;
        }
        performSearch(q);
      }, 200);
    });

    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 2) performSearch(input.value.trim().toLowerCase());
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('#search-container')) results.classList.add('hidden');
    });
  }

  function performSearch(query) {
    const results = document.getElementById('search-results');
    let matches = [];

    // Search guides
    state.searchIndex.forEach(entry => {
      if (entry.text.toLowerCase().includes(query)) {
        matches.push(entry);
      }
    });

    // Search glossary
    if (state.glossaryData) {
      state.glossaryData.terms.forEach(t => {
        if (t.term.toLowerCase().includes(query) || t.definition.toLowerCase().includes(query)) {
          matches.push({ text: `${t.term}: ${t.definition}`, file: '__glossary__', name: 'Glossary', line: 0 });
        }
      });
      state.glossaryData.acronyms.forEach(a => {
        if (a.acronym.toLowerCase().includes(query) || a.full_name.toLowerCase().includes(query)) {
          matches.push({ text: `${a.acronym}: ${a.full_name}`, file: '__glossary__', name: 'Glossary', line: 0 });
        }
      });
    }

    // Limit and render
    matches = matches.slice(0, 20);
    if (matches.length === 0) {
      results.innerHTML = '<div class="search-result"><span class="result-title">No results found</span></div>';
    } else {
      results.innerHTML = matches.map(m => {
        const highlighted = highlightMatch(m.text.substring(0, 200), query);
        return `
          <div class="search-result" data-file="${m.file}" data-line="${m.line}">
            <div class="result-title">${escapeHtml(m.name)}</div>
            <div class="result-context">${highlighted}</div>
          </div>
        `;
      }).join('');

      results.querySelectorAll('.search-result').forEach(r => {
        r.addEventListener('click', () => {
          const file = r.dataset.file;
          results.classList.add('hidden');
          if (file === '__glossary__') {
            showView('glossary');
            document.getElementById('glossary-search').value = document.getElementById('global-search').value;
            renderGlossary(document.getElementById('global-search').value);
          } else {
            const link = document.querySelector(`.nav-link[data-file="${file}"]`);
            if (link) {
              document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
              link.classList.add('active');
            }
            loadGuide(file);
          }
        });
      });
    }

    results.classList.remove('hidden');
  }

  function highlightMatch(text, query) {
    const escaped = escapeHtml(text);
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
  }

  // ==========================================
  // THEME
  // ==========================================
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = state.theme === 'dark' ? '☀' : '☾';
  }

  function setupThemeToggle() {
    document.getElementById('theme-toggle').addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('cams-theme', state.theme);
      applyTheme();
    });
  }

  // ==========================================
  // SIDEBAR
  // ==========================================
  function setupSidebar() {
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      const main = document.getElementById('content');
      sidebar.classList.toggle('collapsed');
      main.classList.toggle('expanded');
    });
  }

  // ==========================================
  // UTILS
  // ==========================================
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ==========================================
  // BOOT
  // ==========================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
