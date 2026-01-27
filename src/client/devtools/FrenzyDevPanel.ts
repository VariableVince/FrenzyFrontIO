import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  DEFAULT_FRENZY_CONFIG,
  FrenzyConfig,
} from "../../core/game/frenzy/FrenzyTypes";
import { GameFork, GameType } from "../../core/game/Game";
import { JoinLobbyEvent } from "../types/JoinLobbyEvent";
import { FRENZY_CONFIG_EVENT, FRENZY_RESTART_EVENT } from "./FrenzyDevChannels";

// Simple config fields (top-level properties)
interface SimpleConfigField {
  type: "simple";
  key: keyof FrenzyConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  description?: string;
}

// Unit config fields (nested under units.{unitType}.{property})
interface UnitConfigField {
  type: "unit";
  unitType: "soldier" | "eliteSoldier" | "defensePost";
  property:
    | "health"
    | "speed"
    | "dps"
    | "range"
    | "fireInterval"
    | "projectileDamage";
  label: string;
  min: number;
  max: number;
  step: number;
  description?: string;
}

type ConfigField = SimpleConfigField | UnitConfigField;

const CONFIG_FIELDS: ConfigField[] = [
  // Soldier config
  {
    type: "unit",
    unitType: "soldier",
    property: "health",
    label: "Soldier HP",
    min: 10,
    max: 500,
    step: 5,
  },
  {
    type: "unit",
    unitType: "soldier",
    property: "speed",
    label: "Soldier Speed",
    min: 0.5,
    max: 10,
    step: 0.25,
  },
  {
    type: "unit",
    unitType: "soldier",
    property: "dps",
    label: "Soldier DPS",
    min: 1,
    max: 100,
    step: 1,
  },
  {
    type: "unit",
    unitType: "soldier",
    property: "range",
    label: "Soldier Range",
    min: 5,
    max: 60,
    step: 1,
  },
  {
    type: "unit",
    unitType: "soldier",
    property: "fireInterval",
    label: "Soldier Fire Rate",
    min: 0.1,
    max: 5,
    step: 0.1,
  },
  // Elite Soldier config
  {
    type: "unit",
    unitType: "eliteSoldier",
    property: "health",
    label: "Elite HP",
    min: 10,
    max: 1000,
    step: 10,
  },
  {
    type: "unit",
    unitType: "eliteSoldier",
    property: "speed",
    label: "Elite Speed",
    min: 0.5,
    max: 10,
    step: 0.25,
  },
  {
    type: "unit",
    unitType: "eliteSoldier",
    property: "range",
    label: "Elite Range",
    min: 5,
    max: 100,
    step: 1,
  },
  // Defense Post config
  {
    type: "unit",
    unitType: "defensePost",
    property: "health",
    label: "DefPost HP",
    min: 50,
    max: 1000,
    step: 10,
  },
  {
    type: "unit",
    unitType: "defensePost",
    property: "range",
    label: "DefPost Range",
    min: 10,
    max: 100,
    step: 1,
  },
  {
    type: "unit",
    unitType: "defensePost",
    property: "fireInterval",
    label: "DefPost Fire Rate",
    min: 0.5,
    max: 10,
    step: 0.5,
  },
  {
    type: "unit",
    unitType: "defensePost",
    property: "projectileDamage",
    label: "DefPost Damage",
    min: 10,
    max: 500,
    step: 10,
  },
  // Spawning
  {
    type: "simple",
    key: "spawnInterval",
    label: "Spawn Interval (s)",
    min: 0.25,
    max: 10,
    step: 0.05,
    description: "Lower values spawn units faster",
  },
  {
    type: "simple",
    key: "maxUnitsPerPlayer",
    label: "Max Units",
    min: 5,
    max: 300,
    step: 1,
  },
  {
    type: "simple",
    key: "startingUnits",
    label: "Starting Units",
    min: 1,
    max: 200,
    step: 1,
  },
  // Movement & Territory
  {
    type: "simple",
    key: "separationRadius",
    label: "Separation Radius (px)",
    min: 1,
    max: 20,
    step: 0.5,
  },
  {
    type: "simple",
    key: "captureRadius",
    label: "Capture Radius (tiles)",
    min: 1,
    max: 12,
    step: 1,
    description: "How far around a unit tiles can flip",
  },
  {
    type: "simple",
    key: "hqCaptureRadius",
    label: "HQ Capture Radius (tiles)",
    min: 1,
    max: 8,
    step: 1,
    description: "How close enemies must get to defeat a player",
  },
  {
    type: "simple",
    key: "radialAlignmentWeight",
    label: "Radial Bias",
    min: 0,
    max: 2,
    step: 0.05,
    description: "Higher = stronger push along centroid rays",
  },
  {
    type: "simple",
    key: "borderAdvanceDistance",
    label: "Border Advance (px)",
    min: 0,
    max: 5,
    step: 0.1,
    description: "How far past the frontier units aim",
  },
  {
    type: "simple",
    key: "stopDistance",
    label: "Stop Distance (px)",
    min: 0,
    max: 10,
    step: 0.25,
    description: "How close units travel to their target",
  },
  // Projectiles
  {
    type: "simple",
    key: "projectileSpeed",
    label: "Projectile Speed (px/s)",
    min: 2,
    max: 50,
    step: 1,
    description: "How fast shells travel on screen",
  },
  {
    type: "simple",
    key: "projectileSize",
    label: "Shell Size (px)",
    min: 0.25,
    max: 6,
    step: 0.25,
    description: "Diameter of visual shells",
  },
  // Economy
  {
    type: "simple",
    key: "startingGold",
    label: "Starting Gold",
    min: 0,
    max: 500000,
    step: 10000,
    description: "Gold given at spawn",
  },
  {
    type: "simple",
    key: "baseGoldPerMinute",
    label: "Base Gold/min",
    min: 0,
    max: 100000,
    step: 1000,
    description: "Base gold income per minute",
  },
  {
    type: "simple",
    key: "mineGoldPerMinute",
    label: "Mine Gold/min",
    min: 0,
    max: 10000,
    step: 100,
    description: "Extra gold per mine per minute",
  },
];

