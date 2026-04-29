/**
 * Hades Rewards Card
 * Displays available rewards with points cost and a redeem button.
 * Button is disabled if the person doesn't have enough points.
 * On redeem, calls hades_household.redeem_reward service and notifies parent.
 */

const REWARDS_ACCENT_COLORS = {
  blue:   { hex: "#3B82F6", bg: "#1e3a5f", disabled: "rgba(59,130,246,0.3)"   },
  orange: { hex: "#F97316", bg: "#3d1f00", disabled: "rgba(249,115,22,0.3)"   },
  pink:   { hex: "#EC4899", bg: "#3d0020", disabled: "rgba(236,72,153,0.3)"   },
  green:  { hex: "#22C55E", bg: "#0d2e1a", disabled: "rgba(34,197,94,0.3)"    },
  purple: { hex: "#A855F7", bg: "#2d1a4a", disabled: "rgba(168,85,247,0.3)"   },
  white:  { hex: "#E5E7EB", bg: "#1f2937", disabled: "rgba(229,231,235,0.2)"  },
};

const REWARDS_DEFAULT_SIZE = 14;

const REWARDS_STYLES = `
  :host { display: block; }

  .rewards-card {
    background: #111827;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px;
    padding: 16px;
    font-family: var(--primary-font-family, sans-serif);
    color: #fff;
    box-sizing: border-box;
  }

  .rewards-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .rewards-title {
    font-size: var(--r-title);
    font-weight: 700;
    color: #fff;
  }

  .points-badge {
    font-size: var(--r-sub);
    font-weight: 700;
    color: var(--accent-hex);
    background: var(--accent-bg);
    border-radius: 20px;
    padding: 4px 12px;
  }

  .reward-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    gap: 10px;
  }

  .reward-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .reward-icon {
    font-size: var(--r-title);
    flex-shrink: 0;
  }

  .reward-info { flex: 1; min-width: 0; }

  .reward-name {
    font-size: var(--r-sub);
    font-weight: 600;
    color: rgba(255,255,255,0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .reward-desc {
    font-size: calc(var(--r-sub) * 0.9);
    color: rgba(255,255,255,0.4);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .reward-cost {
    font-size: var(--r-sub);
    font-weight: 700;
    color: rgba(255,255,255,0.5);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .reward-cost.affordable {
    color: var(--accent-hex);
  }

  .redeem-btn {
    font-size: var(--r-sub);
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 20px;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.15s;
    white-space: nowrap;
  }

  .redeem-btn.can-afford {
    background: var(--accent-hex);
    color: #fff;
  }

  .redeem-btn.can-afford:hover {
    opacity: 0.85;
  }

  .redeem-btn.cannot-afford {
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.3);
    cursor: not-allowed;
  }

  .no-rewards {
    color: rgba(255,255,255,0.3);
    font-size: var(--r-sub);
    padding: 8px 0;
  }

  .confirming {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 0;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .confirm-text {
    font-size: var(--r-sub);
    color: rgba(255,255,255,0.85);
    flex: 1;
  }

  .confirm-yes {
    background: #22C55E;
    color: #fff;
    border: none;
    border-radius: 20px;
    padding: 6px 14px;
    font-size: var(--r-sub);
    font-weight: 700;
    cursor: pointer;
  }

  .confirm-no {
    background: rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.6);
    border: none;
    border-radius: 20px;
    padding: 6px 14px;
    font-size: var(--r-sub);
    font-weight: 700;
    cursor: pointer;
  }
`;

