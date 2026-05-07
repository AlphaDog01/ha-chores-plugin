/**
 * hades-budget-card.js  v4
 * custom:hades-budget-card       — full monthly view
 * custom:hades-budget-week-card  — compact current week
 *
 * Resource: /local/hades-budget-card.js?v=4
 */

const BUDGET_API   = 'http://10.72.16.57:33191';
const BUDGET_TOKEN = '7SFbRMVLbxByL85pv55eahRYqkxoTVKNVxVM4QXw3s';
const HEADERS      = { 'Authorization': `Bearer ${BUDGET_TOKEN}` };

function fmt(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function styleColor(s) {
  return { strong: '#00D4A8', tight: '#F97316', zero: '#EF4444', 'rent-week': '#A855F7' }[s] || '#94A3B8';
}
function styleLabel(s) {
  return { strong: 'Healthy', tight: 'Tight', zero: 'Zero Out', 'rent-week': 'Rent Week' }[s] || s;
}

function tagBadge(tag) {
  const map = {
    ach:     { label: 'ACH',     bg: 'rgba(79,195,247,0.15)',  color: '#4FC3F7' },
    early:   { label: 'Early',   bg: 'rgba(0,212,168,0.15)',   color: '#00D4A8' },
    split:   { label: 'Split',   bg: 'rgba(255,193,7,0.15)',   color: '#FFC107' },
    locked:  { label: 'Locked',  bg: 'rgba(239,68,68,0.15)',   color: '#EF4444' },
    onemain: { label: 'OneMain', bg: 'rgba(168,85,247,0.15)',  color: '#A855F7' },
    rent:    { label: 'Rent',    bg: 'rgba(192,132,252,0.15)', color: '#C084FC' },
  };
  const t = map[tag];
  if (!t) return '';
  return `<span style="font-size:10px;padding:2px 8px;border-radius:4px;background:${t.bg};color:${t.color};font-weight:600;white-space:nowrap">${t.label}</span>`;
}

function bigDonut(pct, color, size) {
  const s = size || 120;
  const r = s * 0.38, cx = s/2, cy = s/2, sw = s * 0.075;
  const circ = 2 * Math.PI * r;
  const dash  = Math.min(pct,100) / 100 * circ;
  const fs = s * 0.175;
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"
      stroke-dasharray="${dash} ${circ}" stroke-linecap="round"
      transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy+2}" text-anchor="middle" dominant-baseline="middle"
      fill="${color}" font-size="${fs}" font-weight="700"
      font-family="DM Sans,sans-serif">${Math.round(pct)}%</text>
  </svg>`;
}

// Person icon SVGs
const MIKE_ICON    = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#00D4A8" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
const HEATHER_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#A855F7" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
const DOLLAR_ICON  = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#4FC3F7" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2.5-3 2.5-3 1.1-3 2.5 1.3 2.5 3 2.5 3-1.1 3-2.5"/></svg>`;
const BILLS_ICON   = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#F87171" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h4"/></svg>`;
const SURPLUS_ICON = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#00D4A8" stroke-width="1.8"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;

const BASE_CSS = `
  :host { display: block; font-family: 'DM Sans','Segoe UI',sans-serif; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .card {
    background: #0f172a;
    border-radius: 16px;
    overflow: hidden;
    color: #E2E8F0;
  }
  .loading, .error {
    padding: 48px; text-align: center;
    color: rgba(255,255,255,0.3); font-size: 14px;
  }
  .error { color: #EF4444; }
  .spinner {
    width: 28px; height: 28px;
    border: 3px solid rgba(255,255,255,0.08);
    border-top-color: #00D4A8;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    margin: 0 auto 14px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

// ══════════════════════════════════════════════════════════════════════════════
// CARD 1 — hades-budget-card
// ══════════════════════════════════════════════════════════════════════════════

class HadesBudgetCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._months = []; this._activeId = null;
    this._monthData = null; this._loading = true;
    this._error = null; this._initialized = false;
  }

  setConfig(c) { this._config = c; }

  set hass(h) {
    if (!this._initialized) {
      this._initialized = true;
      this._render();
      this._loadMonths();
    }
  }

  async _loadMonths() {
    try {
      const r = await fetch(`${BUDGET_API}/api/v1/months`, { headers: HEADERS });
      const j = await r.json();
      this._months = j.months || [];
      if (this._months.length) {
        this._activeId = this._months[0].id;
        await this._loadMonth(this._activeId);
      } else { this._loading = false; this._render(); }
    } catch(e) { this._error = 'Failed to load budget data'; this._loading = false; this._render(); }
  }

  async _loadMonth(id) {
    this._loading = true; this._render();
    try {
      const r = await fetch(`${BUDGET_API}/api/v1/month/${id}`, { headers: HEADERS });
      this._monthData = await r.json();
      this._loading = false; this._render();
    } catch(e) { this._error = 'Failed to load month'; this._loading = false; this._render(); }
  }

  _render() {
    const sh = this.shadowRoot;
    sh.innerHTML = `
      <style>
        ${BASE_CSS}

        /* ── Tabs ── */
        .tabs {
          display: flex;
          background: #0a1120;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .tab {
          flex: 1; padding: 14px 0;
          text-align: center; font-size: 11px; font-weight: 700;
          letter-spacing: 1.5px; text-transform: uppercase;
          color: rgba(255,255,255,0.3); background: transparent; border: none;
          cursor: pointer; position: relative; transition: color 0.2s;
        }
        .tab:hover { color: rgba(255,255,255,0.6); }
        .tab.active { color: #4FC3F7; }
        .tab.active::after {
          content: ''; position: absolute; bottom: 0; left: 25%; right: 25%;
          height: 2px; background: #4FC3F7; border-radius: 2px 2px 0 0;
        }

        /* ── Header ── */
        .header {
          display: flex; align-items: center;
          padding: 20px 24px; gap: 0;
          background: #0f172a;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .header-icon {
          width: 72px; height: 72px; border-radius: 16px;
          background: linear-gradient(135deg, #1e3a5f 0%, #0f2040 100%);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; margin-right: 20px;
        }
        .header-main { margin-right: 40px; }
        .header-eyebrow {
          font-size: 10px; font-weight: 700; letter-spacing: 2px;
          text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 4px;
        }
        .header-total {
          font-size: 42px; font-weight: 800; color: #fff;
          line-height: 1; letter-spacing: -1px;
        }
        .header-sub { font-size: 11px; color: rgba(255,255,255,0.28); margin-top: 5px; }
        .header-divider {
          width: 1px; height: 56px; background: rgba(255,255,255,0.08);
          margin: 0 32px; flex-shrink: 0;
        }
        .header-person { margin-right: 32px; }
        .header-person-icon {
          width: 36px; height: 36px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 6px;
        }
        .header-person-label {
          font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
          color: rgba(255,255,255,0.3); margin-bottom: 3px;
        }
        .header-person-value { font-size: 24px; font-weight: 700; }

        /* ── Week row ── */
        .week-row {
          display: flex; gap: 12px;
          padding: 16px;
        }

        /* ── Week card ── */
        .week-card {
          flex: 1; min-width: 0;
          background: #1a2540;
          border-radius: 12px;
          overflow: hidden;
          display: flex; flex-direction: column;
          border-top: 3px solid transparent;
        }

        .wc-head {
          padding: 14px 16px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .wc-top {
          display: flex; align-items: flex-start;
          justify-content: space-between; margin-bottom: 4px;
        }
        .wc-week-num {
          font-size: 11px; font-weight: 800;
          letter-spacing: 1.2px; text-transform: uppercase;
        }
        .wc-badge {
          font-size: 10px; font-weight: 700;
          padding: 3px 10px; border-radius: 6px;
          letter-spacing: 0.3px; white-space: nowrap;
        }
        .wc-dates { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 1px; }

        /* stats */
        .wc-stats {
          display: grid; grid-template-columns: repeat(3,1fr);
          padding: 10px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          gap: 4px;
        }
        .wc-stat-lbl {
          font-size: 9px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.8px; color: rgba(255,255,255,0.3); margin-bottom: 4px;
        }
        .wc-stat-val { font-size: 16px; font-weight: 700; }

        /* bills */
        .wc-bills { padding: 8px 16px; flex: 1; }
        .bill-row {
          display: flex; align-items: center;
          padding: 7px 0;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          gap: 6px;
        }
        .bill-row:last-child { border-bottom: none; }
        .bill-info { flex: 1; min-width: 0; }
        .bill-name { font-size: 12px; font-weight: 500; color: #CBD5E1; }
        .bill-note { font-size: 10px; color: rgba(255,255,255,0.25); margin-top: 1px; }
        .bill-tags { display: flex; gap: 3px; flex-wrap: wrap; justify-content: flex-end; }
        .bill-amt  {
          font-size: 13px; font-weight: 700; color: #F87171;
          white-space: nowrap; min-width: 52px; text-align: right;
        }

        /* week note */
        .wc-note {
          padding: 8px 16px 10px;
          font-size: 10px; color: rgba(255,255,255,0.28); line-height: 1.5;
          border-top: 1px solid rgba(255,255,255,0.04);
        }

        /* ── Footer ── */
        .footer {
          margin: 0 16px 16px;
          background: #1a2540;
          border-radius: 12px;
          overflow: hidden;
        }
        .footer-inner {
          display: flex; align-items: center;
          padding: 24px 28px; gap: 0;
        }
        .f-block {
          display: flex; align-items: center; gap: 16px;
          flex: 1;
        }
        .f-icon-box {
          width: 56px; height: 56px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .f-text { }
        .f-lbl {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 1px; color: rgba(255,255,255,0.35); margin-bottom: 4px;
        }
        .f-val  { font-size: 30px; font-weight: 800; line-height: 1; }
        .f-sub  { font-size: 11px; color: rgba(255,255,255,0.28); margin-top: 4px; }
        .f-divider {
          width: 1px; height: 64px; background: rgba(255,255,255,0.07);
          margin: 0 28px; flex-shrink: 0;
        }
        .f-donut-block {
          display: flex; align-items: center; gap: 18px; flex-shrink: 0;
        }
        .f-donut-text { }
        .f-donut-lbl {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 1px; color: rgba(255,255,255,0.35); margin-bottom: 4px;
        }
        .f-donut-val { font-size: 30px; font-weight: 800; line-height: 1; }
        .f-donut-sub { font-size: 11px; color: rgba(255,255,255,0.28); margin-top: 4px; }
      </style>
      <div class="card" id="root"></div>
    `;

    const root = sh.getElementById('root');

    root.innerHTML = `
      <div class="tabs">
        ${this._months.map(m => `
          <button class="tab ${m.id === this._activeId ? 'active' : ''}" data-id="${m.id}">
            ${m.name} ${m.year}
          </button>`).join('')}
      </div>
      <div id="body"></div>
    `;

    root.querySelectorAll('.tab').forEach(btn =>
      btn.addEventListener('click', () => {
        if (btn.dataset.id !== this._activeId) {
          this._activeId = btn.dataset.id;
          this._loadMonth(this._activeId);
        }
      })
    );

    const body = root.querySelector('#body');

    if (this._loading) { body.innerHTML = `<div class="loading"><div class="spinner"></div>Loading…</div>`; return; }
    if (this._error)   { body.innerHTML = `<div class="error">${this._error}</div>`; return; }

    const d = this._monthData;
    if (!d) { body.innerHTML = `<div class="loading">No data</div>`; return; }

    const activeMeta = this._months.find(m => m.id === this._activeId) || {};
    const mikeTot    = (d.weeks||[]).reduce((s,w) => s + (w.income?.mike    || 0), 0);
    const heatherTot = (d.weeks||[]).reduce((s,w) => s + (w.income?.heather || 0), 0);

    // ── Header ──
    let html = `
      <div class="header">
        <div class="header-icon">${DOLLAR_ICON}</div>
        <div class="header-main">
          <div class="header-eyebrow">Total Month Income</div>
          <div class="header-total">${fmt(d.total_income)}</div>
          <div class="header-sub">${activeMeta.sub || ''}</div>
        </div>
        <div class="header-divider"></div>
        <div class="header-person">
          <div class="header-person-label">Mike</div>
          <div class="header-person-value" style="color:#00D4A8">${fmt(mikeTot)}</div>
        </div>
        <div class="header-divider"></div>
        <div class="header-person">
          <div class="header-person-label">Heather</div>
          <div class="header-person-value" style="color:#A855F7">${fmt(heatherTot)}</div>
        </div>
        <div class="header-divider"></div>
        <div class="header-person">
          <div class="header-person-label">Total Income</div>
          <div class="header-person-value" style="color:#4FC3F7">${fmt(d.total_income)}</div>
        </div>
      </div>
    `;

    // ── Week row ──
    html += `<div class="week-row">`;

    (d.weeks||[]).forEach((week, i) => {
      const sc       = styleColor(week.style);
      const sl       = styleLabel(week.style);
      const balColor = week.balance_left > 500 ? '#00D4A8'
                     : week.balance_left > 0   ? '#F97316'
                     : '#EF4444';

      const billRows = (week.bills||[]).map(b => `
        <div class="bill-row">
          <div class="bill-info">
            <div class="bill-name">${b.name}</div>
            ${b.note ? `<div class="bill-note">${b.note}</div>` : ''}
          </div>
          <div class="bill-tags">${(b.tags||[]).map(tagBadge).join('')}</div>
          <div class="bill-amt">-${fmt(b.amount)}</div>
        </div>
      `).join('') || `<div style="font-size:11px;color:rgba(255,255,255,0.22);padding:6px 0">No bills 🎉</div>`;

      html += `
        <div class="week-card" style="border-top-color:${sc}">
          <div class="wc-head">
            <div class="wc-top">
              <div class="wc-week-num" style="color:${sc}">Week ${i+1}</div>
              <span class="wc-badge" style="background:${sc}22;color:${sc}">${sl}</span>
            </div>
            <div class="wc-dates">${week.date}${week.day ? ' — ' + week.day : ''}</div>
          </div>

          <div class="wc-stats">
            <div>
              <div class="wc-stat-lbl">Income</div>
              <div class="wc-stat-val" style="color:#4CAF50">${fmt(week.income?.total)}</div>
            </div>
            <div>
              <div class="wc-stat-lbl">↑ Bills</div>
              <div class="wc-stat-val" style="color:#F87171">${fmt(week.bills_total)}</div>
            </div>
            <div>
              <div class="wc-stat-lbl">Left Over</div>
              <div class="wc-stat-val" style="color:${balColor}">${fmt(week.balance_left)}</div>
            </div>
          </div>

          <div class="wc-bills">${billRows}</div>
          ${week.note ? `<div class="wc-note">${week.note}</div>` : ''}
        </div>
      `;
    });

    html += `</div>`; // end week-row

    // ── Footer ──
    const surplus   = d.surplus || 0;
    const surpColor = surplus > 1000 ? '#00D4A8' : surplus > 0 ? '#F97316' : '#EF4444';
    const leftPct   = d.total_income > 0 ? (surplus / d.total_income) * 100 : 0;
    const billsPct  = d.total_income > 0 ? (d.total_bills / d.total_income) * 100 : 0;

    html += `
      <div class="footer">
        <div class="footer-inner">
          <div class="f-block">
            <div class="f-icon-box" style="background:rgba(248,113,113,0.12)">${BILLS_ICON}</div>
            <div class="f-text">
              <div class="f-lbl">Total Bills</div>
              <div class="f-val" style="color:#F87171">${fmt(d.total_bills)}</div>
              <div class="f-sub">${Math.round(billsPct)}% of income · ${(d.weeks||[]).reduce((s,w)=>(s+(w.bills||[]).length),0)} transactions</div>
            </div>
          </div>

          <div class="f-divider"></div>

          <div class="f-block">
            <div class="f-icon-box" style="background:rgba(0,212,168,0.12)">${SURPLUS_ICON}</div>
            <div class="f-text">
              <div class="f-lbl">Total Left Over</div>
              <div class="f-val" style="color:${surpColor}">${fmt(surplus)}</div>
              <div class="f-sub">Remaining after bills</div>
            </div>
          </div>

          <div class="f-divider"></div>

          <div class="f-donut-block">
            ${bigDonut(leftPct, surpColor, 110)}
            <div class="f-donut-text">
              <div class="f-donut-lbl">Left Over</div>
              <div class="f-donut-val" style="color:${surpColor}">${Math.round(leftPct)}%</div>
              <div class="f-donut-sub">of total income</div>
            </div>
          </div>
        </div>
      </div>
    `;

    body.innerHTML = html;
  }

  getCardSize() { return 10; }
  static getStubConfig() { return {}; }
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD 2 — hades-budget-week-card
// ══════════════════════════════════════════════════════════════════════════════

class HadesBudgetWeekCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._week = null; this._loading = true;
    this._error = null; this._initialized = false;
  }

  setConfig(c) { this._config = c; }

  set hass(h) {
    if (!this._initialized) {
      this._initialized = true; this._render(); this._loadWeek();
    }
  }

  async _loadWeek() {
    try {
      const r = await fetch(`${BUDGET_API}/api/v1/week/current`, { headers: HEADERS });
      this._week = await r.json();
      this._loading = false; this._render();
    } catch(e) {
      this._error = 'Failed to load week data';
      this._loading = false; this._render();
    }
  }

  _render() {
    const sh = this.shadowRoot;
    sh.innerHTML = `
      <style>
        ${BASE_CSS}
        .card { padding: 0; }

        .banner {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px;
          background: #1a2540;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .banner-left { }
        .banner-eyebrow {
          font-size: 10px; font-weight: 700; letter-spacing: 2px;
          text-transform: uppercase; color: rgba(255,255,255,0.28); margin-bottom: 5px;
        }
        .banner-title { font-size: 20px; font-weight: 700; color: #E2E8F0; }
        .banner-date  { font-size: 12px; color: rgba(255,255,255,0.35); margin-top: 4px; }
        .badge {
          font-size: 11px; font-weight: 700;
          padding: 5px 14px; border-radius: 8px; letter-spacing: 0.4px;
        }

        .stats-row {
          display: grid; grid-template-columns: repeat(4,1fr);
          background: #0f172a;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .stat-cell {
          padding: 14px 18px;
          border-right: 1px solid rgba(255,255,255,0.05);
        }
        .stat-cell:last-child { border-right: none; }
        .stat-lbl {
          font-size: 9px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 1px; color: rgba(255,255,255,0.3); margin-bottom: 5px;
        }
        .stat-val { font-size: 20px; font-weight: 700; }

        .bills-section { padding: 12px 20px 8px; }
        .bills-title {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 1px; color: rgba(255,255,255,0.28); padding: 4px 0 8px;
        }
        .bill-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); gap: 8px;
        }
        .bill-row:last-child { border-bottom: none; }
        .bill-name { font-size: 13px; color: #CBD5E1; }
        .bill-note { font-size: 11px; color: rgba(255,255,255,0.28); margin-top: 2px; }
        .bill-tags { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
        .bill-amt  {
          font-size: 14px; font-weight: 700; color: #F87171;
          white-space: nowrap; min-width: 64px; text-align: right;
        }

        .bottom {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px;
          background: #1a2540;
          border-top: 1px solid rgba(255,255,255,0.05);
          margin-top: 4px;
        }
        .bottom-note { font-size: 12px; color: rgba(255,255,255,0.3); flex: 1; padding-right: 16px; }
        .bottom-lbl  {
          font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
          color: rgba(255,255,255,0.28); text-align: right; margin-bottom: 3px;
        }
        .bottom-val  { font-size: 26px; font-weight: 800; text-align: right; }
      </style>
      <div class="card" id="root"></div>
    `;

    const root = sh.getElementById('root');

    if (this._loading) { root.innerHTML = `<div class="loading"><div class="spinner"></div>Loading…</div>`; return; }
    if (this._error)   { root.innerHTML = `<div class="error">${this._error}</div>`; return; }

    const w        = this._week;
    const sc       = styleColor(w.style);
    const sl       = styleLabel(w.style);
    const balColor = w.balance_left > 500 ? '#00D4A8' : w.balance_left > 0 ? '#F97316' : '#EF4444';

    const billRows = (w.bills||[]).map(b => `
      <div class="bill-row">
        <div>
          <div class="bill-name">${b.name}</div>
          ${b.note ? `<div class="bill-note">${b.note}</div>` : ''}
        </div>
        <div class="bill-tags">${(b.tags||[]).map(tagBadge).join('')}</div>
        <div class="bill-amt">-${fmt(b.amount)}</div>
      </div>
    `).join('') || `<div style="font-size:13px;color:rgba(255,255,255,0.3);padding:10px 0">No bills this week 🎉</div>`;

    root.innerHTML = `
      <div class="banner" style="border-top:3px solid ${sc}">
        <div class="banner-left">
          <div class="banner-eyebrow">Current Pay Week · ${w.month_name} ${w.year}</div>
          <div class="banner-title">${w.label}</div>
          <div class="banner-date">${w.day} · ${w.date}</div>
        </div>
        <span class="badge" style="background:${sc}22;color:${sc}">${sl}</span>
      </div>

      <div class="stats-row">
        ${w.income.mike != null ? `
          <div class="stat-cell">
            <div class="stat-lbl">Mike</div>
            <div class="stat-val" style="color:#00D4A8">${fmt(w.income.mike)}</div>
          </div>` : ''}
        ${w.income.heather != null ? `
          <div class="stat-cell">
            <div class="stat-lbl">Heather</div>
            <div class="stat-val" style="color:#A855F7">${fmt(w.income.heather)}</div>
          </div>` : ''}
        <div class="stat-cell">
          <div class="stat-lbl">Total In</div>
          <div class="stat-val" style="color:#4FC3F7">${fmt(w.income.total)}</div>
        </div>
        <div class="stat-cell">
          <div class="stat-lbl">Bills Out</div>
          <div class="stat-val" style="color:#F87171">${fmt(w.bills_total)}</div>
        </div>
      </div>

      <div class="bills-section">
        <div class="bills-title">Bills This Week</div>
        ${billRows}
      </div>

      <div class="bottom">
        <div class="bottom-note">${w.note || ''}</div>
        <div>
          <div class="bottom-lbl">Left Over</div>
          <div class="bottom-val" style="color:${balColor}">${fmt(w.balance_left)}</div>
        </div>
      </div>
    `;
  }

  getCardSize() { return 5; }
  static getStubConfig() { return {}; }
}

// ─── Register ─────────────────────────────────────────────────────────────────

customElements.define('hades-budget-card',      HadesBudgetCard);
customElements.define('hades-budget-week-card', HadesBudgetWeekCard);

window.customCards = window.customCards || [];
window.customCards.push(
  { type: 'hades-budget-card',      name: 'Hades Budget — Monthly View',  description: 'Monthly bills with week grid and summary footer' },
  { type: 'hades-budget-week-card', name: 'Hades Budget — Current Week',  description: 'Compact current pay week bill list' }
);