const CUSTOM_DEFAULTS_STORAGE_KEY = "frenzy-dev-config-defaults";

const DEV_PANEL_ENABLED = shouldEnableDevPanel();

@customElement("frenzy-dev-panel")
export class FrenzyDevPanel extends LitElement {
  @state() private isCollapsed = false;
  @state() private config: FrenzyConfig = { ...DEFAULT_FRENZY_CONFIG };
  @state() private lastAppliedAt: number | null = null;
  @state() private canRestart = false;
  @state() private lastSavedAt: number | null = null;

  private readonly handleJoinLobby = (event: Event) => {
    if (!DEV_PANEL_ENABLED) return;
    const detail = (event as CustomEvent<JoinLobbyEvent>).detail;
    const info = detail?.gameStartInfo;
    if (!info) {
      this.canRestart = false;
      return;
    }
    this.canRestart =
      info.config.gameFork === GameFork.Frenzy &&
      info.config.gameType === GameType.Singleplayer;
  };

  connectedCallback() {
    super.connectedCallback();
    if (!DEV_PANEL_ENABLED) {
      this.style.display = "none";
      return;
    }
    this.loadSavedDefaults();
    document.addEventListener("join-lobby", this.handleJoinLobby);
  }

  disconnectedCallback() {
    document.removeEventListener("join-lobby", this.handleJoinLobby);
    super.disconnectedCallback();
  }

  static styles = css`
    :host {
      position: fixed;
      top: 80px;
      right: 16px;
      z-index: 9999;
      font-family:
        "Inter",
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    .panel {
      width: 320px;
      background: rgba(15, 23, 42, 0.9);
      color: #f8fafc;
      border: 1px solid rgba(148, 163, 184, 0.4);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.7);
      backdrop-filter: blur(12px);
      overflow: hidden;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background: rgba(51, 65, 85, 0.9);
      border-bottom: 1px solid rgba(148, 163, 184, 0.4);
      font-size: 0.95rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    header button {
      background: transparent;
      border: none;
      color: inherit;
      cursor: pointer;
      font-size: 0.85rem;
    }

    .body {
      max-height: 540px;
      overflow-y: auto;
      padding: 0.75rem 1rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 8px;
      padding: 0.5rem 0.75rem;
    }

    .field label {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #cbd5f5;
    }

    .field input[type="range"] {
      width: 100%;
    }

    .field input[type="number"] {
      width: 100%;
      padding: 0.25rem 0.4rem;
      border-radius: 6px;
      border: 1px solid rgba(148, 163, 184, 0.4);
      background: rgba(15, 23, 42, 0.8);
      color: inherit;
      font-size: 0.85rem;
    }

    .description {
      font-size: 0.7rem;
      color: #94a3b8;
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .actions button {
      flex: 1;
      min-width: 90px;
      border: none;
      border-radius: 6px;
      padding: 0.45rem 0.5rem;
      font-size: 0.8rem;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .apply {
      background: #0ea5e9;
      color: #0f172a;
    }

    .reset {
      background: rgba(148, 163, 184, 0.2);
      color: #e2e8f0;
    }

    .save-defaults {
      background: #facc15;
      color: #78350f;
    }

    .restart {
      background: #f97316;
      color: #0f172a;
    }

    .restart[disabled] {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .status {
      font-size: 0.7rem;
      color: #a5f3fc;
      text-align: right;
    }
  `;