class HadesRewards extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config      = {};
    this._hass        = null;
    this._confirming  = null; // reward ID currently being confirmed
  }

  setConfig(config) {
    if (!config.person_entity) throw new Error("person_entity is required");
    if (!config.person_id)     throw new Error("person_id is required");
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() { return 3; }

  _accent() {
    return REWARDS_ACCENT_COLORS[this._config.accent || "blue"] || REWARDS_ACCENT_COLORS.blue;
  }

  _titleSize() { return parseFloat(this._config.title_size    ?? 18); }
  _subSize()   { return parseFloat(this._config.subtitle_size ?? REWARDS_DEFAULT_SIZE); }

  _personPoints() {
    const stateObj = this._hass?.states?.[this._config.person_entity];
    return parseInt(stateObj?.attributes?.points_total ?? 0);
  }

  _rewards() {
    // Pull rewards from the chores coordinator data via the leaderboard sensor attributes
    // We expose rewards on sensor.hades_household_hades_today_summary as an attribute
    // OR we can look it up from any chores sensor — they all share the coordinator
    const summaryId = "sensor.hades_household_hades_today_summary";
    const stateObj  = this._hass?.states?.[summaryId];
    return stateObj?.attributes?.rewards || [];
  }

  _render() {
    if (!this._hass || !this._config) return;

    const accent  = this._accent();
    const points  = this._personPoints();
    const rewards = this._rewards();
    const name    = this._config.display_name || `Person ${this._config.person_id}`;
    const cssVars = `--accent-hex:${accent.hex};--accent-bg:${accent.bg};--r-title:${this._titleSize()}px;--r-sub:${this._subSize()}px`;

    let rewardsHtml = "";

    if (!rewards.length) {
      rewardsHtml = `<div class="no-rewards">No rewards available</div>`;
    } else {
      rewards.forEach(r => {
        if (this._confirming === r.id) {
          rewardsHtml += `
            <div class="confirming">
              <div class="confirm-text">${r.icon || "🎁"} Redeem <strong>${r.name}</strong> for ${r.points_required} pts?</div>
              <button class="confirm-yes" data-reward-id="${r.id}" data-reward-name="${r.name}" data-action="confirm">Yes!</button>
              <button class="confirm-no" data-action="cancel">Cancel</button>
            </div>`;
        } else {
          const canAfford    = points >= r.points_required;
          const costClass    = canAfford ? "affordable" : "";
          const btnClass     = canAfford ? "can-afford" : "cannot-afford";
          rewardsHtml += `
            <div class="reward-row">
              <div class="reward-left">
                <span class="reward-icon">${r.icon || "🎁"}</span>
                <div class="reward-info">
                  <div class="reward-name">${r.name}</div>
                  ${r.description ? `<div class="reward-desc">${r.description}</div>` : ""}
                </div>
              </div>
              <span class="reward-cost ${costClass}">⭐ ${r.points_required}</span>
              <button class="redeem-btn ${btnClass}"
                      data-reward-id="${r.id}"
                      data-reward-name="${r.name}"
                      data-action="redeem"
                      ${canAfford ? "" : "disabled"}>
                Redeem
              </button>
            </div>`;
        }
      });
    }

    this.shadowRoot.innerHTML = `
      <style>${REWARDS_STYLES}</style>
      <div class="rewards-card" style="${cssVars}">
        <div class="rewards-header">
          <div class="rewards-title">🎁 Rewards</div>
          <div class="points-badge">⭐ ${points} pts</div>
        </div>
        ${rewardsHtml}
      </div>
    `;

    // ── Button listeners ──────────────────────────────────────────────────────
    this.shadowRoot.querySelectorAll("button[data-action]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const action     = btn.dataset.action;
        const rewardId   = parseInt(btn.dataset.rewardId);
        const rewardName = btn.dataset.rewardName || "";

        if (action === "redeem") {
          this._confirming = rewardId;
          this._render();
        } else if (action === "cancel") {
          this._confirming = null;
          this._render();
        } else if (action === "confirm") {
          this._confirming = null;
          this._redeemReward(rewardId, rewardName);
        }
      });
    });
  }

  async _redeemReward(rewardId, rewardName) {
    const personId   = this._config.person_id;
    const personName = this._config.display_name || `Person ${personId}`;

    try {
      await this._hass.callService("hades_household", "redeem_reward", {
        reward_id:   rewardId,
        person_id:   personId,
        person_name: personName,
        reward_name: rewardName,
      });
    } catch (err) {
      console.error("Hades Rewards: redeem failed", err);
    }
  }
}


// ── GUI Editor ────────────────────────────────────────────────────────────────

class HadesRewardsEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass   = null;
  }

  setConfig(config) { this._config = { ...config }; this._render(); }
  set hass(hass)    { this._hass = hass; this._render(); }

  _fire(config) {
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config }, bubbles: true, composed: true,
    }));
  }

  _rateEntities() {
    if (!this._hass) return [];
    return Object.keys(this._hass.states)
      .filter(id => id.includes("completion_rate"))
      .sort();
  }

  _rateOptions() {
    return this._rateEntities().map(id =>
      `<option value="${id}" ${this._config.person_entity === id ? "selected" : ""}>${id}</option>`
    ).join("");
  }

  _accentSwatches() {
    return Object.entries(REWARDS_ACCENT_COLORS).map(([key, val]) => `
      <div class="swatch ${this._config.accent === key ? "active" : ""}"
           data-accent="${key}" title="${key}"
           style="background:${val.hex}"></div>
    `).join("");
  }

  _render() {
    if (!this._hass) return;
    const titleSize = this._config.title_size    ?? 18;
    const subSize   = this._config.subtitle_size ?? REWARDS_DEFAULT_SIZE;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 16px; }
        label { display: block; margin-bottom: 12px; font-size: 13px; color: #ccc; }
        select, input[type="text"], input[type="number"] {
          display: block; width: 100%; margin-top: 4px;
          background: #1f2937; color: #fff;
          border: 1px solid rgba(255,255,255,0.15); border-radius: 8px;
          padding: 8px 10px; font-size: 13px; box-sizing: border-box;
        }
        .size-row { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
        .size-row input[type="range"] { flex: 1; accent-color: #3B82F6; }
        .size-val { font-size: 13px; color: #fff; min-width: 36px; text-align: right; }
        .swatches { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
        .swatch {
          width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
          border: 2px solid transparent; transition: border 0.15s;
        }
        .swatch.active { border: 2px solid #fff; }
        .section-title {
          font-size: 11px; letter-spacing: 2px; color: rgba(255,255,255,0.4);
          text-transform: uppercase; margin: 16px 0 8px;
        }
        hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 16px 0; }
        .hint { font-size: 11px; color: rgba(255,255,255,0.35); margin-top: 4px; }
      </style>

      <label>Person Entity (completion rate sensor)<br>
        <select data-key="person_entity">
          <option value="">-- select --</option>
          ${this._rateOptions()}
        </select>
        <div class="hint">Used to read the person's current points total</div>
      </label>

      <label>Person ID (Hades)<br>
        <input type="number" data-key="person_id" min="1" value="${this._config.person_id || ""}">
        <div class="hint">The numeric ID from the Hades people API</div>
      </label>

      <label>Display Name<br>
        <input type="text" data-key="display_name" value="${this._config.display_name || ""}">
      </label>

      <hr>
      <div class="section-title">Font Sizes</div>

      <label>Title Size
        <div class="size-row">
          <input type="range" data-key="title_size" min="12" max="32" step="1" value="${titleSize}">
          <span class="size-val" id="title-val">${titleSize}px</span>
        </div>
      </label>

      <label>Subtitle Size
        <div class="size-row">
          <input type="range" data-key="subtitle_size" min="10" max="22" step="1" value="${subSize}">
          <span class="size-val" id="sub-val">${subSize}px</span>
        </div>
      </label>

      <hr>
      <div class="section-title">Accent Color</div>
      <div class="swatches">${this._accentSwatches()}</div>
    `;

    this.shadowRoot.querySelectorAll("select, input[type='text']").forEach(el => {
      el.addEventListener("change", () => {
        this._config = { ...this._config, [el.dataset.key]: el.value };
        this._fire(this._config);
      });
    });

    this.shadowRoot.querySelectorAll("input[type='number']").forEach(el => {
      el.addEventListener("change", () => {
        this._config = { ...this._config, [el.dataset.key]: parseInt(el.value) };
        this._fire(this._config);
      });
    });

    this.shadowRoot.querySelectorAll("input[type='range']").forEach(el => {
      const valEl = el.dataset.key === "title_size"
        ? this.shadowRoot.getElementById("title-val")
        : this.shadowRoot.getElementById("sub-val");
      el.addEventListener("input", () => {
        valEl.textContent = `${el.value}px`;
        this._config = { ...this._config, [el.dataset.key]: parseFloat(el.value) };
        this._fire(this._config);
      });
    });

    this.shadowRoot.querySelectorAll(".swatch").forEach(el => {
      el.addEventListener("click", () => {
        this._config = { ...this._config, accent: el.dataset.accent };
        this._fire(this._config);
        this._render();
      });
    });
  }
}


// ── Register ──────────────────────────────────────────────────────────────────

customElements.define("hades-rewards", HadesRewards);
customElements.define("hades-rewards-editor", HadesRewardsEditor);

HadesRewards.getConfigElement = () => document.createElement("hades-rewards-editor");
HadesRewards.getStubConfig = () => ({
  person_entity: "",
  person_id:     1,
  display_name:  "",
  accent:        "blue",
  title_size:    18,
  subtitle_size: REWARDS_DEFAULT_SIZE,
});

window.customCards = window.customCards || [];
window.customCards.push({
  type:        "hades-rewards",
  name:        "Hades Rewards",
  description: "Displays available rewards with redeem buttons. Disabled when not enough points. Notifies parent on redemption.",
  preview:     true,
});
