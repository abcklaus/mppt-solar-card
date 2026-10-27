/*
 * MPPT Solar Card – Lovelace-Karte für Home Assistant
 * Zeigt Solarstrom, -spannung, -leistung, Ladestrom zur Batterie und
 * die Temperatur eines MPPT-Ladereglers an.
 */

const CARD_VERSION = "__VERSION__";

const DEFAULTS = {
  name: "MPPT Solar Charger",
  show_diagram: true,
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
    pv_power: "Leistung",
    pv_voltage: "Spannung",
    pv_current: "Strom",
    battery_current: "Ladestrom",
    temperature: "Temperatur",
    solar: "Solarpanel",
    controller: "Laderegler",
    battery: "Batterie",
    charging: "lädt",
    discharging: "entlädt",
    idle: "kein Ladestrom",
    unavailable: "nicht verfügbar",
    calculated: "berechnet",
    warning: "erhöht",
    critical: "zu heiß",
  },
  en: {
    pv_power: "Power",
    pv_voltage: "Voltage",
    pv_current: "Current",
    battery_current: "Charge current",
    temperature: "Temperature",
    solar: "Solar panel",
    controller: "Controller",
    battery: "Battery",
    charging: "charging",
    discharging: "discharging",
    idle: "no charge current",
    unavailable: "unavailable",
    calculated: "calculated",
    warning: "elevated",
    critical: "too hot",
  },
};

