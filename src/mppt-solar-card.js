/*
 * MPPT Solar Card – Lovelace-Karte für Home Assistant
 * Zeigt Solarstrom, -spannung, -leistung, Ladestrom zur Batterie und
 * die Temperatur eines MPPT-Ladereglers an.
 */

const CARD_VERSION = "__VERSION__";
const DEFAULT_IMAGE = "__IMAGE__";

const DEFAULTS = {
  name: "MPPT Solar Charger",
  show_image: true,
  show_flow: true,
  temp_warning: 50,
  temp_critical: 65,
};

// Fallback-Nachkommastellen, falls die Entität keine display_precision hat
const PRECISION = {
  pv_power: 0,
  pv_voltage: 1,
  pv_current: 1,
  battery_current: 1,
  temperature: 1,
};

const LABELS = {
  de: {
    pv_power: "Leistung Solar",
    pv_voltage: "Spannung Solar",
    pv_current: "Strom Solar",
    battery_current: "Strom Batterie",
    temperature: "Temperatur",
    solar: "Solarpanel",
    controller: "Laderegler",
    battery: "Batterie",
    charging: "lädt",
    discharging: "entlädt",
    idle: "kein Ladestrom",
    unavailable: "nicht verfügbar",
    calculated: "berechnet",
  },
  en: {
    pv_power: "Solar power",
    pv_voltage: "Solar voltage",
    pv_current: "Solar current",
    battery_current: "Battery current",
    temperature: "Temperature",
    solar: "Solar panel",
    controller: "Controller",
    battery: "Battery",
    charging: "charging",
    discharging: "discharging",
    idle: "no charge current",
    unavailable: "unavailable",
    calculated: "calculated",
  },
};

const ICONS = {
  pv_power: "mdi:solar-power-variant",
  pv_voltage: "mdi:flash-triangle-outline",
  pv_current: "mdi:current-dc",
  battery_current: "mdi:battery-charging",
  temperature: "mdi:thermometer",
};

class MpptSolarCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = undefined;
    this._hass = undefined;
  }

  static getConfigElement() {
    return document.createElement("mppt-solar-card-editor");
  }

  static getStubConfig(hass) {
    const sensors = Object.keys(hass?.states || {}).filter((id) => id.startsWith("sensor."));
    const find = (...words) =>
      sensors.find((id) => words.every((w) => id.includes(w))) || "";
    return {
      name: DEFAULTS.name,
      pv_power: find("pv", "power") || find("solar", "power"),
      pv_voltage: find("pv", "voltage") || find("solar", "voltage"),
      pv_current: find("pv", "current") || find("solar", "current"),
      battery_current: find("battery", "current") || find("charge", "current"),
      temperature: find("mppt", "temp") || find("controller", "temp"),
    };
  }

  setConfig(config) {
    if (!config) throw new Error("Ungültige Konfiguration");
    this._config = { ...DEFAULTS, ...config };
    this._build();
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._config) this._update();
  }

  getCardSize() {
    return this._config?.show_image === false ? 4 : 8;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  // ---------------------------------------------------------------- helpers

  _t(key) {
    const lang = (this._hass?.locale?.language || this._hass?.language || "de").slice(0, 2);
    return (LABELS[lang] || LABELS.en)[key] ?? LABELS.en[key] ?? key;
  }

  _read(key) {
    const entityId = this._config[key];
    if (!entityId) return null;
    const stateObj = this._hass?.states?.[entityId];
    if (!stateObj) return { entityId, missing: true };
    const value = parseFloat(stateObj.state);
    const precision =
      this._hass?.entities?.[entityId]?.display_precision ?? PRECISION[key] ?? 1;
    return {
      entityId,
      stateObj,
      value: Number.isFinite(value) ? value : null,
      unit: stateObj.attributes.unit_of_measurement || "",
      precision,
    };
  }

  _format(value, precision) {
    if (value === null || value === undefined) return "—";
    const locale = this._hass?.locale?.language || this._hass?.language || "de";
    return value.toLocaleString(locale, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  // ---------------------------------------------------------------- render

  _build() {
    const c = this._config;
    const image = c.image || DEFAULT_IMAGE;
    const tile = (key, extraClass = "") => `
      <div class="tile ${extraClass}" data-key="${key}" tabindex="0" role="button">
        <ha-icon icon="${ICONS[key]}"></ha-icon>
        <div class="tile-text">
          <div class="label">${this._t(key)}</div>
          <div class="value"><span class="num">—</span><span class="unit"></span></div>
          <div class="sub"></div>
        </div>
      </div>`;

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        ${c.name ? `<div class="header"><span>${escapeHtml(c.name)}</span><span class="temp-chip" data-key="temperature"></span></div>` : ""}
        ${
          c.show_image !== false
            ? `<div class="image-wrap"><img src="${image}" alt="MPPT Laderegler" loading="lazy"></div>`
            : ""
        }
        ${
          c.show_flow !== false
            ? `<div class="flow">
                <div class="node" data-key="pv_power"><ha-icon icon="mdi:solar-panel"></ha-icon><span>${this._t("solar")}</span></div>
                <svg class="line pv" viewBox="0 0 100 10" preserveAspectRatio="none"><line x1="0" y1="5" x2="100" y2="5"/></svg>
                <div class="node"><ha-icon icon="mdi:sun-wireless-outline"></ha-icon><span>${this._t("controller")}</span></div>
                <svg class="line bat" viewBox="0 0 100 10" preserveAspectRatio="none"><line x1="0" y1="5" x2="100" y2="5"/></svg>
                <div class="node" data-key="battery_current"><ha-icon class="bat-icon" icon="mdi:battery"></ha-icon><span>${this._t("battery")}</span></div>
              </div>`
            : ""
        }
        <div class="tiles">
          ${tile("pv_power", "wide")}
          ${tile("pv_voltage")}
          ${tile("pv_current")}
          ${tile("battery_current")}
          ${tile("temperature")}
        </div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-key]").forEach((el) => {
      const open = () => {
        let key = el.dataset.key;
        // Leistung berechnet → Spannung als Ziel öffnen
        if (key === "pv_power" && !this._config.pv_power) key = "pv_voltage";
        this._moreInfo(this._config[key]);
      };
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") open();
      });
    });
  }

  _setTile(key, data, { sub = "", value, unit, precision } = {}) {
    const el = this.shadowRoot.querySelector(`.tile[data-key="${key}"]`);
    if (!el) return;
    const configured = data !== null || value !== undefined;
    el.classList.toggle("hidden", !configured);
    if (!configured) return;
    const unavailable = value === undefined && (data.missing || data.value === null);
    el.classList.toggle("unavailable", unavailable);
    el.querySelector(".num").textContent = unavailable
      ? "—"
      : this._format(value ?? data.value, precision ?? data.precision);
    el.querySelector(".unit").textContent = unavailable ? "" : unit ?? data.unit;
    el.querySelector(".sub").textContent = unavailable ? this._t("unavailable") : sub;
  }

  _update() {
    if (!this.shadowRoot.querySelector("ha-card")) return;
    const c = this._config;
    const pvP = this._read("pv_power");
    const pvV = this._read("pv_voltage");
    const pvI = this._read("pv_current");
    const batI = this._read("battery_current");
    const temp = this._read("temperature");

    // Leistung: Sensor oder, falls nicht konfiguriert, U × I
    let power = pvP?.value ?? null;
    if (!pvP && pvV?.value != null && pvI?.value != null) {
      power = pvV.value * pvI.value;
      this._setTile("pv_power", null, {
        value: power,
        unit: "W",
        precision: 0,
        sub: this._t("calculated"),
      });
    } else {
      this._setTile("pv_power", pvP);
    }
    this._setTile("pv_voltage", pvV);
    this._setTile("pv_current", pvI);

    const ib = batI?.value ?? null;
    let batState = "";
    if (ib !== null) {
      batState = ib > 0.05 ? this._t("charging") : ib < -0.05 ? this._t("discharging") : this._t("idle");
    }
    this._setTile("battery_current", batI, { sub: batState });

    // Temperatur mit Schwellwerten
    let tempLevel = "ok";
    if (temp?.value != null) {
      if (temp.value >= Number(c.temp_critical)) tempLevel = "critical";
      else if (temp.value >= Number(c.temp_warning)) tempLevel = "warning";
    }
    this._setTile("temperature", temp);
    const tempTile = this.shadowRoot.querySelector('.tile[data-key="temperature"]');
    if (tempTile) tempTile.dataset.level = tempLevel;
    const chip = this.shadowRoot.querySelector(".temp-chip");
    if (chip) {
      const show = temp && temp.value != null;
      chip.style.display = show ? "" : "none";
      chip.dataset.level = tempLevel;
      if (show) chip.textContent = `${this._format(temp.value, temp.precision)} ${temp.unit}`;
    }

    // Energiefluss-Animation
    const pvLine = this.shadowRoot.querySelector(".line.pv");
    const batLine = this.shadowRoot.querySelector(".line.bat");
    if (pvLine) {
      const active = power !== null && power > 1;
      pvLine.classList.toggle("active", active);
      // schneller bei mehr Leistung: 0,6 s … 3 s
      const ratio = Math.min(Math.max((power || 0) / (Number(c.max_power) || 500), 0), 1);
      pvLine.style.setProperty("--speed", `${(3 - ratio * 2.4).toFixed(2)}s`);
    }
    if (batLine) {
      batLine.classList.toggle("active", ib !== null && Math.abs(ib) > 0.05);
      batLine.classList.toggle("reverse", ib !== null && ib < -0.05);
      const ratio = Math.min(Math.abs(ib || 0) / (Number(c.max_current) || 40), 1);
      batLine.style.setProperty("--speed", `${(3 - ratio * 2.4).toFixed(2)}s`);
    }
    const batIcon = this.shadowRoot.querySelector(".bat-icon");
    if (batIcon) {
      batIcon.setAttribute(
        "icon",
        ib !== null && ib > 0.05 ? "mdi:battery-charging" : ib !== null && ib < -0.05 ? "mdi:battery-minus" : "mdi:battery"
      );
    }
  }
}

