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
    theme: localStorage.getItem('cams-theme') || 'light',
    pdfAvailable: false,
    pdfPath: '../CAMS Study Guide.pdf'
  };

  const EXAM_DATE = new Date('2026-05-01T09:00:00-04:00');

  // Get today's date as YYYY-MM-DD in Eastern time
  function getEasternToday() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    // returns YYYY-MM-DD
    return parts;
  }

  // Compute which study plan day number it is (Day 1 = March 31, 2026)
  function getStudyDayNumber() {
    const todayStr = getEasternToday(); // "2026-03-31"
    const today = new Date(todayStr + 'T00:00:00');
    const start = new Date('2026-03-31T00:00:00');
    return Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 1;
  }
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

    // Check if PDF is available
    await checkPdfAvailability();

    // Set up event listeners
    setupNavigation();
    setupSearch();
    setupThemeToggle();
    setupSidebar();
    setupWelcome();
    setupPdfPanel();

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

    // Update current date display (Eastern time)
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
      dateEl.textContent = new Intl.DateTimeFormat('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        timeZone: 'America/New_York'
      }).format(now);
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
    const guideContent = document.getElementById('guide-content');
    guideContent.innerHTML = html;

    // Convert page references to clickable links
    makePageRefsClickable(guideContent);

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
    container.innerHTML = items.map(i => {
      // Find PDF page for this term
      let pdfPage = TERM_TO_PAGE[i.term] || null;
      // For FATF recs, extract the recommendation number
      if (!pdfPage && i.type === 'fatf') {
        const recMatch = i.term.match(/^R\.(\d+)/);
        if (recMatch) pdfPage = FATF_REC_TO_PAGE[parseInt(recMatch[1], 10)] || null;
      }
      // For acronyms, try looking up by full name pattern
      if (!pdfPage && i.type === 'acronym') {
        for (const [key, page] of Object.entries(TERM_TO_PAGE)) {
          if (key.includes(i.term)) { pdfPage = page; break; }
        }
      }
      const pdfBtn = pdfPage && state.pdfAvailable
        ? `<span class="page-ref-link glossary-pdf-link" data-page="${pdfPage}" title="View in PDF (p. ${pdfPage})">p. ${pdfPage}</span>`
        : (pdfPage ? `<span class="tag tag-domain" style="font-size:10px">p. ${pdfPage}</span>` : '');
      return `
        <div class="glossary-item">
          <div class="glossary-item-header">
            <span class="glossary-term">${escapeHtml(i.term)}</span>
            ${pdfBtn}
          </div>
          <div class="glossary-def">${marked.parseInline(i.def)}</div>
          <div class="glossary-tags">
            ${i.domain ? `<span class="tag tag-domain">Domain ${escapeHtml(i.domain)}</span>` : ''}
            ${i.key === 'YES' ? '<span class="tag tag-key">Key Exam</span>' : ''}
            ${i.extra ? `<span class="tag tag-fatf">${escapeHtml(i.extra)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Attach click handlers for glossary PDF links
    container.querySelectorAll('.glossary-pdf-link').forEach(link => {
      link.addEventListener('click', e => {
        e.stopPropagation();
        openPdfToPage(parseInt(link.dataset.page, 10));
      });
    });

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

    // Show PDF page link on flashcard back if available
    const pdfPage = TERM_TO_PAGE[item.term];
    const metaEl = document.querySelector('.flashcard-meta');
    if (pdfPage && state.pdfAvailable) {
      metaEl.innerHTML = `${escapeHtml(item.meta)} &middot; <span class="page-ref-link" data-page="${pdfPage}" style="cursor:pointer">View in PDF (p. ${pdfPage})</span>`;
      metaEl.querySelector('.page-ref-link').addEventListener('click', e => {
        e.stopPropagation();
        openPdfToPage(pdfPage);
      });
    } else {
      metaEl.textContent = item.meta + (pdfPage ? ` \u00b7 p. ${pdfPage}` : '');
    }
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
    const todayDay = getStudyDayNumber();
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

    // Update the day header counter (X/Y)
    const dayMatch = taskId.match(/^day(\d+)_/);
    if (dayMatch && state.studyPlanData) {
      const dayNum = parseInt(dayMatch[1], 10);
      const dayData = state.studyPlanData.days.find(d => d.day === dayNum);
      if (dayData) {
        const completedTasks = dayData.tasks.filter(t => state.planProgress[t.id]).length;
        const totalTasks = dayData.tasks.length;
        const allDone = completedTasks === totalTasks && totalTasks > 0;
        const dayEl = document.querySelector(`.plan-day[data-day="${dayNum}"]`);
        if (dayEl) {
          const metaSpan = dayEl.querySelector('.plan-day-meta span:last-child');
          if (metaSpan) metaSpan.innerHTML = `${completedTasks}/${totalTasks} ${allDone ? '&#10003;' : ''}`;
        }

        // Check if the day is now fully complete -> show encouragement
        if (checked && allDone) {
          const msgKey = 'cams-day-msg-' + dayNum;
          if (!sessionStorage.getItem(msgKey)) {
            sessionStorage.setItem(msgKey, 'true');
            showEncouragement(dayNum);
          }
        }
      }
    }

    updatePlanProgress();
    updateWelcomeProgress();
  };

  function showEncouragement(dayNum) {
    const msg = KEVIN_MESSAGES[dayNum - 1] || 'Another day conquered, Kevin! Keep going!';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" style="text-align:center">
        <div style="font-size:48px;margin-bottom:16px">${dayNum === 31 ? '\uD83C\uDF1F\uD83C\uDFC6\uD83C\uDF1F' : '\uD83C\uDF89'}</div>
        <h3 style="color:var(--success)">Day ${dayNum} Complete!</h3>
        <p style="font-size:16px;line-height:1.6;margin-top:12px">${escapeHtml(msg)}</p>
        <div class="modal-buttons" style="justify-content:center;margin-top:20px">
          <button class="modal-btn" onclick="this.closest('.modal').remove()">Let's go!</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

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
  // PDF VIEWER
  // ==========================================
  async function checkPdfAvailability() {
    try {
      const resp = await fetch(state.pdfPath, { method: 'HEAD' });
      if (resp.ok && resp.headers.get('content-type')?.includes('pdf')) {
        state.pdfAvailable = true;
      } else {
        state.pdfAvailable = false;
      }
    } catch (e) {
      state.pdfAvailable = false;
    }

    // Show setup modal if PDF not found and user hasn't dismissed it
    if (!state.pdfAvailable && !localStorage.getItem('cams-pdf-setup-dismissed')) {
      document.getElementById('pdf-setup-modal').classList.remove('hidden');
    }
  }

  function setupPdfPanel() {
    // Close button
    document.getElementById('pdf-panel-close').addEventListener('click', closePdfPanel);

    // Escape key closes panel
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closePdfPanel();

      // When PDF panel is open and user presses Ctrl/Cmd+F,
      // focus the PDF iframe so browser search targets the PDF
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        const panel = document.getElementById('pdf-panel');
        if (panel.classList.contains('open')) {
          e.preventDefault();
          const iframe = document.getElementById('pdf-iframe');
          iframe.focus();
          // Trigger find in the iframe by re-dispatching the keystroke
          // Note: Most browsers will open their find bar for the focused iframe
          try {
            iframe.contentWindow.focus();
          } catch (err) {
            // Cross-origin restriction -- iframe focus is best-effort
          }
        }
      }
    });

    // Setup modal dismiss
    document.getElementById('pdf-setup-dismiss').addEventListener('click', () => {
      document.getElementById('pdf-setup-modal').classList.add('hidden');
      if (document.getElementById('pdf-setup-noshow').checked) {
        localStorage.setItem('cams-pdf-setup-dismissed', 'true');
      }
    });
  }

  // The PDF has 12 front-matter pages (cover, credits, copyright, TOC)
  // before the content starts. Study guide "Page 1" = physical PDF page 13.
  const PDF_PAGE_OFFSET = 12;

  function openPdfToPage(pageNum, contextText) {
    if (!state.pdfAvailable) {
      document.getElementById('pdf-setup-modal').classList.remove('hidden');
      return;
    }

    const panel = document.getElementById('pdf-panel');
    const iframe = document.getElementById('pdf-iframe');
    const title = document.getElementById('pdf-panel-title');
    const contextEl = document.getElementById('pdf-context');

    // Convert study guide page number to physical PDF page number
    const physicalPage = pageNum + PDF_PAGE_OFFSET;
    title.textContent = 'CAMS Study Guide \u2014 Page ' + pageNum;

    // Show context banner telling Kevin what to look for on this page
    if (contextText) {
      contextEl.textContent = '\uD83D\uDD0D Look for: ' + contextText;
      contextEl.style.display = 'block';
    } else {
      contextEl.style.display = 'none';
    }

    // Force iframe reload even if navigating to a different page of the same PDF.
    // Browsers cache the PDF blob and ignore #page changes on same src base.
    // Setting src to blank first, then to the target in a microtask, forces a true reload.
    iframe.src = 'about:blank';
    requestAnimationFrame(() => {
      iframe.src = state.pdfPath + '#page=' + physicalPage;
    });

    panel.classList.add('open');
    document.body.classList.add('pdf-open');
    // No scroll restoration needed -- we only constrain max-width via CSS,
    // which doesn't reflow already-shorter lines so scroll position is stable.
  }

  function closePdfPanel() {
    const panel = document.getElementById('pdf-panel');

    panel.classList.remove('open');
    document.body.classList.remove('pdf-open');

    // Clear iframe after transition to free memory
    setTimeout(() => {
      if (!panel.classList.contains('open')) {
        document.getElementById('pdf-iframe').src = 'about:blank';
      }
    }, 350);
  }

  function makePageRefsClickable(container) {
    // Find all <em> tags that contain page references like (p. XX) or (pp. XX-YY)
    // The markdown renders *(p. 42)* as <em>(p. 42)</em>
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
    const emTags = [];
    while (walker.nextNode()) {
      if (walker.currentNode.tagName === 'EM') {
        emTags.push(walker.currentNode);
      }
    }

    emTags.forEach(em => {
      const text = em.textContent;
      // Match patterns: (p. 42), (pp. 42-50), (p. 42, 45), (pp. 245-246)
      const match = text.match(/^\(pp?\.\s*(\d+)(?:\s*[-,]\s*\d+)*\)$/);
      if (match) {
        const pageNum = parseInt(match[1], 10);

        // Extract context: the heading or list item text surrounding this reference
        let contextText = '';
        const parent = em.closest('li, h2, h3, h4, p');
        if (parent) {
          // Get the text content without the page ref itself, trimmed
          contextText = parent.textContent
            .replace(/\(pp?\.\s*\d+[\d, -]*\)/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 120);
        }

        const link = document.createElement('span');
        link.className = 'page-ref-link' + (state.pdfAvailable ? '' : ' no-pdf');
        link.textContent = text;
        link.title = state.pdfAvailable
          ? 'Click to open PDF at page ' + pageNum
          : 'PDF not found -- drop CAMS Study Guide.pdf into the cmas-study-guide folder to enable';
        link.setAttribute('data-page', pageNum);
        link.setAttribute('data-context', contextText);

        link.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          openPdfToPage(pageNum, contextText);
        });

        em.replaceWith(link);
      }
    });
  }

  // ==========================================
  // GLOSSARY PDF PAGE MAPPING
  // ==========================================
  // Maps key glossary terms to the study guide page where they are primarily discussed
  const TERM_TO_PAGE = {
    'Money Laundering': 3, 'Predicate Offense': 3, 'Placement': 5, 'Layering': 5,
    'Integration': 6, 'Terrorist Financing (TF)': 133, 'Structuring (Smurfing)': 39,
    'Microstructuring': 43, 'Correspondent Banking': 25, 'Respondent Bank': 25,
    'Payable-Through Account (PTA)': 29, 'Nested Account': 25, 'Concentration Account': 31,
    'Private Banking': 32, 'Politically Exposed Person (PEP)': 37,
    'Shell Company': 127, 'Shelf Company': 127, 'Beneficial Owner': 125,
    'Money Services Business (MSB)': 50, 'Hawala': 138,
    'Informal Value Transfer System (IVTS)': 138, 'Trade-Based Money Laundering (TBML)': 102,
    'Black Market Peso Exchange (BMPE)': 107, 'Free Trade Zone (FTZ)': 101,
    'Gatekeeper': 85, 'Trust and Company Service Provider (TCSP)': 94,
    'Virtual Currency / Virtual Asset': 118, 'Virtual Asset Service Provider (VASP)': 118,
    'Prepaid Card': 113, 'Non-Profit Organization (NPO)': 142, 'Willful Blindness': 4,
    'Wildlife Trafficking': 111,
    'Financial Action Task Force (FATF)': 153, 'FATF 40 Recommendations': 158,
    'FATF Interpretive Notes': 158, 'Risk-Based Approach (RBA)': 245,
    'Mutual Evaluation': 154, 'FATF Grey List': 172, 'FATF Black List': 172,
    'FATF-Style Regional Body (FSRB)': 202,
    'Basel Committee on Banking Supervision': 176, 'European Union AML Directives': 190,
    'Egmont Group': 215, 'Wolfsberg Group': 218,
    'USA PATRIOT Act': 226, 'Section 311 (PATRIOT Act)': 228,
    'Section 312 (PATRIOT Act)': 229, 'Section 314(a)': 232, 'Section 314(b)': 232,
    'Section 326 (PATRIOT Act)': 233, 'Anti-Money Laundering Act of 2020 (AMLA)': 234,
    'Bank Secrecy Act (BSA)': 226, 'Office of Foreign Assets Control (OFAC)': 242,
    'SDN List': 242, '50% Rule (OFAC)': 242,
    'Designated Non-Financial Businesses and Professions (DNFBPs)': 85,
    'FinCEN': 388,
    'Customer Due Diligence (CDD)': 296, 'Enhanced Due Diligence (EDD)': 299,
    'Simplified Due Diligence (SDD)': 296, 'Know Your Customer (KYC)': 296,
    'Know Your Employee (KYE)': 315, 'Customer Identification Program (CIP)': 301,
    'Suspicious Activity Report (SAR)': 367, 'Currency Transaction Report (CTR)': 39,
    'Tipping Off': 367, 'Safe Harbor': 367, 'Compliance Officer': 270,
    'Independent Audit / Independent Testing': 285, 'AML/CFT Training': 278,
    'Culture of Compliance': 289, 'Transaction Monitoring': 319,
    'Sanctions Screening': 313, 'PEP Screening': 314, 'Risk Scoring': 250,
    'Four/Five Pillars of AML Program': 261, 'Red Flags': 325,
    'De-risking': 296, 'Wire Transfer / Travel Rule': 329,
    'Suspicious Transaction Report (STR)': 367, 'Financial Intelligence Unit (FIU)': 386,
    'Mutual Legal Assistance Treaty (MLAT)': 385, 'SHERLOC': 384,
    'Account Closure': 372,
    'Proliferation Financing': 158, 'Targeted Financial Sanctions (TFS)': 158,
    'Travel Rule': 158, 'Record Keeping': 158,
    'Extraterritorial Jurisdiction': 239
  };

  // Maps FATF Recommendation numbers to their primary PDF page
  const FATF_REC_TO_PAGE = {
    1: 158, 2: 158, 3: 158, 4: 158, 5: 159, 6: 159, 7: 159, 8: 159,
    9: 160, 10: 160, 11: 161, 12: 161, 13: 161, 14: 162, 15: 162,
    16: 163, 17: 163, 18: 163, 19: 164, 20: 164, 21: 164, 22: 165,
    23: 165, 24: 166, 25: 166, 26: 166, 27: 167, 28: 167, 29: 167,
    30: 167, 31: 167, 32: 168, 33: 168, 34: 168, 35: 168,
    36: 384, 37: 384, 38: 384, 39: 384, 40: 384
  };

  // ==========================================
  // KEVIN'S DAILY ENCOURAGEMENT
  // ==========================================
  const KEVIN_MESSAGES = [
    "Day 1 done, Kevin! The journey of a thousand miles starts with a single step. You just took it.",
    "Day 2 in the books! You now know more about ML than 99% of people on the planet. Keep building.",
    "3 days down, Kevin! Banks, wire transfers, correspondent accounts -- you're speaking the language now.",
    "Day 4 complete! Nonbank FIs and casinos -- you're seeing how deep the rabbit hole goes. Stay sharp.",
    "Friday grind complete! Gatekeepers, real estate, trade -- you're covering serious ground, Kevin.",
    "Saturday study session done! Virtual currency, shell companies -- you're ahead of schedule. Respect.",
    "Week 1 COMPLETE! You've conquered Domain I. Terrorist financing, hawala, the works. You're built different, Kevin.",
    "Day 8 done! FATF foundations locked in. You're thinking like a global AML professional now.",
    "FATF deep dive Part 1 -- done! R.1, R.10, R.12 -- these are the heavy hitters and you nailed them, Kevin.",
    "Day 10 complete! Travel Rule, SARs, beneficial ownership -- the interpretive notes are clicking. Keep going.",
    "Basel Committee and EU Directives down! Kevin, you just covered 30+ years of international AML history in one day.",
    "FSRBs and Egmont Group -- done! You can name more AML bodies than most compliance officers. Seriously.",
    "US law day complete! PATRIOT Act, AMLA 2020, OFAC -- you're dangerous now, Kevin. In the best way.",
    "Week 2 COMPLETE! Domain II conquered. International standards are your playground. Time to build on it.",
    "Day 15: Risk assessment mastered! You understand why RBA beats checklists every time. The exam loves this, Kevin.",
    "Program elements locked in! Four pillars, compliance officer duties, training -- the backbone of every AML program. Strong work.",
    "Day 17 done! Training, audit, culture of compliance -- you know what separates good programs from great ones.",
    "KYC day complete! CDD, EDD, SDD -- you know exactly when each applies. Examiners love testing this, and you're ready.",
    "Monitoring and screening -- done! Sanctions, PEPs, transaction monitoring. You're thinking like a compliance officer now, Kevin.",
    "RED FLAGS Part 1 -- CRUSHED! This is the most tested material on the exam and you're eating it alive.",
    "RED FLAGS Part 2 -- DONE! Kevin, you just studied the single highest-yield section of the entire exam. Week 3 complete. Absolute warrior.",
    "Day 22: Internal investigations mastered! SAR decision-making, evidence gathering -- you know the playbook now.",
    "SARs, account closures, 314(a)/314(b) -- locked in! Day 23 down. You're in the home stretch, Kevin.",
    "Day 24: Law enforcement cooperation, FIUs, MLATs -- the international picture is complete. Domain IV conquered!",
    "Comprehensive review day 1 -- done! Going back through the material is when it really clicks. Feel that confidence growing.",
    "Day 26: Second review pass complete. The connections between domains are becoming crystal clear now, Kevin.",
    "Practice scenarios done! You're analyzing cases like a veteran. The exam throws scenarios -- and you're ready to catch them.",
    "Day 28: Weak areas addressed. Every warrior has gaps -- the great ones fill them. That's you today, Kevin.",
    "Day 29: Glossary review + high-yield review complete. The knowledge is locked in. You've done the work.",
    "Day 30: Simulation day done! You've seen every question type, every trap, every scenario. Tomorrow is YOUR day, Kevin.",
    "FINAL DAY BEFORE THE EXAM! Kevin Holzendorf, you put in 31 days of focused, disciplined work. You studied every domain, drilled every red flag, mastered every concept. Walk in tomorrow with confidence -- you've EARNED this. Go get that CAMS. We're all rooting for you!"
  ];

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
