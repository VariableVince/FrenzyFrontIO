import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import Countries from "../data/countries.json";

const flagKey: string = "flag";

@customElement("flag-input")
export class FlagInput extends LitElement {
  @state() private flag: string = "";
  @state() private search: string = "";
  @state() private showModal: boolean = false;

  static styles = css`
    .hidden {
      display: none;
    }

    .flag-container {
      display: flex;
    }

    .no-selected-flag {
      position: absolute;
      left: 8px;
      top: 8px;
      height: 50px;
      border-radius: 0.75rem;
      border: none;
      background: none;
      font-size: 1rem;
      cursor: pointer;
    }

    .selected-flag {
      width: 48px;
      cursor: pointer;
      position: absolute;
      left: 24px;
      top: 14px;
      border: 1px solid black;
    }

    .flag-modal {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      position: absolute;
      top: 60px;
      left: 0;
      width: 560px;
      height: 500px;
      max-height: 50vh;
      background-color: rgb(35 35 35 / 0.8);
      -webkit-backdrop-filter: blur(12px);
      backdrop-filter: blur(12px);
      padding: 10px;
      border-radius: 8px;
    }

    .flag-search {
      height: 2rem;
      border-radius: 8px;
      border: none;
      text-align: center;
      font-size: 1.3rem;
    }

    .flag-dropdown {
      overflow-y: auto;
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .dropdown-item {
      opacity: 0.7;
      width: calc(100% / 4 - 15px);
      text-align: center;
      color: white;
      cursor: pointer;
      border: none;
      background: none;
    }

    .dropdown-item:hover {
      opacity: 1;
    }

    .country-flag {
      width: 100%;
      height: auto;
    }

    @media (max-width: 768px) {
      .flag-modal {
        left: 0px;
        width: calc(100% - 16px);
        height: 50vh;
      }

      .dropdown-item {
        width: calc(100% / 3 - 15px);
      }
    }
  `;

  private handleSearch(e: Event) {
    this.search = String((e.target as HTMLInputElement).value);
  }

  private setFlag(flag: string) {
    this.flag = flag;
    this.showModal = false;
    this.storeFlag(flag);
  }

  public getCurrentFlag(): string {
    return this.flag;
  }

  private getStoredFlag(): string {
    const storedFlag = localStorage.getItem(flagKey);
    if (storedFlag) {
      return storedFlag;
    }
    return "";
  }

  private storeFlag(flag: string) {
    if (flag) {
      localStorage.setItem(flagKey, flag);
    } else if (flag === "") {
      localStorage.removeItem(flagKey);
    }
  }

  private dispatchFlagEvent() {
    this.dispatchEvent(
      new CustomEvent("flag-change", {
        detail: { flag: this.flag },
        bubbles: true,
        composed: true,
      }),
    );
  }

  connectedCallback() {
    super.connectedCallback();
    this.flag = this.getStoredFlag();
    this.dispatchFlagEvent();
  }

  render() {
    return html`
      <div class="flag-container">
        ${this.flag === ""
          ? html` <button
              class="no-selected-flag"
              @click=${() => (this.showModal = true)}
            >
              Flags
            </button>`
          : html`<img
              class="selected-flag"
              src="flags/${this.flag}.svg"
              @click=${() => (this.showModal = true)}
            />`}
        ${this.showModal
          ? html`
              <div class="flag-modal ${this.showModal ? "" : "hidden"}">
                <input
                  class="flag-search"
                  type="text"
                  placeholder="Search..."
                  @change=${this.handleSearch}
                  @keyup=${this.handleSearch}
                />
                <div class="flag-dropdown">
                  <!-- Show each flag as button -->
                  <button
                    @click=${() => this.setFlag("")}
                    class="dropdown-item"
                  >
                    <img class="country-flag" src="flags/xx.svg" />
                    <span class="country-name">None</span>
                  </button>
                  ${Countries.filter(
                    (country) =>
                      country.name
                        .toLowerCase()
                        .includes(this.search.toLowerCase()) ||
                      country.code
                        .toLowerCase()
                        .includes(this.search.toLowerCase()),
                  ).map(
                    (country) => html`
                      <button
                        @click=${() => this.setFlag(country.code)}
                        class="dropdown-item"
                      >
                        <img
                          class="country-flag"
                          src="flags/${country.code}.svg"
                        />
                        <span class="country-name">${country.name}</span>
                      </button>
                    `,
                  )}
                </div>
              </div>
            `
          : ""}
      </div>
    `;
  }
}