  render() {
    if (!DEV_PANEL_ENABLED) {
      return html``;
    }

    return html`
      <div class="panel">
        <header>
          <span>Frenzy Dev Panel</span>
          <button @click=${this.toggleCollapse}>
            ${this.isCollapsed ? "Expand" : "Collapse"}
          </button>
        </header>
        ${this.isCollapsed
          ? html``
          : html`
              <div class="body">
                ${CONFIG_FIELDS.map((field) => this.renderField(field))}
                <div class="actions">
                  <button class="apply" @click=${this.applyConfig}>
                    Apply
                  </button>
                  <button class="save-defaults" @click=${this.saveAsDefaults}>
                    Save Defaults
                  </button>
                  <button class="reset" @click=${this.resetDefaults}>
                    Reset
                  </button>
                  <button
                    class="restart"
                    ?disabled=${!this.canRestart}
                    @click=${this.requestRestart}
                  >
                    Restart
                  </button>
                </div>
                ${this.lastAppliedAt || this.lastSavedAt
                  ? html`<div class="status">
                      ${this.lastAppliedAt
                        ? html`<div>
                            Applied ${timeSince(this.lastAppliedAt)} ago
                          </div>`
                        : html``}
                      ${this.lastSavedAt
                        ? html`<div>
                            Defaults saved ${timeSince(this.lastSavedAt)} ago
                          </div>`
                        : html``}
                    </div>`
                  : html``}
              </div>
            `}
      </div>
    `;
  }

  private renderField(field: ConfigField) {
    const value = this.getFieldValue(field);
    return html`
      <div class="field">
        <label>
          ${field.label}
          <span>
            ${Number(value).toFixed(
              field.step < 1
                ? Math.max(1, `${field.step}`.split(".")[1].length)
                : 0,
            )}
          </span>
        </label>
        <input
          type="range"
          min=${field.min}
          max=${field.max}
          step=${field.step}
          .value=${String(value)}
          @input=${(event: Event) => this.handleRangeChange(field, event)}
        />
        <input
          type="number"
          min=${field.min}
          max=${field.max}
          step=${field.step}
          .value=${String(value)}
          @change=${(event: Event) => this.handleNumberChange(field, event)}
        />
        ${field.description
          ? html`<div class="description">${field.description}</div>`
          : html``}
      </div>
    `;
  }

  private getFieldKey(field: ConfigField): string {
    if (field.type === "unit") {
      return `units.${field.unitType}.${field.property}`;
    }
    return field.key;
  }

  private getFieldValue(field: ConfigField): number {
    if (field.type === "unit") {
      const unitConfig = this.config.units[field.unitType];
      return (unitConfig as any)[field.property] ?? 0;
    }
    return this.config[field.key] as number;
  }

  private handleRangeChange(field: ConfigField, event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    this.updateConfigField(field, value);
  }

  private handleNumberChange(field: ConfigField, event: Event) {
    const input = event.target as HTMLInputElement;
    const rawValue = Number(input.value);
    const clamped = clamp(rawValue, field.min, field.max);
    input.value = String(clamped);
    this.updateConfigField(field, clamped);
  }

  private updateConfigField(field: ConfigField, value: number) {
    if (field.type === "unit") {
      this.config = {
        ...this.config,
        units: {
          ...this.config.units,
          [field.unitType]: {
            ...this.config.units[field.unitType],
            [field.property]: value,
          },
        },
      };
    } else {
      this.config = {
        ...this.config,
        [field.key]: value,
      };
    }
  }

  private applyConfig() {
    document.dispatchEvent(
      new CustomEvent(FRENZY_CONFIG_EVENT, {
        bubbles: true,
        composed: true,
        detail: { ...this.config },
      }),
    );
    this.lastAppliedAt = Date.now();
  }

  private resetDefaults() {
    const saved = readSavedDefaults();
    if (saved) {
      this.config = { ...saved.config };
      this.lastSavedAt = saved.savedAt;
    } else {
      this.config = { ...DEFAULT_FRENZY_CONFIG };
      this.lastSavedAt = null;
    }
  }

  private saveAsDefaults() {
    const snapshot = persistDefaults(this.config);
    if (snapshot) {
      this.lastSavedAt = snapshot.savedAt;
    }
  }