// -------------------------------------------------------------------- editor

const EDITOR_SCHEMA = [
  { name: "name", selector: { text: {} } },
  { name: "pv_power", selector: { entity: { domain: "sensor" } } },
  { name: "pv_voltage", selector: { entity: { domain: "sensor" } } },
  { name: "pv_current", selector: { entity: { domain: "sensor" } } },
  { name: "battery_current", selector: { entity: { domain: "sensor" } } },
  { name: "temperature", selector: { entity: { domain: "sensor" } } },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "temp_warning", selector: { number: { min: 0, max: 120, unit_of_measurement: "°C", mode: "box" } } },
      { name: "temp_critical", selector: { number: { min: 0, max: 120, unit_of_measurement: "°C", mode: "box" } } },
      { name: "max_power", selector: { number: { min: 1, max: 10000, unit_of_measurement: "W", mode: "box" } } },
      { name: "max_current", selector: { number: { min: 1, max: 200, unit_of_measurement: "A", mode: "box" } } },
    ],
  },
  { name: "show_image", selector: { boolean: {} } },
  { name: "show_flow", selector: { boolean: {} } },
  { name: "image", selector: { text: {} } },
];

const EDITOR_LABELS = {
  name: "Titel",
  pv_power: "Leistung Solarpanel (optional, sonst U × I)",
  pv_voltage: "Spannung Solarpanel",
  pv_current: "Strom Solarpanel",
  battery_current: "Strom Richtung Batterie",
  temperature: "Temperatur Laderegler",
  temp_warning: "Warnung ab",
  temp_critical: "Kritisch ab",
  max_power: "Max. Solarleistung (Animation)",
  max_current: "Max. Ladestrom (Animation)",
  show_image: "Bild anzeigen",
  show_flow: "Energiefluss anzeigen",
  image: "Eigenes Bild (URL, optional)",
};

class MpptSolarCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...DEFAULTS, ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => EDITOR_LABELS[s.name] ?? s.name;
      this._form.addEventListener("value-changed", (ev) => {
        const config = { ...ev.detail.value };
        // leere Felder nicht in die YAML schreiben
        Object.keys(config).forEach((k) => {
          if (config[k] === "" || config[k] === undefined) delete config[k];
        });
        this.dispatchEvent(
          new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true })
        );
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = EDITOR_SCHEMA;
    this._form.data = this._config;
  }
}

// -------------------------------------------------------------------- styles

