import { LitElement, html } from "lit";
import { customElement, query } from "lit/decorators.js";
import { getAltKey, getModifierKey, translateText } from "../client/Utils";
import "./components/Difficulties";
import "./components/Maps";

// Import icons for webpack to resolve paths correctly
import airportIcon from "../../resources/images/AirportIconWhite.svg";
import transporterIcon from "../../resources/images/AirtransporterWhite.svg";
import allianceIcon from "../../resources/images/AllianceIconWhite.svg";
import boatIcon from "../../resources/images/BoatIconWhite.svg";
import buildIcon from "../../resources/images/BuildIconWhite.svg";
import chatIcon from "../../resources/images/ChatIconWhite.svg";
import donateGoldIcon from "../../resources/images/DonateGoldIconWhite.svg";
import donateTroopIcon from "../../resources/images/DonateTroopIconWhite.svg";
import emojiIcon from "../../resources/images/EmojiIconWhite.svg";
import harborIcon from "../../resources/images/HarborIconWhite.svg";
import mineIcon from "../../resources/images/MineIconWhite.svg";
import missileSiloIcon from "../../resources/images/MissileSiloIconWhite.svg";
import hydrogenBombIcon from "../../resources/images/MushroomCloudIconWhite.svg";
import atomBombIcon from "../../resources/images/NukeIconWhite.svg";
import samLauncherIcon from "../../resources/images/SamLauncherIconWhite.svg";
import shieldIcon from "../../resources/images/ShieldIconWhite.svg";
import shipIcon from "../../resources/images/ShipIconWhite.svg";
import targetIcon from "../../resources/images/TargetIconWhite.svg";
import betrayIcon from "../../resources/images/TraitorIconWhite.svg";
import unitFactoryIcon from "../../resources/images/UnitFactoryIconWhite.svg";