  private requestRestart() {
    if (!this.canRestart) {
      return;
    }
    document.dispatchEvent(
      new CustomEvent(FRENZY_RESTART_EVENT, {
        bubbles: true,
        composed: true,
        detail: {
          source: "frenzy-dev-panel",
        },
      }),
    );
  }

  private toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
  }

  private loadSavedDefaults() {
    const saved = readSavedDefaults();
    if (saved) {
      this.config = { ...saved.config };
      this.lastSavedAt = saved.savedAt;
    } else {
      this.config = { ...DEFAULT_FRENZY_CONFIG };
      this.lastSavedAt = null;
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function timeSince(timestamp: number) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function shouldEnableDevPanel(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const host = window.location.hostname;
  if (["localhost", "127.0.0.1", "0.0.0.0"].includes(host)) {
    return true;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.has("frenzyDev")) {
    return true;
  }
  try {
    return localStorage.getItem("frenzy-dev-panel") === "true";
  } catch (error) {
    console.warn("Unable to read frenzy dev panel flag", error);
    return false;
  }
}

interface StoredDefaultsSnapshot {
  config: FrenzyConfig;
  savedAt: number;
}

function readSavedDefaults(): StoredDefaultsSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(CUSTOM_DEFAULTS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const merged = sanitizeConfig((parsed as any).config ?? {});
    const savedAt =
      typeof (parsed as any).savedAt === "number"
        ? (parsed as any).savedAt
        : Date.now();
    return { config: merged, savedAt };
  } catch (error) {
    console.warn("Unable to read saved Frenzy defaults", error);
    return null;
  }
}

function persistDefaults(config: FrenzyConfig): StoredDefaultsSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const snapshot: StoredDefaultsSnapshot = {
      config: sanitizeConfig(config),
      savedAt: Date.now(),
    };
    window.localStorage.setItem(
      CUSTOM_DEFAULTS_STORAGE_KEY,
      JSON.stringify(snapshot),
    );
    return snapshot;
  } catch (error) {
    console.warn("Unable to store Frenzy defaults", error);
    return null;
  }
}

function sanitizeConfig(partial: Partial<FrenzyConfig>): FrenzyConfig {
  const merged: FrenzyConfig = {
    ...DEFAULT_FRENZY_CONFIG,
    units: {
      // Mobile units
      soldier: { ...DEFAULT_FRENZY_CONFIG.units.soldier },
      eliteSoldier: { ...DEFAULT_FRENZY_CONFIG.units.eliteSoldier },
      warship: { ...DEFAULT_FRENZY_CONFIG.units.warship },
      eliteWarship: { ...DEFAULT_FRENZY_CONFIG.units.eliteWarship },
      transporter: { ...DEFAULT_FRENZY_CONFIG.units.transporter },
      // Towers
      defensePost: { ...DEFAULT_FRENZY_CONFIG.units.defensePost },
      eliteDefensePost: { ...DEFAULT_FRENZY_CONFIG.units.eliteDefensePost },
      samLauncher: { ...DEFAULT_FRENZY_CONFIG.units.samLauncher },
      missileSilo: { ...DEFAULT_FRENZY_CONFIG.units.missileSilo },
      shieldGenerator: { ...DEFAULT_FRENZY_CONFIG.units.shieldGenerator },
      eliteShieldGenerator: {
        ...DEFAULT_FRENZY_CONFIG.units.eliteShieldGenerator,
      },
      artillery: { ...DEFAULT_FRENZY_CONFIG.units.artillery },
      eliteArtillery: { ...DEFAULT_FRENZY_CONFIG.units.eliteArtillery },
    },
  };

  // Handle simple number fields
  (Object.keys(partial) as Array<keyof FrenzyConfig>).forEach((key) => {
    if (key === "units") return; // Handle units separately
    const value = partial[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      (merged as any)[key] = value;
    }
  });

  // Handle nested unit configs
  if (partial.units) {
    (
      [
        "soldier",
        "eliteSoldier",
        "warship",
        "eliteWarship",
        "transporter",
        "defensePost",
        "eliteDefensePost",
        "samLauncher",
        "missileSilo",
        "shieldGenerator",
        "eliteShieldGenerator",
        "artillery",
        "eliteArtillery",
      ] as const
    ).forEach((unitType) => {
      const unitConfig = partial.units?.[unitType];
      if (unitConfig) {
        Object.keys(unitConfig).forEach((prop) => {
          const value = (unitConfig as any)[prop];
          if (typeof value === "number" && Number.isFinite(value)) {
            (merged.units[unitType] as any)[prop] = value;
          }
        });
      }
    });
  }

  return merged;
}
