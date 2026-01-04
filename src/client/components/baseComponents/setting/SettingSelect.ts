import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

export interface SelectOption {
  value: string;
  label: string;
}

@customElement("setting-select")
export class SettingSelect extends LitElement {
  @property() label = "Setting";
  @property() description = "";
  @property() id = "";
  @property({ type: String }) value = "";
  @property({ type: Array }) options: SelectOption[] = [];

  createRenderRoot() {
    return this;
  }

  private handleChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    this.value = select.value;
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: { value: this.value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    return html`
      <div class="setting-item vertical">
        <div
          class="select-row"
          style="display: flex; justify-content: space-between; align-items: center;"
        >
          <label class="setting-label" for=${this.id}>${this.label}</label>
          <select
            id=${this.id}
            class="setting-select"
            style="background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 4px 8px; cursor: pointer;"
            .value=${this.value}
            @change=${this.handleChange}
          >
            ${this.options.map(
              (opt) => html`
                <option
                  value=${opt.value}
                  ?selected=${opt.value === this.value}
                  style="background: #1a1a2e; color: white;"
                >
                  ${opt.label}
                </option>
              `,
            )}
          </select>
        </div>
        <div class="setting-description">${this.description}</div>
      </div>
    `;
  }
}
