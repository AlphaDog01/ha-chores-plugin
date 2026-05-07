/**
 * hades-budget-card.js
 * Custom Lovelace cards for the Hades Budget API
 *
 * Cards:
 *   - custom:hades-budget-card       — full monthly view with tabs + week grid + footer
 *   - custom:hades-budget-week-card  — compact current week card
 *
 * Register in your dashboard resources as:
 *   /local/hades-budget-card.js?v=2
 */

const BUDGET_API   = 'http://10.72.16.57:33191';
const BUDGET_TOKEN = '7SFbRMVLbxByL85pv55eahRYqkxoTVKNVxVM4QXw3s';
const HEADERS      = { 'Authorization': `Bearer ${BUDGET_TOKEN}` };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function styleColor(s) {
  return { strong: '#22C55E', tight: '#F97316', zero: '#EF4444', 'rent-week': '#A855F7' }[s] || '#94A3B8';
}

function styleLabel(s) {
  return { strong: 'Healthy', tight: 'Tight', zero: 'Zero Out', 'rent-week': 'Rent Week' }[s] || s;
}

function tagBadge(tag) {
  const map = {
    ach:     { label: 'ACH',     bg: '#1e3a5f', color: '#4FC3F7' },
    early:   { label: 'Early',   bg: '#1a2e1a', color: '#4CAF50' },
    split:   { label: 'Split',   bg: '#2a1f00', color: '#FFC107' },
    locked:  { label: 'Locked',  bg: '#2a0000', color: '#EF4444' },
    onemain: { label: 'OneMain', bg: '#1e1a2e', color: '#A855F7' },
    rent:    { label: 'Rent',    bg: '#2d1a4a', color: '#C084FC' },
  };
  const t = map[tag];
  if (!t) return '';
  return `<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:${t.bg};color:${t.color};font-weight:600;letter-spacing:0.3px;white-space:nowrap">${t.label}</span>`;
}

function donut(pct, color) {
  const r = 28, cx = 34, cy = 34, stroke = 6;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return `<svg width="68" height="68" viewBox="0 0 68 68">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="${stroke}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${circ * 0.25}"
      stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy+1}" text-anchor="middle" dominant-baseline="middle"
      fill="${color}" font-size="13" font-weight="700" font-family="DM Sans,sans-serif">${Math.round(pct)}%</text>
  </svg>`;
}