@customElement("help-modal")
export class HelpModal extends LitElement {
  @query("o-modal") private modalEl!: HTMLElement & {
    open: () => void;
    close: () => void;
  };

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.handleKeyDown);
    super.disconnectedCallback();
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Escape") {
      e.preventDefault();
      this.close();
    }
  };

  render() {
    return html`
      <o-modal
        id="helpModal"
        title="Instructions"
        translationKey="main.instructions"
      >
        <div class="text-2xl font-bold text-center mb-4">
          ${translateText("help_modal.frenzy_title")}
        </div>
        <div class="flex flex-col gap-4">
          <p>${translateText("help_modal.frenzy_intro")}</p>
          <ul>
            <li class="mb-4">
              <strong>${translateText("help_modal.frenzy_hq_title")}</strong>
              <p>${translateText("help_modal.frenzy_hq_desc")}</p>
            </li>
            <li class="mb-4">
              <strong>${translateText("help_modal.frenzy_gold_title")}</strong>
              <p>${translateText("help_modal.frenzy_gold_desc")}</p>
            </li>
            <li class="mb-4">
              <strong
                >${translateText("help_modal.frenzy_towers_title")}</strong
              >
              <p>${translateText("help_modal.frenzy_towers_desc")}</p>
            </li>
            <li class="mb-4">
              <strong
                >${translateText("help_modal.frenzy_upgrades_title")}</strong
              >
              <p>${translateText("help_modal.frenzy_upgrades_desc")}</p>
            </li>
          </ul>
        </div>

        <hr class="mt-6 mb-4" />

        <div>
          <div class="text-2xl font-bold mb-4 text-center">
            ${translateText("help_modal.build_menu_title")}
          </div>
          <p class="mb-4">${translateText("help_modal.build_menu_desc")}</p>
          <table>
            <thead>
              <tr>
                <th>${translateText("help_modal.build_name")}</th>
                <th>${translateText("help_modal.build_icon")}</th>
                <th>${translateText("help_modal.build_desc")}</th>
              </tr>
            </thead>
            <tbody class="text-left">
              <tr>
                <td>${translateText("help_modal.build_city")}</td>
                <td><img src="${mineIcon}" alt="Mine" class="icon" /></td>
                <td>${translateText("help_modal.build_city_desc")}</td>
              </tr>
              <tr>
                <td>${translateText("help_modal.build_factory")}</td>
                <td>
                  <img src="${unitFactoryIcon}" alt="Factory" class="icon" />
                </td>
                <td>${translateText("help_modal.build_factory_desc")}</td>
              </tr>
              <tr>
                <td>${translateText("help_modal.build_airport")}</td>
                <td>
                  <img src="${airportIcon}" alt="Airport" class="icon" />
                </td>
                <td>${translateText("help_modal.build_airport_desc")}</td>
              </tr>
              <tr>
                <td>${translateText("help_modal.build_transporter")}</td>
                <td>
                  <img
                    src="${transporterIcon}"
                    alt="Transporter"
                    class="icon"
                  />
                </td>
                <td>${translateText("help_modal.build_transporter_desc")}</td>
              </tr>
              <tr>
                <td>${translateText("help_modal.build_port")}</td>
                <td><img src="${harborIcon}" alt="Port" class="icon" /></td>
                <td>${translateText("help_modal.build_port_desc")}</td>
              </tr>
              <tr>
                <td>${translateText("help_modal.build_warship")}</td>
                <td><img src="${shipIcon}" alt="Warship" class="icon" /></td>
                <td>${translateText("help_modal.build_warship_desc")}</td>
              </tr>
              <tr>
                <td>${translateText("help_modal.build_defense")}</td>
                <td>
                  <img src="${shieldIcon}" alt="Defense Post" class="icon" />
                </td>
                <td>${translateText("help_modal.build_defense_desc")}</td>
              </tr>
              <tr>
                <td>${translateText("help_modal.build_sam")}</td>
                <td>
                  <img
                    src="${samLauncherIcon}"
                    alt="SAM Launcher"
                    class="icon"
                  />
                </td>
                <td>${translateText("help_modal.build_sam_desc")}</td>
              </tr>
              <tr>
                <td>${translateText("help_modal.build_silo")}</td>
                <td>
                  <img
                    src="${missileSiloIcon}"
                    alt="Missile Silo"
                    class="icon"
                  />
                </td>
                <td>${translateText("help_modal.build_silo_desc")}</td>
              </tr>
              <tr>
                <td>${translateText("help_modal.build_atom")}</td>
                <td>
                  <img src="${atomBombIcon}" alt="Atom Bomb" class="icon" />
                </td>
                <td>${translateText("help_modal.build_atom_desc")}</td>
              </tr>
              <tr>
                <td>${translateText("help_modal.build_hydrogen")}</td>
                <td>
                  <img
                    src="${hydrogenBombIcon}"
                    alt="Hydrogen Bomb"
                    class="icon"
                  />
                </td>
                <td>${translateText("help_modal.build_hydrogen_desc")}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <hr class="mt-6 mb-4" />

        <div class="flex flex-col items-center">
          <div class="text-center text-2xl font-bold mb-4">
            ${translateText("help_modal.hotkeys")}
          </div>
          <table>
            <thead>
              <tr>
                <th>${translateText("help_modal.table_key")}</th>
                <th>${translateText("help_modal.table_action")}</th>
              </tr>
            </thead>
            <tbody class="text-left">
              <tr>
                <td><span class="key">Space</span></td>
                <td>${translateText("help_modal.action_alt_view")}</td>
              </tr>
              <tr>
                <td>
                  <div class="scroll-combo-horizontal">
                    <span class="key">⇧ Shift</span>
                    <span class="plus">+</span>
                    <div class="mouse-shell alt-left-click">
                      <div class="mouse-left-corner"></div>
                      <div class="mouse-wheel"></div>
                    </div>
                  </div>
                </td>
                <td>${translateText("help_modal.action_attack_altclick")}</td>
              </tr>
              <tr>
                <td>
                  <div class="scroll-combo-horizontal">
                    <span class="key">${getModifierKey()}</span>
                    <span class="plus">+</span>
                    <div class="mouse-shell alt-left-click">
                      <div class="mouse-left-corner"></div>
                      <div class="mouse-wheel"></div>
                    </div>
                  </div>
                </td>
                <td>${translateText("help_modal.action_build")}</td>
              </tr>
              <tr>
                <td>
                  <div class="scroll-combo-horizontal">
                    <span class="key">${getAltKey()}</span>
                    <span class="plus">+</span>
                    <div class="mouse-shell alt-left-click">
                      <div class="mouse-left-corner"></div>
                      <div class="mouse-wheel"></div>
                    </div>
                  </div>
                </td>
                <td>${translateText("help_modal.action_emote")}</td>
              </tr>
              <tr>
                <td><span class="key">C</span></td>
                <td>${translateText("help_modal.action_center")}</td>
              </tr>
              <tr>
                <td><span class="key">Q</span> / <span class="key">E</span></td>
                <td>${translateText("help_modal.action_zoom")}</td>
              </tr>
              <tr>
                <td>
                  <span class="key">W</span> <span class="key">A</span>
                  <span class="key">S</span> <span class="key">D</span>
                </td>
                <td>${translateText("help_modal.action_move_camera")}</td>
              </tr>
              <tr>
                <td><span class="key">1</span> / <span class="key">2</span></td>
                <td>${translateText("help_modal.action_ratio_change")}</td>
              </tr>
              <tr>
                <td>
                  <div class="scroll-combo-horizontal">
                    <span class="key">⇧ Shift</span>
                    <span class="plus">+</span>
                    <div class="mouse-with-arrows">
                      <div class="mouse-shell">
                        <div class="mouse-wheel" id="highlighted-wheel"></div>
                      </div>
                      <div class="mouse-arrows-side">
                        <div class="arrow">↑</div>
                        <div class="arrow">↓</div>
                      </div>
                    </div>
                  </div>
                </td>
                <td>${translateText("help_modal.action_ratio_change")}</td>
              </tr>
              <tr>
                <td>
                  <span class="key">${getAltKey()}</span> +
                  <span class="key">R</span>
                </td>
                <td>${translateText("help_modal.action_reset_gfx")}</td>
              </tr>
              <tr>
                <td>
                  <div class="mouse-shell">
                    <div class="mouse-wheel" id="highlighted-wheel"></div>
                  </div>
                </td>
                <td>${translateText("help_modal.action_auto_upgrade")}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <hr class="mt-6 mb-4" />

        <div class="text-2xl font-bold text-center mb-4">
          ${translateText("help_modal.ui_section")}
        </div>
        <div class="flex flex-col md:flex-row gap-4">
          <div class="flex flex-col items-center">
            <div class="text-gray-300 font-bold">
              ${translateText("help_modal.ui_leaderboard")}
            </div>
            <img
              src="/images/helpModal/leaderboard2.webp"
              alt="Leaderboard"
              title="Leaderboard"
              class="default-image"
              loading="lazy"
            />
          </div>
          <div>
            <p>${translateText("help_modal.ui_leaderboard_desc")}</p>
          </div>
        </div>

        <hr class="mt-6 mb-4" />

        <div class="flex flex-col md:flex-row gap-4">
          <div class="flex flex-col items-center w-full md:w-[80%]">
            <div class="text-gray-300 font-bold">
              ${translateText("help_modal.ui_control")}
            </div>
            <img
              src="/images/helpModal/controlPanel.webp"
              alt="Control panel"
              title="Control panel"
              class="default-image"
              loading="lazy"
            />
          </div>
          <div>
            <p class="mb-4">${translateText("help_modal.ui_control_desc")}</p>
            <ul>
              <li class="mb-4">${translateText("help_modal.ui_gold")}</li>
              <li class="mb-4">
                ${translateText("help_modal.ui_attack_ratio")}
              </li>
            </ul>
          </div>
        </div>

        <hr class="mt-6 mb-4" />

        <div class="flex flex-col md:flex-row gap-4">
          <div class="flex flex-col items-center">
            <div class="text-gray-300 font-bold">
              ${translateText("help_modal.ui_events")}
            </div>
            <div class="flex flex-col gap-4">
              <img
                src="/images/helpModal/eventsPanel.webp"
                alt="Event panel"
                title="Event panel"
                class="default-image"
                loading="lazy"
              />
              <img
                src="/images/helpModal/eventsPanelAttack.webp"
                alt="Event panel"
                title="Event panel"
                class="default-image"
                loading="lazy"
              />
            </div>
          </div>
          <div>
            <p class="mb-4">${translateText("help_modal.ui_events_desc")}</p>
            <ul>
              <li class="mb-4">
                ${translateText("help_modal.ui_events_alliance")}
              </li>
              <li class="mb-4">
                ${translateText("help_modal.ui_events_attack")}
              </li>
              <li class="mb-4">
                ${translateText("help_modal.ui_events_quickchat")}
              </li>
            </ul>
          </div>
        </div>

        <hr class="mt-6 mb-4" />

        <div class="flex flex-col md:flex-row gap-4">
          <div class="flex flex-col items-center">
            <div class="text-gray-300 font-bold">
              ${translateText("help_modal.ui_options")}
            </div>
            <img
              src="/images/helpModal/options2.webp"
              alt="Options"
              title="Options"
              class="default-image"
              loading="lazy"
            />
          </div>
          <div>
            <p class="mb-4">${translateText("help_modal.ui_options_desc")}</p>
            <ul>
              <li class="mb-4">${translateText("help_modal.option_pause")}</li>
              <li class="mb-4">${translateText("help_modal.option_timer")}</li>
              <li class="mb-4">${translateText("help_modal.option_exit")}</li>
              <li class="mb-4">
                ${translateText("help_modal.option_settings")}
              </li>
            </ul>
          </div>
        </div>

        <hr class="mt-6 mb-4" />

        <div class="text-2xl font-bold mb-4 text-center">
          ${translateText("help_modal.radial_title")}
        </div>

        <div class="flex flex-col md:flex-row gap-4">
          <div class="flex flex-col gap-4">
            <img
              src="/images/helpModal/radialMenu2.webp"
              alt="Radial menu"
              title="Radial menu"
              class="default-image"
              loading="lazy"
            />
            <img
              src="/images/helpModal/radialMenuAlly.webp"
              alt="Radial menu ally"
              title="Radial menu ally"
              class="default-image"
              loading="lazy"
            />
          </div>
          <div>
            <p class="mb-4">${translateText("help_modal.radial_desc")}</p>
            <ul>
              <li class="mb-4">
                <img src="${buildIcon}" alt="Build" class="inline-block icon" />
                <span>${translateText("help_modal.radial_build")}</span>
              </li>
              <li class="mb-4">
                <img
                  src="/images/InfoIcon.svg"
                  class="inline-block icon"
                  style="fill: white; background: transparent;"
                  loading="lazy"
                />
                <span>${translateText("help_modal.radial_info")}</span>
              </li>
              <li class="mb-4">
                <img src="${boatIcon}" alt="Boat" class="inline-block icon" />
                <span>${translateText("help_modal.radial_boat")}</span>
              </li>
              <li class="mb-4">
                <img
                  src="${allianceIcon}"
                  alt="Alliance"
                  class="inline-block icon"
                />
                <span>${translateText("help_modal.info_alliance")}</span>
              </li>
              <li class="mb-4">
                <img
                  src="${betrayIcon}"
                  alt="Betray"
                  class="inline-block icon"
                />
                <span>${translateText("help_modal.ally_betray")}</span>
              </li>
            </ul>
          </div>
        </div>

        <hr class="mt-6 mb-4" />

        <div>
          <div class="text-2xl font-bold mb-4 text-center">
            ${translateText("help_modal.info_title")}
          </div>

          <div class="flex flex-col md:flex-row gap-4">
            <div class="flex flex-col items-center w-full md:w-[62%]">
              <div class="text-gray-300 font-bold">
                ${translateText("help_modal.info_enemy_panel")}
              </div>
              <img
                src="/images/helpModal/infoMenu2.webp"
                alt="Enemy info panel"
                title="Enemy info panel"
                class="info-panel-img"
                loading="lazy"
              />
            </div>
            <div class="pt-4">
              <p class="mb-4">${translateText("help_modal.info_enemy_desc")}</p>
              <ul>
                <li class="mb-4">
                  <img src="${chatIcon}" alt="Chat" class="inline-block icon" />
                  <span>${translateText("help_modal.info_chat")}</span>
                </li>
                <li class="mb-4">
                  <img
                    src="${targetIcon}"
                    alt="Target"
                    class="inline-block icon"
                  />
                  <span>${translateText("help_modal.info_target")}</span>
                </li>
                <li class="mb-4">
                  <img
                    src="${allianceIcon}"
                    alt="Alliance"
                    class="inline-block icon"
                  />
                  <span>${translateText("help_modal.info_alliance")}</span>
                </li>
                <li class="mb-4">
                  <img
                    src="${emojiIcon}"
                    alt="Emoji"
                    class="inline-block icon"
                  />
                  <span>${translateText("help_modal.info_emoji")}</span>
                </li>
                <li class="mb-4">
                  <div class="inline-block icon">
                    <img src="/images/helpModal/stopTrading.webp" />
                  </div>
                  <span>${translateText("help_modal.info_trade")}</span>
                </li>
              </ul>
            </div>
          </div>

          <hr class="mt-6 mb-4" />

          <div class="flex flex-col md:flex-row gap-4">
            <div class="flex flex-col items-center w-full md:w-[62%]">
              <div class="text-gray-300 font-bold">
                ${translateText("help_modal.info_ally_panel")}
              </div>
              <img
                src="/images/helpModal/infoMenu2Ally.webp"
                alt="Ally info panel"
                title="Ally info panel"
                class="info-panel-img"
                loading="lazy"
              />
            </div>
            <div class="pt-4">
              <p class="mb-4">${translateText("help_modal.info_ally_desc")}</p>
              <ul>
                <li class="mb-4">
                  <img
                    src="${betrayIcon}"
                    alt="Betray"
                    class="inline-block icon"
                  />
                  <span>${translateText("help_modal.ally_betray")}</span>
                </li>
                <li class="mb-4">
                  <img
                    src="${donateTroopIcon}"
                    alt="Donate Troops"
                    class="inline-block icon"
                  />
                  <span>${translateText("help_modal.ally_donate")}</span>
                </li>
                <li class="mb-4">
                  <img
                    src="${donateGoldIcon}"
                    alt="Donate Gold"
                    class="inline-block icon"
                  />
                  <span>${translateText("help_modal.ally_donate_gold")}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <hr class="mt-6 mb-4" />

        <div>
          <div class="text-2xl mb-4 font-bold text-center">
            ${translateText("help_modal.player_icons")}
          </div>
          <p class="mb-2">${translateText("help_modal.icon_desc")}</p>

          <div class="flex flex-col md:flex-row gap-4 mt-4">
            <div
              class="flex flex-col items-center w-full md:w-1/3 mb-2 md:mb-0"
            >
              <div
                class="text-gray-300 flex flex-col justify-start min-h-[3rem] w-full px-2 mb-1"
              >
                ${translateText("help_modal.icon_crown")}
              </div>
              <img
                src="/images/helpModal/crown.webp"
                alt="Number 1 player"
                title="Number 1 player"
                class="player-icon-img w-full"
                loading="lazy"
              />
            </div>

            <div
              class="flex flex-col items-center w-full md:w-1/3 mb-2 md:mb-0"
            >
              <div
                class="text-gray-300 flex flex-col justify-start min-h-[3rem] w-full px-2 mb-1"
              >
                ${translateText("help_modal.icon_traitor")}
              </div>
              <img
                src="/images/helpModal/traitor2.webp"
                alt="Traitor"
                title="Traitor"
                class="player-icon-img w-full"
                loading="lazy"
              />
            </div>

            <div
              class="flex flex-col items-center w-full md:w-1/3 mb-2 md:mb-0"
            >
              <div
                class="text-gray-300 flex flex-col justify-start min-h-[3rem] w-full px-2 mb-1"
              >
                ${translateText("help_modal.icon_ally")}
              </div>
              <img
                src="/images/helpModal/ally2.webp"
                alt="Ally"
                title="Ally"
                class="player-icon-img w-full"
                loading="lazy"
              />
            </div>
          </div>

          <div class="flex flex-col md:flex-row gap-4 mt-4 md:justify-center">
            <div
              class="flex flex-col items-center w-full md:w-1/3 mb-2 md:mb-0"
            >
              <div
                class="text-gray-300 flex flex-col justify-start min-h-[3rem] w-full px-2 mb-1"
              >
                ${translateText("help_modal.icon_embargo")}
              </div>
              <img
                src="/images/helpModal/embargo.webp"
                alt="Stopped trading"
                title="Stopped trading"
                class="player-icon-img w-full"
                loading="lazy"
              />
            </div>

            <div
              class="flex flex-col items-center w-full md:w-1/3 mb-2 md:mb-0"
            >
              <div
                class="text-gray-300 flex flex-col justify-start min-h-[3rem] w-full px-2 mb-1"
              >
                ${translateText("help_modal.icon_request")}
              </div>
              <img
                src="/images/helpModal/allianceRequest.webp"
                alt="Alliance Request"
                title="Alliance Request"
                class="player-icon-img w-full"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </o-modal>
    `;
  }

  public open() {
    this.modalEl?.open();
  }

  public close() {
    this.modalEl?.close();
  }
}