// Flache Darstellung: Solarpanel → Laderegler → Batterie
const DIAGRAM = `
  <svg class="diagram" viewBox="0 0 400 172" role="img" aria-hidden="true">
    <!-- Kabel (liegen hinter dem Gerät) -->
    <g class="wire solar">
      <path class="base" d="M52 92 V160 H156 V130"/>
      <path class="dash" d="M52 92 V160 H156 V130"/>
    </g>
    <g class="wire battery">
      <path class="base" d="M244 130 V160 H352 V130"/>
      <path class="dash" d="M244 130 V160 H352 V130"/>
    </g>

    <!-- Solarpanel -->
    <g class="panel" data-key="pv_power">
      <rect x="14" y="38" width="76" height="52" rx="4"/>
      <path d="M33 38 V90 M52 38 V90 M71 38 V90 M14 64 H90"/>
      <text x="52" y="26" class="caption">{solar}</text>
    </g>

    <!-- Laderegler -->
    <g class="device" data-key="temperature">
      <rect class="flange" x="116" y="44" width="168" height="80" rx="6"/>
      <circle class="hole" cx="122" cy="84" r="3"/>
      <circle class="hole" cx="278" cy="84" r="3"/>
      <rect class="body" x="128" y="20" width="144" height="122" rx="10"/>
      <path class="front" d="M128 98 H272 V132 a10 10 0 0 1 -10 10 H138 a10 10 0 0 1 -10 -10 Z"/>
      <text x="140" y="44" class="brand">MPPT</text>
      <text x="140" y="58" class="sub-brand">Solar Charger</text>
      <rect class="led led-pv" x="210" y="66" width="9" height="14" rx="2"/>
      <rect class="led led-bat" x="227" y="66" width="9" height="14" rx="2"/>
      <rect class="led led-status" x="244" y="66" width="9" height="14" rx="2"/>
      <circle class="term solar" cx="146" cy="114" r="7"/>
      <circle class="term solar" cx="166" cy="114" r="7"/>
      <circle class="term battery" cx="234" cy="114" r="7"/>
      <circle class="term battery" cx="254" cy="114" r="7"/>
      <text x="146" y="134" class="pol">+</text>
      <text x="166" y="134" class="pol">−</text>
      <text x="234" y="134" class="pol">−</text>
      <text x="254" y="134" class="pol">+</text>
      <text x="200" y="12" class="caption controller">{controller}</text>
    </g>

    <!-- Batterie -->
    <g class="batt" data-key="battery_current">
      <rect class="cap" x="331" y="48" width="10" height="7" rx="1"/>
      <rect class="cap" x="363" y="48" width="10" height="7" rx="1"/>
      <rect class="case" x="322" y="55" width="60" height="75" rx="6"/>
      <path class="bolt" d="M356 68 L342 95 H352 L348 117 L363 88 H353 Z"/>
      <text x="352" y="26" class="caption">{battery}</text>
    </g>
  </svg>`;

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
    const langChanged = this._lang && this._lang !== this._langOf(hass);
    this._hass = hass;
    if (!this._config) return;
    if (langChanged || !this._lang) this._build();
    this._update();
  }

  getCardSize() {
    return this._config?.show_diagram === false ? 4 : 7;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  // ---------------------------------------------------------------- helpers

  _langOf(hass) {
    return (hass?.locale?.language || hass?.language || "de").slice(0, 2);
  }

  _t(key) {
    return (LABELS[this._langOf(this._hass)] || LABELS.en)[key] ?? LABELS.en[key] ?? key;
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
    this._lang = this._langOf(this._hass);
    const val = (key, primary = false) => `
      <div class="val ${primary ? "primary" : ""}" data-key="${key}" tabindex="0" role="button">
        <div class="label">${this._t(key)}</div>
        <div class="value"><span class="num">—</span><span class="unit"></span></div>
        <div class="sub"></div>
      </div>`;
    const diagram = DIAGRAM.replace(/\{(\w+)\}/g, (_, k) => escapeHtml(this._t(k)));

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        ${c.name ? `<div class="header">${escapeHtml(c.name)}</div>` : ""}
        ${c.show_diagram !== false ? diagram : ""}
        <div class="groups">
          <section class="group solar">
            <div class="group-head"><ha-icon icon="mdi:solar-panel"></ha-icon>${this._t("solar")}</div>
            ${val("pv_power", true)}
            <div class="pair">${val("pv_voltage")}${val("pv_current")}</div>
          </section>
          <section class="group controller">
            <div class="group-head"><ha-icon class="temp-icon" icon="mdi:thermometer"></ha-icon>${this._t("controller")}</div>
            ${val("temperature", true)}
          </section>
          <section class="group battery">
            <div class="group-head"><ha-icon class="bat-icon" icon="mdi:battery"></ha-icon>${this._t("battery")}</div>
            ${val("battery_current", true)}
          </section>
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

  _setVal(key, data, { sub = "", value, unit, precision } = {}) {
    const el = this.shadowRoot.querySelector(`.val[data-key="${key}"]`);
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
    const root = this.shadowRoot;
    if (!root.querySelector("ha-card")) return;
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
      this._setVal("pv_power", null, { value: power, unit: "W", precision: 0, sub: this._t("calculated") });
    } else {
      this._setVal("pv_power", pvP);
    }
    this._setVal("pv_voltage", pvV);
    this._setVal("pv_current", pvI);

    const ib = batI?.value ?? null;
    const charging = ib !== null && ib > 0.05;
    const discharging = ib !== null && ib < -0.05;
    const batState = ib === null ? "" : charging ? this._t("charging") : discharging ? this._t("discharging") : this._t("idle");
    this._setVal("battery_current", batI, { sub: batState });

    // Temperatur mit Schwellwerten
    let tempLevel = "ok";
    if (temp?.value != null) {
      if (temp.value >= Number(c.temp_critical)) tempLevel = "critical";
      else if (temp.value >= Number(c.temp_warning)) tempLevel = "warning";
    }
    this._setVal("temperature", temp, { sub: tempLevel === "ok" ? "" : this._t(tempLevel) });
    root.querySelector(".group.controller").dataset.level = tempLevel;
    root.querySelector(".temp-icon").setAttribute("icon", tempLevel === "ok" ? "mdi:thermometer" : "mdi:thermometer-alert");

    // Gruppen ohne konfigurierte Werte ausblenden
    root.querySelectorAll(".group").forEach((g) => {
      g.classList.toggle("hidden", !g.querySelector(".val:not(.hidden)"));
    });

    const batIcon = charging ? "mdi:battery-charging" : discharging ? "mdi:battery-minus" : "mdi:battery";
    root.querySelector(".bat-icon").setAttribute("icon", batIcon);

    // Grafik: Energiefluss, LEDs, Blitz
    const svg = root.querySelector(".diagram");
    if (!svg) return;
    const solarActive = power !== null && power > 1;
    const speed = (ratio) => `${(3 - Math.min(Math.max(ratio, 0), 1) * 2.4).toFixed(2)}s`;
    const pvWire = svg.querySelector(".wire.solar");
    pvWire.classList.toggle("active", solarActive);
    pvWire.style.setProperty("--speed", speed((power || 0) / (Number(c.max_power) || 500)));
    const batWire = svg.querySelector(".wire.battery");
    batWire.classList.toggle("active", charging || discharging);
    batWire.classList.toggle("reverse", discharging);
    batWire.style.setProperty("--speed", speed(Math.abs(ib || 0) / (Number(c.max_current) || 40)));
    svg.querySelector(".led-pv").classList.toggle("on", solarActive);
    svg.querySelector(".led-bat").classList.toggle("on", charging || discharging);
    svg.querySelector(".led-status").dataset.level = tempLevel;
    svg.querySelector(".batt").classList.toggle("charging", charging);
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
  { name: "show_diagram", selector: { boolean: {} } },
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
  show_diagram: "Grafik anzeigen",
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
    /* per card-mod überschreibbar */
    --mppt-solar: #f2a900;
    --mppt-battery: #2f8fdd;
    --mppt-controller: #7cb342;
    --mppt-warn: var(--warning-color, #ff8a00);
    --mppt-crit: var(--error-color, #db4437);
    --mppt-muted: var(--divider-color, rgba(127,127,127,0.3));
  }
  ha-card { overflow: hidden; padding-bottom: 16px; container-type: inline-size; }
  .header {
    padding: 16px 16px 0; font-size: 1.25em; font-weight: 500;
    color: var(--primary-text-color);
  }

  /* ---- Grafik ---- */
  .diagram { display: block; width: 100%; max-width: 440px; margin: 8px auto 0; padding: 0 12px; box-sizing: border-box; }
  .diagram [data-key] { cursor: pointer; }
  .caption { font-size: 12px; font-weight: 600; text-anchor: middle; }
  .panel .caption { fill: var(--mppt-solar); }
  .batt .caption { fill: var(--mppt-battery); }
  .caption.controller { fill: var(--secondary-text-color); font-weight: 500; }
  .panel rect { fill: color-mix(in srgb, var(--mppt-solar) 22%, transparent); stroke: var(--mppt-solar); stroke-width: 2.5; }
  .panel path { stroke: var(--mppt-solar); stroke-width: 1.5; fill: none; opacity: .7; }
  .flange { fill: #5f6368; }
  .hole { fill: var(--card-background-color, #fff); }
  .body { fill: var(--mppt-controller); }
  .front { fill: rgba(0,0,0,.14); }
  .brand { fill: #fff; font-size: 14px; font-weight: 800; font-style: italic; }
  .sub-brand { fill: rgba(255,255,255,.85); font-size: 9px; font-weight: 600; }
  .led { fill: rgba(0,0,0,.35); transition: fill .3s; }
  .led-pv.on { fill: var(--mppt-solar); }
  .led-bat.on { fill: var(--mppt-battery); }
  .led-status { fill: #c5f29a; }
  .led-status[data-level="warning"] { fill: var(--mppt-warn); }
  .led-status[data-level="critical"] { fill: var(--mppt-crit); animation: blink 1s steps(2) infinite; }
  .term { fill: rgba(0,0,0,.25); stroke-width: 3; }
  .term.solar { stroke: var(--mppt-solar); }
  .term.battery { stroke: var(--mppt-battery); }
  .pol { fill: #fff; font-size: 11px; font-weight: 700; text-anchor: middle; }
  .case { fill: color-mix(in srgb, var(--mppt-battery) 18%, transparent); stroke: var(--mppt-battery); stroke-width: 2.5; }
  .cap { fill: var(--mppt-battery); }
  .bolt { fill: var(--mppt-battery); opacity: 0; transition: opacity .3s; }
  .batt.charging .bolt { opacity: 1; }
  .wire path { fill: none; stroke-width: 3.5; stroke-linejoin: round; stroke-linecap: round; }
  .wire .base { stroke: var(--mppt-muted); }
  .wire.active.solar .base { stroke: color-mix(in srgb, var(--mppt-solar) 35%, transparent); }
  .wire.active.battery .base { stroke: color-mix(in srgb, var(--mppt-battery) 35%, transparent); }
  .wire .dash { opacity: 0; stroke-dasharray: 3 11; }
  .wire.active .dash { opacity: 1; animation: flow var(--speed, 2s) linear infinite; }
  .wire.solar .dash { stroke: var(--mppt-solar); }
  .wire.battery .dash { stroke: var(--mppt-battery); }
  .wire.reverse .dash { animation-direction: reverse; }
  @keyframes flow { to { stroke-dashoffset: -14; } }
  @keyframes blink { 50% { fill: transparent; } }
  @media (prefers-reduced-motion: reduce) {
    .wire.active .dash { animation: none; stroke-dasharray: none; }
  }

  /* ---- Werte ---- */
  .groups {
    display: grid; grid-template-columns: 1.25fr 1fr 1fr;
    gap: 8px; padding: 12px 16px 0;
  }
  @container (max-width: 360px) {
    .groups { grid-template-columns: 1fr 1fr; }
    .group.solar { grid-column: 1 / -1; }
  }
  .group {
    --c: var(--mppt-controller);
    display: flex; flex-direction: column; gap: 6px; min-width: 0;
    padding: 10px 12px 12px;
    border-radius: var(--ha-card-border-radius, 12px);
    background: color-mix(in srgb, var(--c) 10%, var(--card-background-color, transparent));
    border-top: 4px solid var(--c);
  }
  .group.hidden { display: none; }
  .group.solar { --c: var(--mppt-solar); }
  .group.battery { --c: var(--mppt-battery); }
  .group.controller[data-level="warning"] { --c: var(--mppt-warn); }
  .group.controller[data-level="critical"] { --c: var(--mppt-crit); }
  .group-head {
    display: flex; align-items: center; gap: 6px;
    font-size: 0.85em; font-weight: 600; color: var(--c);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .group-head ha-icon { --mdc-icon-size: 20px; flex: none; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .val { cursor: pointer; min-width: 0; border-radius: 6px; }
  .val:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .val.hidden { display: none; }
  .label { font-size: 0.75em; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .value { color: var(--primary-text-color); white-space: nowrap; }
  .num { font-size: 1.15em; font-weight: 600; font-variant-numeric: tabular-nums; }
  .primary .num { font-size: 1.75em; line-height: 1.15; }
  .unit { margin-left: 3px; font-size: 0.85em; color: var(--secondary-text-color); }
  .val.unavailable .num { color: var(--disabled-text-color, #999); }
  .sub { font-size: 0.75em; color: var(--secondary-text-color); }
  .sub:empty { display: none; }
  .group.controller:not([data-level="ok"]) .sub { color: var(--c); font-weight: 600; }
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