const STYLES = `
  :host {
    --mppt-green: #7cb342;
    --mppt-warn: var(--warning-color, #ffa600);
    --mppt-crit: var(--error-color, #db4437);
  }
  ha-card { overflow: hidden; padding-bottom: 12px; }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 16px 4px; font-size: 1.25em; font-weight: 500;
    color: var(--primary-text-color);
  }
  .temp-chip {
    font-size: 0.7em; font-weight: 600; padding: 3px 10px; border-radius: 999px;
    background: color-mix(in srgb, var(--mppt-green) 18%, transparent);
    color: var(--mppt-green); cursor: pointer; white-space: nowrap;
  }
  .temp-chip[data-level="warning"] { background: color-mix(in srgb, var(--mppt-warn) 18%, transparent); color: var(--mppt-warn); }
  .temp-chip[data-level="critical"] { background: color-mix(in srgb, var(--mppt-crit) 18%, transparent); color: var(--mppt-crit); }
  .image-wrap { display: flex; justify-content: center; padding: 8px 16px 0; }
  .image-wrap img {
    width: 100%; max-width: 420px; height: auto; display: block;
    filter: drop-shadow(0 6px 12px rgba(0,0,0,0.25));
  }
  .flow {
    display: grid; grid-template-columns: auto 1fr auto 1fr auto; align-items: center;
    gap: 6px; padding: 12px 16px 4px;
  }
  .node {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    font-size: 0.75em; color: var(--secondary-text-color); cursor: default;
  }
  .node[data-key] { cursor: pointer; }
  .node ha-icon { --mdc-icon-size: 28px; color: var(--mppt-green); }
  .line { width: 100%; height: 10px; overflow: visible; }
  .line line {
    stroke: var(--divider-color, rgba(127,127,127,0.3)); stroke-width: 3;
    stroke-linecap: round; vector-effect: non-scaling-stroke;
  }
  .line.active line {
    stroke: var(--mppt-green); stroke-dasharray: 2 10;
    animation: flow var(--speed, 2s) linear infinite;
  }
  .line.active.reverse line { stroke: var(--mppt-warn); animation-direction: reverse; }
  @keyframes flow { to { stroke-dashoffset: -12; } }
  @media (prefers-reduced-motion: reduce) { .line.active line { animation: none; stroke-dasharray: none; } }
  .tiles {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px; padding: 8px 16px 0;
  }
  .tile {
    display: flex; align-items: center; gap: 12px; padding: 10px 12px;
    border-radius: var(--ha-card-border-radius, 12px);
    background: var(--secondary-background-color, rgba(127,127,127,0.08));
    cursor: pointer; min-width: 0;
  }
  .tile:focus-visible { outline: 2px solid var(--primary-color); }
  .tile.hidden { display: none; }
  .tile.wide { grid-column: 1 / -1; }
  .tile.wide .num { font-size: 2em; }
  .tile ha-icon { color: var(--mppt-green); flex: none; }
  .tile.unavailable ha-icon, .tile.unavailable .num { color: var(--disabled-text-color, #999); }
  .tile[data-level="warning"] ha-icon, .tile[data-level="warning"] .num { color: var(--mppt-warn); }
  .tile[data-level="critical"] ha-icon, .tile[data-level="critical"] .num { color: var(--mppt-crit); }
  .tile-text { min-width: 0; }
  .label { font-size: 0.8em; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .value { color: var(--primary-text-color); white-space: nowrap; }
  .num { font-size: 1.4em; font-weight: 600; font-variant-numeric: tabular-nums; }
  .unit { margin-left: 3px; font-size: 0.9em; color: var(--secondary-text-color); }
  .sub { font-size: 0.75em; color: var(--secondary-text-color); min-height: 0; }
  .sub:empty { display: none; }
`;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// -------------------------------------------------------------------- register

if (!customElements.get("mppt-solar-card")) {
  customElements.define("mppt-solar-card", MpptSolarCard);
}
if (!customElements.get("mppt-solar-card-editor")) {
  customElements.define("mppt-solar-card-editor", MpptSolarCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "mppt-solar-card")) {
  window.customCards.push({
    type: "mppt-solar-card",
    name: "MPPT Solar Card",
    description: "Leistungsdaten eines MPPT-Solarladereglers (Solar U/I/P, Ladestrom, Temperatur).",
    preview: true,
    documentationURL: "https://github.com/OWNER/mppt-solar-card",
  });
}

console.info(
  `%c MPPT-SOLAR-CARD %c v${CARD_VERSION} `,
  "color:#fff;background:#7cb342;font-weight:700;",
  "color:#7cb342;background:#fff;font-weight:700;"
);
