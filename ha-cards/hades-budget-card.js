/**
 * hades-budget-card.js
 * Custom Lovelace cards for the Hades Budget API
 *
 * Cards:
 *   - custom:hades-budget-card       — full monthly view with tabs + footer
 *   - custom:hades-budget-week-card  — compact current week card
 *
 * Register in your dashboard resources as:
 *   /local/hades-budget-card.js?v=1
 */

const BUDGET_API = 'http://10.72.16.57:33191';
const BUDGET_TOKEN = '7SFbRMVLbxByL85pv55eahRYqkxoTVKNVxVM4QXw3s';

const HEADERS = {
  'Authorization': `Bearer ${BUDGET_TOKEN}`,
  'Content-Type': 'application/json'
};

// ─── Shared helpers ────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function styleColor(style) {
  switch (style) {
    case 'strong':    return '#22C55E';
    case 'tight':     return '#F97316';
    case 'zero':      return '#EF4444';
    case 'rent-week': return '#A855F7';
    default:          return '#94A3B8';
  }
}

function styleLabel(style) {
  switch (style) {
    case 'strong':    return 'Healthy';
    case 'tight':     return 'Tight';
    case 'zero':      return 'Zero Out';
    case 'rent-week': return 'Rent Week';
    default:          return style;
  }
}

function tagBadge(tag) {
  const map = {
    ach:      { label: 'ACH',      bg: '#1e3a5f', color: '#4FC3F7' },
    early:    { label: 'Early',    bg: '#1a2e1a', color: '#4CAF50' },
    split:    { label: 'Split',    bg: '#2a1f00', color: '#FFC107' },
    locked:   { label: 'Locked',   bg: '#2a0000', color: '#EF4444' },
    onemain:  { label: 'OneMain',  bg: '#1e1a2e', color: '#A855F7' },
    rent:     { label: 'Rent',     bg: '#2d1a4a', color: '#C084FC' },
  };
  const t = map[tag];
  if (!t) return '';
  return `<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:${t.bg};color:${t.color};font-weight:600;letter-spacing:0.5px;white-space:nowrap">${t.label}</span>`;
}