const BASE_CSS = `
  :host { display: block; font-family: 'DM Sans','Segoe UI',sans-serif; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .card {
    background: #0B1120;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 20px;
    overflow: hidden;
    color: #E2E8F0;
  }
  .loading, .error {
    padding: 40px;
    text-align: center;
    color: rgba(255,255,255,0.35);
    font-size: 14px;
  }
  .error { color: #EF4444; }
  .spinner {
    width: 28px; height: 28px;
    border: 3px solid rgba(255,255,255,0.08);
    border-top-color: #4FC3F7;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    margin: 0 auto 12px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

// ══════════════════════════════════════════════════════════════════════════════
// CARD 1 — hades-budget-card  (full monthly view)
// ══════════════════════════════════════════════════════════════════════════════

class HadesBudgetCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._months    = [];
    this._activeId  = null;
    this._monthData = null;
    this._loading   = true;
    this._error     = null;
    this._initialized = false;
  }

  setConfig(config) { this._config = config; }

  set hass(hass) {
    if (!this._initialized) {
      this._initialized = true;
      this._render();
      this._loadMonths();
    }
  }

  async _loadMonths() {
    try {
      const res  = await fetch(`${BUDGET_API}/api/v1/months`, { headers: HEADERS });
      const json = await res.json();
      this._months = json.months || [];
      if (this._months.length) {
        this._activeId = this._months[0].id;
        await this._loadMonth(this._activeId);
      } else {
        this._loading = false; this._render();
      }
    } catch (e) {
      this._error = 'Failed to load budget data';
      this._loading = false; this._render();
    }
  }

  async _loadMonth(id) {
    this._loading = true; this._render();
    try {
      const res = await fetch(`${BUDGET_API}/api/v1/month/${id}`, { headers: HEADERS });
      this._monthData = await res.json();
      this._loading = false; this._render();
    } catch (e) {
      this._error = 'Failed to load month';
      this._loading = false; this._render();
    }
  }

  _render() {
    const shadow = this.shadowRoot;

    shadow.innerHTML = `
      <style>
        ${BASE_CSS}

        .tabs {
          display: flex;
          background: #0d1627;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .tab {
          flex: 1; padding: 14px 0;
          text-align: center;
          font-size: 12px; font-weight: 700;
          letter-spacing: 1px; text-transform: uppercase;
          color: rgba(255,255,255,0.35);
          background: transparent; border: none;
          cursor: pointer; position: relative;
          transition: color 0.2s;
        }
        .tab:hover { color: rgba(255,255,255,0.6); }
        .tab.active { color: #4FC3F7; }
        .tab.active::after {
          content: '';
          position: absolute; bottom: 0; left: 20%; right: 20%;
          height: 2px; background: #4FC3F7; border-radius: 2px 2px 0 0;
        }

        .month-bar {
          padding: 14px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 8px;
        }
        .month-bar-left { display: flex; gap: 32px; }
        .mstat-label {
          font-size: 10px; text-transform: uppercase;
          letter-spacing: 1px; color: rgba(255,255,255,0.35); margin-bottom: 3px;
        }
        .mstat-value { font-size: 22px; font-weight: 700; }
        .mstat-sub { font-size: 11px; color: rgba(255,255,255,0.3); margin-top: 1px; }
        .month-sub-text {
          font-size: 12px; color: rgba(255,255,255,0.3);
          align-self: flex-end; padding-bottom: 2px; max-width: 55%;
        }

        .week-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
          gap: 14px;
          padding: 16px;
        }

        .week-card {
          background: #0f1929;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          overflow: hidden;
          display: flex; flex-direction: column;
        }

        .wc-header {
          padding: 12px 14px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          display: flex; align-items: flex-start; justify-content: space-between;
        }
        .wc-label { font-size: 13px; font-weight: 700; color: #E2E8F0; }
        .wc-date  { font-size: 11px; color: rgba(255,255,255,0.35); margin-top: 3px; }
        .wc-badge {
          font-size: 10px; font-weight: 700;
          padding: 3px 10px; border-radius: 20px;
          letter-spacing: 0.5px; white-space: nowrap; margin-top: 2px;
        }

        .wc-stats {
          display: grid; grid-template-columns: repeat(3, 1fr);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .wc-stat {
          padding: 9px 12px;
          border-right: 1px solid rgba(255,255,255,0.04);
        }
        .wc-stat:last-child { border-right: none; }
        .wc-stat-label {
          font-size: 9px; text-transform: uppercase;
          letter-spacing: 0.8px; color: rgba(255,255,255,0.3); margin-bottom: 3px;
        }
        .wc-stat-value { font-size: 15px; font-weight: 700; }

        .wc-bills { padding: 8px 14px; flex: 1; }
        .bill-row {
          display: flex; align-items: center;
          justify-content: space-between;
          padding: 6px 0;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          gap: 6px;
        }
        .bill-row:last-child { border-bottom: none; }
        .bill-left { flex: 1; min-width: 0; }
        .bill-name { font-size: 12px; color: #CBD5E1; }
        .bill-note { font-size: 10px; color: rgba(255,255,255,0.28); margin-top: 1px; }
        .bill-tags { display: flex; gap: 3px; flex-wrap: wrap; justify-content: flex-end; }
        .bill-amount {
          font-size: 13px; font-weight: 700;
          color: #F87171; white-space: nowrap;
          min-width: 56px; text-align: right;
        }

        .wc-note {
          padding: 8px 14px;
          font-size: 11px; color: rgba(255,255,255,0.3);
          border-top: 1px solid rgba(255,255,255,0.04);
          line-height: 1.4;
        }

        .month-footer {
          margin: 0 16px 16px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.07);
          background: #0a1628;
          overflow: hidden;
        }
        .footer-title {
          padding: 10px 16px;
          font-size: 10px; font-weight: 700;
          letter-spacing: 1.5px; text-transform: uppercase;
          color: rgba(255,255,255,0.25);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          display: flex; align-items: center; justify-content: space-between;
        }
        .footer-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
        }
        .f-stat {
          padding: 14px 16px;
          border-right: 1px solid rgba(255,255,255,0.05);
        }
        .f-stat:last-child { border-right: none; }
        .f-label {
          font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.8px; color: rgba(255,255,255,0.3); margin-bottom: 5px;
        }
        .f-value { font-size: 20px; font-weight: 700; }
        .f-sub { font-size: 11px; color: rgba(255,255,255,0.28); margin-top: 3px; }

        .footer-bottom {
          display: flex; align-items: center; gap: 16px;
          padding: 12px 16px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        .fb-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.3); }
        .fb-value { font-size: 15px; font-weight: 700; margin-top: 2px; }
        .fb-note  { font-size: 11px; color: rgba(255,255,255,0.28); margin-top: 2px; }

        .body {
          max-height: 78vh;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.12) transparent;
        }
      </style>
      <div class="card" id="root"></div>
    `;

    const root = shadow.getElementById('root');

    root.innerHTML = `
      <div class="tabs">
        ${this._months.map(m => `
          <button class="tab ${m.id === this._activeId ? 'active' : ''}" data-id="${m.id}">
            ${m.name} ${m.year}
          </button>`).join('')}
      </div>
      <div class="body" id="body"></div>
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

    if (this._loading) {
      body.innerHTML = `<div class="loading"><div class="spinner"></div>Loading…</div>`;
      return;
    }
    if (this._error) {
      body.innerHTML = `<div class="error">${this._error}</div>`;
      return;
    }

    const d = this._monthData;
    if (!d) { body.innerHTML = `<div class="loading">No data</div>`; return; }

    const mikeTot    = (d.weeks || []).reduce((s, w) => s + (w.income?.mike    || 0), 0);
    const heatherTot = (d.weeks || []).reduce((s, w) => s + (w.income?.heather || 0), 0);
    const activeMeta = this._months.find(m => m.id === this._activeId) || {};

    let html = `
      <div class="month-bar">
        <div class="month-bar-left">
          <div class="mstat">
            <div class="mstat-label">Total Income</div>
            <div class="mstat-value" style="color:#4FC3F7">${fmt(d.total_income)}</div>
          </div>
          <div class="mstat">
            <div class="mstat-label">Mike</div>
            <div class="mstat-value" style="color:#22C55E">${fmt(mikeTot)}</div>
            <div class="mstat-sub">${(d.weeks || []).filter(w => w.income?.mike).length}× paycheck</div>
          </div>
          <div class="mstat">
            <div class="mstat-label">Heather</div>
            <div class="mstat-value" style="color:#A855F7">${fmt(heatherTot)}</div>
            <div class="mstat-sub">${activeMeta.heather_dates || ''}</div>
          </div>
        </div>
        <div class="month-sub-text">${activeMeta.sub || ''}</div>
      </div>
      <div class="week-grid">
    `;

    (d.weeks || []).forEach(week => {
      const sc       = styleColor(week.style);
      const sl       = styleLabel(week.style);
      const balColor = week.balance_left > 500 ? '#22C55E' : week.balance_left > 0 ? '#F97316' : '#EF4444';

      const billRows = (week.bills || []).map(b => `
        <div class="bill-row">
          <div class="bill-left">
            <div class="bill-name">${b.name}</div>
            ${b.note ? `<div class="bill-note">${b.note}</div>` : ''}
          </div>
          <div class="bill-tags">${(b.tags || []).map(tagBadge).join('')}</div>
          <div class="bill-amount">-${fmt(b.amount)}</div>
        </div>
      `).join('') || `<div style="font-size:12px;color:rgba(255,255,255,0.25);padding:6px 0">No bills 🎉</div>`;

      html += `
        <div class="week-card">
          <div class="wc-header">
            <div>
              <div class="wc-label">${week.label}</div>
              <div class="wc-date">${week.day} · ${week.date}</div>
            </div>
            <span class="wc-badge" style="background:${sc}22;color:${sc}">${sl}</span>
          </div>
          <div class="wc-stats">
            <div class="wc-stat">
              <div class="wc-stat-label">Income</div>
              <div class="wc-stat-value" style="color:#4CAF50">${fmt(week.income?.total)}</div>
            </div>
            <div class="wc-stat">
              <div class="wc-stat-label">↑ Bills</div>
              <div class="wc-stat-value" style="color:#F87171">${fmt(week.bills_total)}</div>
            </div>
            <div class="wc-stat">
              <div class="wc-stat-label">Left Over</div>
              <div class="wc-stat-value" style="color:${balColor}">${fmt(week.balance_left)}</div>
            </div>
          </div>
          <div class="wc-bills">${billRows}</div>
          ${week.note ? `<div class="wc-note">${week.note}</div>` : ''}
        </div>
      `;
    });

    html += `</div>`; // end week-grid

    const surplus   = d.surplus || 0;
    const surpColor = surplus > 1000 ? '#22C55E' : surplus > 0 ? '#F97316' : '#EF4444';
    const leftPct   = d.total_income > 0 ? (surplus / d.total_income) * 100 : 0;
    const billsPct  = d.total_income > 0 ? (d.total_bills / d.total_income) * 100 : 0;
    const wkAvg     = d.week_count ? Math.round(surplus / d.week_count) : 0;
    const wkAvgCol  = wkAvg > 200 ? '#22C55E' : wkAvg > 0 ? '#F97316' : '#EF4444';

    html += `
      <div class="month-footer">
        <div class="footer-title">
          <span>Month Summary — ${d.name} ${d.year}</span>
          <span style="color:rgba(255,255,255,0.2)">${d.week_count} pay weeks</span>
        </div>
        <div class="footer-grid">
          <div class="f-stat">
            <div class="f-label">Total Income</div>
            <div class="f-value" style="color:#4FC3F7">${fmt(d.total_income)}</div>
            <div class="f-sub">${d.income_breakdown || ''}</div>
          </div>
          <div class="f-stat">
            <div class="f-label">Total Bills</div>
            <div class="f-value" style="color:#F87171">${fmt(d.total_bills)}</div>
            <div class="f-sub">${Math.round(billsPct)}% of income</div>
          </div>
          <div class="f-stat">
            <div class="f-label">Monthly Surplus</div>
            <div class="f-value" style="color:${surpColor}">${fmt(surplus)}</div>
            <div class="f-sub">remaining after bills</div>
          </div>
          <div class="f-stat">
            <div class="f-label">Avg Weekly Flow</div>
            <div class="f-value" style="color:${wkAvgCol}">${fmt(wkAvg)}</div>
            <div class="f-sub">per week average</div>
          </div>
        </div>
        <div class="footer-bottom">
          ${donut(leftPct, surpColor)}
          <div>
            <div class="fb-label">Left Over</div>
            <div class="fb-value" style="color:${surpColor}">${Math.round(leftPct)}% of income remaining</div>
            <div class="fb-note">${d.footer_note || ''}</div>
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
// CARD 2 — hades-budget-week-card  (compact current week)
// ══════════════════════════════════════════════════════════════════════════════

class HadesBudgetWeekCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._week = null;
    this._loading = true;
    this._error   = null;
    this._initialized = false;
  }

  setConfig(config) { this._config = config; }

  set hass(hass) {
    if (!this._initialized) {
      this._initialized = true;
      this._render();
      this._loadWeek();
    }
  }

  async _loadWeek() {
    try {
      const res  = await fetch(`${BUDGET_API}/api/v1/week/current`, { headers: HEADERS });
      this._week = await res.json();
      this._loading = false; this._render();
    } catch (e) {
      this._error = 'Failed to load week data';
      this._loading = false; this._render();
    }
  }

  _render() {
    const shadow = this.shadowRoot;
    shadow.innerHTML = `
      <style>
        ${BASE_CSS}
        .card { padding: 0; }
        .banner {
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          display: flex; align-items: center; justify-content: space-between;
        }
        .banner-eyebrow {
          font-size: 10px; font-weight: 700; letter-spacing: 2px;
          text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 4px;
        }
        .banner-title { font-size: 17px; font-weight: 700; color: #E2E8F0; }
        .banner-date  { font-size: 12px; color: rgba(255,255,255,0.35); margin-top: 3px; }
        .badge {
          font-size: 11px; font-weight: 700;
          padding: 4px 12px; border-radius: 20px; letter-spacing: 0.5px;
        }
        .stats-row {
          display: grid; grid-template-columns: repeat(4, 1fr);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .stat-cell {
          padding: 10px 14px;
          border-right: 1px solid rgba(255,255,255,0.05);
        }
        .stat-cell:last-child { border-right: none; }
        .stat-label {
          font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.8px; color: rgba(255,255,255,0.3); margin-bottom: 3px;
        }
        .stat-value { font-size: 17px; font-weight: 700; }
        .bills-wrap { padding: 8px 16px 4px; }
        .bills-title {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 1px; color: rgba(255,255,255,0.28); padding: 6px 0 4px;
        }
        .bill-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.04); gap: 6px;
        }
        .bill-row:last-child { border-bottom: none; }
        .bill-name { font-size: 13px; color: #CBD5E1; }
        .bill-note { font-size: 11px; color: rgba(255,255,255,0.28); margin-top: 1px; }
        .bill-tags { display: flex; gap: 3px; flex-wrap: wrap; justify-content: flex-end; }
        .bill-amount {
          font-size: 14px; font-weight: 700;
          color: #F87171; white-space: nowrap; min-width: 60px; text-align: right;
        }
        .bottom-bar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 11px 16px;
          background: rgba(255,255,255,0.03);
          border-top: 1px solid rgba(255,255,255,0.06);
          margin-top: 4px;
        }
        .bottom-note { font-size: 12px; color: rgba(255,255,255,0.3); flex: 1; padding-right: 12px; }
        .bottom-bal-label {
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
          color: rgba(255,255,255,0.28); text-align: right; margin-bottom: 2px;
        }
        .bottom-bal { font-size: 22px; font-weight: 700; text-align: right; }
      </style>
      <div class="card" id="root"></div>
    `;

    const root = shadow.getElementById('root');

    if (this._loading) {
      root.innerHTML = `<div class="loading"><div class="spinner"></div>Loading…</div>`;
      return;
    }
    if (this._error) {
      root.innerHTML = `<div class="error">${this._error}</div>`;
      return;
    }

    const w        = this._week;
    const sc       = styleColor(w.style);
    const sl       = styleLabel(w.style);
    const balColor = w.balance_left > 500 ? '#22C55E' : w.balance_left > 0 ? '#F97316' : '#EF4444';

    const billRows = (w.bills || []).map(b => `
      <div class="bill-row">
        <div>
          <div class="bill-name">${b.name}</div>
          ${b.note ? `<div class="bill-note">${b.note}</div>` : ''}
        </div>
        <div class="bill-tags">${(b.tags || []).map(tagBadge).join('')}</div>
        <div class="bill-amount">-${fmt(b.amount)}</div>
      </div>
    `).join('') || `<div style="font-size:13px;color:rgba(255,255,255,0.3);padding:8px 0">No bills this week 🎉</div>`;

    root.innerHTML = `
      <div class="banner">
        <div>
          <div class="banner-eyebrow">Current Pay Week · ${w.month_name} ${w.year}</div>
          <div class="banner-title">${w.label}</div>
          <div class="banner-date">${w.day} · ${w.date}</div>
        </div>
        <span class="badge" style="background:${sc}22;color:${sc}">${sl}</span>
      </div>
      <div class="stats-row">
        ${w.income.mike != null ? `
          <div class="stat-cell">
            <div class="stat-label">Mike</div>
            <div class="stat-value" style="color:#22C55E">${fmt(w.income.mike)}</div>
          </div>` : ''}
        ${w.income.heather != null ? `
          <div class="stat-cell">
            <div class="stat-label">Heather</div>
            <div class="stat-value" style="color:#A855F7">${fmt(w.income.heather)}</div>
          </div>` : ''}
        <div class="stat-cell">
          <div class="stat-label">Total In</div>
          <div class="stat-value" style="color:#4FC3F7">${fmt(w.income.total)}</div>
        </div>
        <div class="stat-cell">
          <div class="stat-label">Bills Out</div>
          <div class="stat-value" style="color:#F87171">${fmt(w.bills_total)}</div>
        </div>
      </div>
      <div class="bills-wrap">
        <div class="bills-title">Bills This Week</div>
        ${billRows}
      </div>
      <div class="bottom-bar">
        <div class="bottom-note">${w.note || ''}</div>
        <div>
          <div class="bottom-bal-label">Left Over</div>
          <div class="bottom-bal" style="color:${balColor}">${fmt(w.balance_left)}</div>
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