const SHARED_CSS = `
  :host { display: block; font-family: 'DM Sans', 'Segoe UI', sans-serif; }
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .card {
    background: #0B1120;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 20px;
    overflow: hidden;
    color: #E2E8F0;
  }

  .loading, .error {
    padding: 32px;
    text-align: center;
    color: rgba(255,255,255,0.4);
    font-size: 14px;
  }
  .error { color: #EF4444; }

  /* Spinner */
  .spinner {
    width: 28px; height: 28px;
    border: 3px solid rgba(255,255,255,0.1);
    border-top-color: #4FC3F7;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    margin: 0 auto 12px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

// ══════════════════════════════════════════════════════════════════════════════
// CARD 1 — hades-budget-card (full monthly view)
// ══════════════════════════════════════════════════════════════════════════════

class HadesBudgetCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._months = [];
    this._activeMonth = null;
    this._monthData = null;
    this._loading = true;
    this._error = null;
  }

  setConfig(config) {
    this._config = config;
  }

  set hass(hass) {
    if (!this._initialized) {
      this._initialized = true;
      this._render();
      this._loadMonths();
    }
  }

  async _loadMonths() {
    try {
      const res = await fetch(`${BUDGET_API}/api/v1/months`, { headers: HEADERS });
      const json = await res.json();
      this._months = json.months || [];
      if (this._months.length > 0) {
        this._activeMonth = this._months[0].id;
        await this._loadMonth(this._activeMonth);
      } else {
        this._loading = false;
        this._render();
      }
    } catch (e) {
      this._error = 'Failed to load budget data';
      this._loading = false;
      this._render();
    }
  }

  async _loadMonth(id) {
    this._loading = true;
    this._render();
    try {
      const res = await fetch(`${BUDGET_API}/api/v1/month/${id}`, { headers: HEADERS });
      this._monthData = await res.json();
      this._loading = false;
      this._render();
    } catch (e) {
      this._error = 'Failed to load month data';
      this._loading = false;
      this._render();
    }
  }

  _render() {
    const shadow = this.shadowRoot;
    shadow.innerHTML = `
      <style>
        ${SHARED_CSS}

        .tabs {
          display: flex;
          gap: 8px;
          padding: 16px 16px 0;
          background: #0B1120;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .tab {
          flex: 1;
          padding: 10px 0;
          text-align: center;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.5px;
          border-radius: 10px 10px 0 0;
          cursor: pointer;
          color: rgba(255,255,255,0.4);
          background: transparent;
          border: none;
          transition: all 0.2s;
          position: relative;
          text-transform: uppercase;
        }
        .tab:hover { color: rgba(255,255,255,0.7); }
        .tab.active {
          color: #4FC3F7;
          background: rgba(79,195,247,0.08);
        }
        .tab.active::after {
          content: '';
          position: absolute;
          bottom: 0; left: 16px; right: 16px;
          height: 2px;
          background: #4FC3F7;
          border-radius: 2px 2px 0 0;
        }

        .body {
          padding: 0 0 16px;
          max-height: 72vh;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.15) transparent;
        }

        /* Month header */
        .month-header {
          padding: 16px 16px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .month-sub {
          font-size: 12px;
          color: rgba(255,255,255,0.4);
          margin-top: 4px;
        }

        /* Week block */
        .week {
          margin: 12px 16px 0;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.07);
          background: #0f1929;
          overflow: hidden;
        }
        .week-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .week-label {
          font-size: 13px;
          font-weight: 700;
          color: #E2E8F0;
        }
        .week-date {
          font-size: 12px;
          color: rgba(255,255,255,0.4);
          margin-top: 2px;
        }
        .week-style-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 20px;
          letter-spacing: 0.5px;
        }

        /* Income row */
        .income-row {
          display: flex;
          gap: 8px;
          padding: 10px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .income-chip {
          flex: 1;
          background: rgba(255,255,255,0.04);
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 11px;
        }
        .income-chip-label {
          color: rgba(255,255,255,0.4);
          margin-bottom: 2px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-size: 10px;
        }
        .income-chip-value {
          font-weight: 700;
          font-size: 14px;
          color: #4CAF50;
        }

        /* Bills */
        .bills-list {
          padding: 8px 14px;
        }
        .bill-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 7px 0;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          gap: 8px;
        }
        .bill-row:last-child { border-bottom: none; }
        .bill-name {
          font-size: 13px;
          color: #CBD5E1;
          flex: 1;
          min-width: 0;
        }
        .bill-note {
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          margin-top: 1px;
        }
        .bill-tags {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .bill-amount {
          font-size: 14px;
          font-weight: 700;
          color: #F87171;
          white-space: nowrap;
          min-width: 64px;
          text-align: right;
        }

        /* Week footer */
        .week-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          background: rgba(255,255,255,0.03);
          border-top: 1px solid rgba(255,255,255,0.05);
          font-size: 12px;
        }
        .week-footer-note { color: rgba(255,255,255,0.4); flex: 1; padding-right: 8px; }
        .week-balance { font-weight: 700; font-size: 15px; }

        /* Footer summary */
        .footer {
          margin: 16px 16px 0;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.07);
          background: #0a1628;
          overflow: hidden;
        }
        .footer-title {
          padding: 12px 14px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .footer-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: rgba(255,255,255,0.05);
        }
        .footer-stat {
          background: #0a1628;
          padding: 12px 14px;
        }
        .footer-stat-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: rgba(255,255,255,0.35);
          margin-bottom: 4px;
        }
        .footer-stat-value {
          font-size: 18px;
          font-weight: 700;
        }
        .footer-stat-sub {
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          margin-top: 2px;
        }
      </style>
      <div class="card" id="root"></div>
    `;

    const root = shadow.getElementById('root');

    if (this._error) {
      root.innerHTML = `<div class="error">${this._error}</div>`;
      return;
    }

    // Tabs
    const tabsHtml = `
      <div class="tabs">
        ${this._months.map(m => `
          <button class="tab ${m.id === this._activeMonth ? 'active' : ''}" data-id="${m.id}">
            ${m.name} ${m.year}
          </button>
        `).join('')}
      </div>
    `;

    root.innerHTML = tabsHtml + `<div class="body" id="body-content"></div>`;

    // Tab click handlers
    root.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (id !== this._activeMonth) {
          this._activeMonth = id;
          this._loadMonth(id);
        }
      });
    });

    const body = root.querySelector('#body-content');

    if (this._loading) {
      body.innerHTML = `<div class="loading"><div class="spinner"></div>Loading...</div>`;
      return;
    }

    if (!this._monthData) {
      body.innerHTML = `<div class="loading">No data</div>`;
      return;
    }

    const d = this._monthData;

    // Month header
    let html = `
      <div class="month-header">
        <div class="month-sub">${this._months.find(m => m.id === this._activeMonth)?.sub || ''}</div>
      </div>
    `;

    // Weeks
    (d.weeks || []).forEach(week => {
      const sc = styleColor(week.style);
      const sl = styleLabel(week.style);
      const balColor = week.balance_left > 500 ? '#22C55E' : week.balance_left > 0 ? '#F97316' : '#EF4444';

      const incomeChips = `
        <div class="income-row">
          ${week.income.mike != null ? `
            <div class="income-chip">
              <div class="income-chip-label">Mike</div>
              <div class="income-chip-value">${fmt(week.income.mike)}</div>
            </div>` : ''}
          ${week.income.heather != null ? `
            <div class="income-chip">
              <div class="income-chip-label">Heather</div>
              <div class="income-chip-value">${fmt(week.income.heather)}</div>
            </div>` : ''}
          <div class="income-chip">
            <div class="income-chip-label">Total In</div>
            <div class="income-chip-value">${fmt(week.income.total)}</div>
          </div>
        </div>
      `;

      const billRows = (week.bills || []).map(bill => `
        <div class="bill-row">
          <div>
            <div class="bill-name">${bill.name}</div>
            ${bill.note ? `<div class="bill-note">${bill.note}</div>` : ''}
          </div>
          <div class="bill-tags">${(bill.tags || []).map(tagBadge).join('')}</div>
          <div class="bill-amount">-${fmt(bill.amount)}</div>
        </div>
      `).join('');

      html += `
        <div class="week">
          <div class="week-header">
            <div>
              <div class="week-label">${week.label}</div>
              <div class="week-date">${week.day} · ${week.date}</div>
            </div>
            <span class="week-style-badge" style="background:${sc}22;color:${sc}">${sl}</span>
          </div>
          ${incomeChips}
          <div class="bills-list">${billRows || '<div style="font-size:13px;color:rgba(255,255,255,0.3);padding:8px 0">No bills this week</div>'}</div>
          <div class="week-footer">
            <div class="week-footer-note">${week.note || ''}</div>
            <div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:rgba(255,255,255,0.3);text-align:right">Left over</div>
              <div class="week-balance" style="color:${balColor}">${fmt(week.balance_left)}</div>
            </div>
          </div>
        </div>
      `;
    });

    // Footer summary
    const surplus = d.surplus || 0;
    const surplusColor = surplus > 1000 ? '#22C55E' : surplus > 0 ? '#F97316' : '#EF4444';
    const weeklyFlow = d.week_count ? Math.round(surplus / d.week_count) : 0;
    const wfColor = weeklyFlow > 200 ? '#22C55E' : weeklyFlow > 0 ? '#F97316' : '#EF4444';

    html += `
      <div class="footer">
        <div class="footer-title">Month Summary · ${d.name} ${d.year}</div>
        <div class="footer-grid">
          <div class="footer-stat">
            <div class="footer-stat-label">Total Income</div>
            <div class="footer-stat-value" style="color:#4FC3F7">${fmt(d.total_income)}</div>
          </div>
          <div class="footer-stat">
            <div class="footer-stat-label">Mike's Income</div>
            <div class="footer-stat-value" style="color:#22C55E">${fmt(
              (d.weeks || []).reduce((s, w) => s + (w.income?.mike || 0), 0)
            )}</div>
          </div>
          <div class="footer-stat">
            <div class="footer-stat-label">Heather's Income</div>
            <div class="footer-stat-value" style="color:#A855F7">${fmt(
              (d.weeks || []).reduce((s, w) => s + (w.income?.heather || 0), 0)
            )}</div>
          </div>
          <div class="footer-stat">
            <div class="footer-stat-label">Total Bills</div>
            <div class="footer-stat-value" style="color:#F87171">${fmt(d.total_bills)}</div>
          </div>
          <div class="footer-stat">
            <div class="footer-stat-label">Monthly Surplus</div>
            <div class="footer-stat-value" style="color:${surplusColor}">${fmt(surplus)}</div>
            <div class="footer-stat-sub">${d.week_count} pay weeks</div>
          </div>
          <div class="footer-stat">
            <div class="footer-stat-label">Avg Weekly Flow</div>
            <div class="footer-stat-value" style="color:${wfColor}">${fmt(weeklyFlow)}</div>
            <div class="footer-stat-sub">per week avg</div>
          </div>
        </div>
      </div>
    `;

    body.innerHTML = html;
  }

  getCardSize() { return 8; }

  static getConfigElement() {
    return document.createElement('hades-budget-card-editor');
  }

  static getStubConfig() {
    return {};
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD 2 — hades-budget-week-card (compact current week)
// ══════════════════════════════════════════════════════════════════════════════

class HadesBudgetWeekCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._week = null;
    this._loading = true;
    this._error = null;
  }

  setConfig(config) {
    this._config = config;
  }

  set hass(hass) {
    if (!this._initialized) {
      this._initialized = true;
      this._render();
      this._loadWeek();
    }
  }

  async _loadWeek() {
    try {
      const res = await fetch(`${BUDGET_API}/api/v1/week/current`, { headers: HEADERS });
      this._week = await res.json();
      this._loading = false;
      this._render();
    } catch (e) {
      this._error = 'Failed to load week data';
      this._loading = false;
      this._render();
    }
  }

  _render() {
    const shadow = this.shadowRoot;
    shadow.innerHTML = `
      <style>
        ${SHARED_CSS}

        .card { padding: 0; }

        .week-banner {
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .banner-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          margin-bottom: 4px;
        }
        .banner-week {
          font-size: 18px;
          font-weight: 700;
          color: #E2E8F0;
        }
        .banner-date {
          font-size: 12px;
          color: rgba(255,255,255,0.4);
          margin-top: 2px;
        }
        .style-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 4px 12px;
          border-radius: 20px;
          letter-spacing: 0.5px;
        }

        .income-strip {
          display: flex;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .income-cell {
          flex: 1;
          padding: 10px 14px;
          border-right: 1px solid rgba(255,255,255,0.05);
        }
        .income-cell:last-child { border-right: none; }
        .income-cell-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: rgba(255,255,255,0.35);
          margin-bottom: 3px;
        }
        .income-cell-value {
          font-size: 16px;
          font-weight: 700;
          color: #4CAF50;
        }

        .bills-section {
          padding: 8px 16px 4px;
        }
        .bills-section-title {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: rgba(255,255,255,0.3);
          padding: 6px 0;
          font-weight: 700;
        }
        .bill-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          gap: 8px;
        }
        .bill-row:last-child { border-bottom: none; }
        .bill-name {
          font-size: 13px;
          color: #CBD5E1;
          flex: 1;
        }
        .bill-note {
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          margin-top: 1px;
        }
        .bill-tags {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .bill-amount {
          font-size: 14px;
          font-weight: 700;
          color: #F87171;
          white-space: nowrap;
          text-align: right;
          min-width: 64px;
        }

        .week-bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: rgba(255,255,255,0.03);
          border-top: 1px solid rgba(255,255,255,0.06);
          margin-top: 4px;
        }
        .bottom-note {
          font-size: 12px;
          color: rgba(255,255,255,0.35);
          flex: 1;
          padding-right: 8px;
        }
        .bottom-balance-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: rgba(255,255,255,0.3);
          text-align: right;
          margin-bottom: 2px;
        }
        .bottom-balance {
          font-size: 22px;
          font-weight: 700;
          text-align: right;
        }
      </style>
      <div class="card" id="root"></div>
    `;

    const root = shadow.getElementById('root');

    if (this._loading) {
      root.innerHTML = `<div class="loading"><div class="spinner"></div>Loading...</div>`;
      return;
    }

    if (this._error) {
      root.innerHTML = `<div class="error">${this._error}</div>`;
      return;
    }

    const w = this._week;
    const sc = styleColor(w.style);
    const sl = styleLabel(w.style);
    const balColor = w.balance_left > 500 ? '#22C55E' : w.balance_left > 0 ? '#F97316' : '#EF4444';

    const billRows = (w.bills || []).map(bill => `
      <div class="bill-row">
        <div>
          <div class="bill-name">${bill.name}</div>
          ${bill.note ? `<div class="bill-note">${bill.note}</div>` : ''}
        </div>
        <div class="bill-tags">${(bill.tags || []).map(tagBadge).join('')}</div>
        <div class="bill-amount">-${fmt(bill.amount)}</div>
      </div>
    `).join('');

    root.innerHTML = `
      <div class="week-banner">
        <div>
          <div class="banner-label">Current Pay Week · ${w.month_name} ${w.year}</div>
          <div class="banner-week">${w.label}</div>
          <div class="banner-date">${w.day} · ${w.date}</div>
        </div>
        <span class="style-badge" style="background:${sc}22;color:${sc}">${sl}</span>
      </div>

      <div class="income-strip">
        ${w.income.mike != null ? `
          <div class="income-cell">
            <div class="income-cell-label">Mike</div>
            <div class="income-cell-value">${fmt(w.income.mike)}</div>
          </div>` : ''}
        ${w.income.heather != null ? `
          <div class="income-cell">
            <div class="income-cell-label">Heather</div>
            <div class="income-cell-value">${fmt(w.income.heather)}</div>
          </div>` : ''}
        <div class="income-cell">
          <div class="income-cell-label">Total In</div>
          <div class="income-cell-value">${fmt(w.income.total)}</div>
        </div>
        <div class="income-cell">
          <div class="income-cell-label">Bills Out</div>
          <div class="income-cell-value" style="color:#F87171">${fmt(w.bills_total)}</div>
        </div>
      </div>

      <div class="bills-section">
        <div class="bills-section-title">Bills This Week</div>
        ${billRows || '<div style="font-size:13px;color:rgba(255,255,255,0.3);padding:8px 0">No bills this week</div>'}
      </div>

      <div class="week-bottom">
        <div class="bottom-note">${w.note || ''}</div>
        <div>
          <div class="bottom-balance-label">Left Over</div>
          <div class="bottom-balance" style="color:${balColor}">${fmt(w.balance_left)}</div>
        </div>
      </div>
    `;
  }

  getCardSize() { return 5; }

  static getConfigElement() {
    return document.createElement('hades-budget-week-card-editor');
  }

  static getStubConfig() {
    return {};
  }
}

// ─── Register both cards ───────────────────────────────────────────────────────

customElements.define('hades-budget-card', HadesBudgetCard);
customElements.define('hades-budget-week-card', HadesBudgetWeekCard);

window.customCards = window.customCards || [];
window.customCards.push(
  {
    type: 'hades-budget-card',
    name: 'Hades Budget — Monthly View',
    description: 'Monthly bills breakdown with week panels and summary footer'
  },
  {
    type: 'hades-budget-week-card',
    name: 'Hades Budget — Current Week',
    description: 'Compact current pay week bill list'
  }
);
