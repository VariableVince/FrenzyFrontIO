import { Config } from "../../../core/configuration/Config";
import { AllPlayers, PlayerActions, UnitType } from "../../../core/game/Game";
import { TileRef } from "../../../core/game/GameMap";
import { GameView, PlayerView } from "../../../core/game/GameView";
import { Emoji, flattenedEmojiTable } from "../../../core/Util";
import { renderNumber, translateText } from "../../Utils";
import { UIState } from "../UIState";
import { BuildItemDisplay, BuildMenu, flattenedBuildTable } from "./BuildMenu";
import { ChatIntegration } from "./ChatIntegration";
import { EmojiTable } from "./EmojiTable";
import { PlayerActionHandler } from "./PlayerActionHandler";
import { PlayerPanel } from "./PlayerPanel";
import { TooltipItem } from "./RadialMenu";

import airtransportIcon from "../../../../resources/images/AirtransportIconWhite.svg";
import allianceIcon from "../../../../resources/images/AllianceIconWhite.svg";
import boatIcon from "../../../../resources/images/BoatIconWhite.svg";
import buildIcon from "../../../../resources/images/BuildIconWhite.svg";
import chatIcon from "../../../../resources/images/ChatIconWhite.svg";
import donateGoldIcon from "../../../../resources/images/DonateGoldIconWhite.svg";
import donateTroopIcon from "../../../../resources/images/DonateTroopIconWhite.svg";
import emojiIcon from "../../../../resources/images/EmojiIconWhite.svg";
import infoIcon from "../../../../resources/images/InfoIcon.svg";
import shieldIcon from "../../../../resources/images/ShieldIconWhite.svg";
import swordIcon from "../../../../resources/images/SwordIconWhite.svg";
import targetIcon from "../../../../resources/images/TargetIconWhite.svg";
import traitorIcon from "../../../../resources/images/TraitorIconWhite.svg";
import xIcon from "../../../../resources/images/XIcon.svg";
import { EventBus } from "../../../core/EventBus";
import { MoveTransporterIntentEvent } from "../../Transport";

export interface MenuElementParams {
  myPlayer: PlayerView;
  selected: PlayerView | null;
  tile: TileRef;
  playerActions: PlayerActions;
  game: GameView;
  buildMenu: BuildMenu;
  emojiTable: EmojiTable;
  playerActionHandler: PlayerActionHandler;
  playerPanel: PlayerPanel;
  chatIntegration: ChatIntegration;
  eventBus: EventBus;
  closeMenu: () => void;
  uiState?: UIState;
}

export interface MenuElement {
  id: string;
  name: string;
  displayed?: boolean | ((params: MenuElementParams) => boolean);
  color?: string;
  icon?: string;
  text?: string;
  fontSize?: string;
  tooltipItems?: TooltipItem[];
  tooltipKeys?: TooltipKey[];

  cooldown?: (params: MenuElementParams) => number;
  disabled: (params: MenuElementParams) => boolean;
  action?: (params: MenuElementParams) => void; // For leaf items that perform actions
  subMenu?: (params: MenuElementParams) => MenuElement[]; // For non-leaf items that open submenus
}

export interface TooltipKey {
  key: string;
  className: string;
  params?: Record<string, string | number>;
}

export interface CenterButtonElement {
  disabled: (params: MenuElementParams) => boolean;
  action: (params: MenuElementParams) => void;
}

export const COLORS = {
  build: "#ebe250",
  building: "#2c2c2c",
  boat: "#3f6ab1",
  ally: "#53ac75",
  breakAlly: "#c74848",
  delete: "#ff0000",
  info: "#64748B",
  target: "#ff0000",
  attack: "#ff0000",
  infoDetails: "#7f8c8d",
  infoEmoji: "#f1c40f",
  trade: "#008080",
  embargo: "#6600cc",
  tooltip: {
    cost: "#ffd700",
    count: "#aaa",
  },
  chat: {
    default: "#66c",
    help: "#4caf50",
    attack: "#f44336",
    defend: "#2196f3",
    greet: "#ff9800",
    misc: "#9c27b0",
    warnings: "#e3c532",
  },
};

export enum Slot {
  Info = "info",
  Boat = "boat",
  Build = "build",
  Attack = "attack",
  Ally = "ally",
  Back = "back",
  Delete = "delete",
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const infoChatElement: MenuElement = {
  id: "info_chat",
  name: "chat",
  disabled: () => false,
  color: COLORS.chat.default,
  icon: chatIcon,
  subMenu: (params: MenuElementParams) =>
    params.chatIntegration
      .createQuickChatMenu(params.selected!)
      .map((item) => ({
        ...item,
        action: item.action
          ? (_params: MenuElementParams) => item.action!(params)
          : undefined,
      })),
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const allyTargetElement: MenuElement = {
  id: "ally_target",
  name: "target",
  disabled: (params: MenuElementParams): boolean => {
    if (params.selected === null) return true;
    return !params.playerActions.interaction?.canTarget;
  },
  color: COLORS.target,
  icon: targetIcon,
  action: (params: MenuElementParams) => {
    params.playerActionHandler.handleTargetPlayer(params.selected!.id());
    params.closeMenu();
  },
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const allyTradeElement: MenuElement = {
  id: "ally_trade",
  name: "trade",
  disabled: (params: MenuElementParams) =>
    !!params.playerActions?.interaction?.canEmbargo,
  displayed: (params: MenuElementParams) =>
    !params.playerActions?.interaction?.canEmbargo,
  color: COLORS.trade,
  text: translateText("player_panel.start_trade"),
  action: (params: MenuElementParams) => {
    params.playerActionHandler.handleEmbargo(params.selected!, "stop");
    params.closeMenu();
  },
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const allyEmbargoElement: MenuElement = {
  id: "ally_embargo",
  name: "embargo",
  disabled: (params: MenuElementParams) =>
    !params.playerActions?.interaction?.canEmbargo,
  displayed: (params: MenuElementParams) =>
    !!params.playerActions?.interaction?.canEmbargo,
  color: COLORS.embargo,
  text: translateText("player_panel.stop_trade"),
  action: (params: MenuElementParams) => {
    params.playerActionHandler.handleEmbargo(params.selected!, "start");
    params.closeMenu();
  },
};

const allyRequestElement: MenuElement = {
  id: "ally_request",
  name: "request",
  disabled: (params: MenuElementParams) =>
    !params.playerActions?.interaction?.canSendAllianceRequest,
  displayed: (params: MenuElementParams) =>
    !params.playerActions?.interaction?.canBreakAlliance,
  color: COLORS.ally,
  icon: allianceIcon,
  action: (params: MenuElementParams) => {
    params.playerActionHandler.handleAllianceRequest(
      params.myPlayer,
      params.selected!,
    );
    params.closeMenu();
  },
};

const allyBreakElement: MenuElement = {
  id: "ally_break",
  name: "break",
  disabled: (params: MenuElementParams) =>
    !params.playerActions?.interaction?.canBreakAlliance,
  displayed: (params: MenuElementParams) =>
    !!params.playerActions?.interaction?.canBreakAlliance,
  color: COLORS.breakAlly,
  icon: traitorIcon,
  action: (params: MenuElementParams) => {
    params.playerActionHandler.handleBreakAlliance(
      params.myPlayer,
      params.selected!,
    );
    params.closeMenu();
  },
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const allyDonateGoldElement: MenuElement = {
  id: "ally_donate_gold",
  name: "donate gold",
  disabled: (params: MenuElementParams) =>
    !params.playerActions?.interaction?.canDonateGold,
  color: COLORS.ally,
  icon: donateGoldIcon,
  action: (params: MenuElementParams) => {
    params.playerActionHandler.handleDonateGold(params.selected!);
    params.closeMenu();
  },
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const allyDonateTroopsElement: MenuElement = {
  id: "ally_donate_troops",
  name: "donate troops",
  disabled: (params: MenuElementParams) =>
    !params.playerActions?.interaction?.canDonateTroops,
  color: COLORS.ally,
  icon: donateTroopIcon,
  action: (params: MenuElementParams) => {
    params.playerActionHandler.handleDonateTroops(params.selected!);
    params.closeMenu();
  },
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const infoPlayerElement: MenuElement = {
  id: "info_player",
  name: "player",
  disabled: () => false,
  color: COLORS.info,
  icon: infoIcon,
  action: (params: MenuElementParams) => {
    params.playerPanel.show(params.playerActions, params.tile);
  },
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const infoEmojiElement: MenuElement = {
  id: "info_emoji",
  name: "emoji",
  disabled: () => false,
  color: COLORS.infoEmoji,
  icon: emojiIcon,
  subMenu: (params: MenuElementParams) => {
    const emojiElements: MenuElement[] = [
      {
        id: "emoji_more",
        name: "more",
        disabled: () => false,
        color: COLORS.infoEmoji,
        icon: emojiIcon,
        action: (params: MenuElementParams) => {
          params.emojiTable.showTable((emoji) => {
            const targetPlayer =
              params.selected === params.game.myPlayer()
                ? AllPlayers
                : params.selected;
            params.playerActionHandler.handleEmoji(
              targetPlayer!,
              flattenedEmojiTable.indexOf(emoji as Emoji),
            );
            params.emojiTable.hideTable();
          });
        },
      },
    ];

    const emojiCount = 8;
    for (let i = 0; i < emojiCount; i++) {
      emojiElements.push({
        id: `emoji_${i}`,
        name: flattenedEmojiTable[i],
        text: flattenedEmojiTable[i],
        disabled: () => false,
        fontSize: "25px",
        action: (params: MenuElementParams) => {
          const targetPlayer =
            params.selected === params.game.myPlayer()
              ? AllPlayers
              : params.selected;
          params.playerActionHandler.handleEmoji(targetPlayer!, i);
          params.closeMenu();
        },
      });
    }

    return emojiElements;
  },
};

export const infoMenuElement: MenuElement = {
  id: Slot.Info,
  name: "info",
  disabled: (params: MenuElementParams) =>
    !params.selected || params.game.inSpawnPhase(),
  icon: infoIcon,
  color: COLORS.info,
  action: (params: MenuElementParams) => {
    params.playerPanel.show(params.playerActions, params.tile);
  },
};

function getAllEnabledUnits(myPlayer: boolean, config: Config): Set<UnitType> {
  const Units: Set<UnitType> = new Set<UnitType>();

  const addStructureIfEnabled = (unitType: UnitType) => {
    if (!config.isUnitDisabled(unitType)) {
      Units.add(unitType);
    }
  };

  if (myPlayer) {
    // Strategic structures (shown directly in build menu)
    addStructureIfEnabled(UnitType.City);
    addStructureIfEnabled(UnitType.Port);
    addStructureIfEnabled(UnitType.Factory);
    addStructureIfEnabled(UnitType.Airport);
    // Tactical structures (shown in tactical submenu)
    addStructureIfEnabled(UnitType.DefensePost);
    addStructureIfEnabled(UnitType.MissileSilo);
    addStructureIfEnabled(UnitType.SAMLauncher);
    addStructureIfEnabled(UnitType.ShieldGenerator);
    addStructureIfEnabled(UnitType.Artillery);
  } else {
    addStructureIfEnabled(UnitType.HydrogenBomb);
    addStructureIfEnabled(UnitType.MIRV);
    addStructureIfEnabled(UnitType.AtomBomb);
  }

  return Units;
}

// Buildings - economic/production structures (right build menu)
const BUILDING_UNIT_TYPES: UnitType[] = [
  UnitType.City,
  UnitType.Port,
  UnitType.Factory,
  UnitType.Airport,
];

// Towers - military/defensive structures (left build menu)
const TOWER_UNIT_TYPES: UnitType[] = [
  UnitType.DefensePost,
  UnitType.SAMLauncher,
  UnitType.MissileSilo,
  UnitType.ShieldGenerator,
  UnitType.Artillery,
];

const ATTACK_UNIT_TYPES: UnitType[] = [
  UnitType.AtomBomb,
  UnitType.MIRV,
  UnitType.HydrogenBomb,
];

function createMenuElements(
  params: MenuElementParams,
  filterType: "attack" | "build" | "buildings" | "towers",
  elementIdPrefix: string,
): MenuElement[] {
  const unitTypes: Set<UnitType> = getAllEnabledUnits(
    params.selected === params.myPlayer,
    params.game.config(),
  );

  return flattenedBuildTable
    .filter((item) => {
      if (!unitTypes.has(item.unitType)) return false;

      switch (filterType) {
        case "attack":
          return ATTACK_UNIT_TYPES.includes(item.unitType);
        case "buildings":
          return BUILDING_UNIT_TYPES.includes(item.unitType);
        case "towers":
          return TOWER_UNIT_TYPES.includes(item.unitType);
        case "build":
        default:
          return !ATTACK_UNIT_TYPES.includes(item.unitType);
      }
    })
    .map((item: BuildItemDisplay) => ({
      id: `${elementIdPrefix}_${item.unitType}`,
      name: item.key
        ? item.key.replace("unit_type.", "")
        : item.unitType.toString(),
      disabled: (params: MenuElementParams) =>
        !params.buildMenu.canBuildOrUpgrade(item),
      color: params.buildMenu.canBuildOrUpgrade(item)
        ? filterType === "attack"
          ? COLORS.attack
          : COLORS.building
        : undefined,
      icon: item.icon,
      tooltipItems: [
        { text: translateText(item.key ?? ""), className: "title" },
        {
          text: translateText(item.description ?? ""),
          className: "description",
        },
        {
          text: `${renderNumber(params.buildMenu.cost(item))} ${translateText("player_panel.gold")}`,
          className: "cost",
        },
        item.countable
          ? { text: `${params.buildMenu.count(item)}x`, className: "count" }
          : null,
      ].filter(
        (tooltipItem): tooltipItem is TooltipItem => tooltipItem !== null,
      ),
      action: (params: MenuElementParams) => {
        const buildableUnit = params.playerActions.buildableUnits.find(
          (bu) => bu.type === item.unitType,
        );
        if (buildableUnit === undefined) {
          return;
        }
        if (params.buildMenu.canBuildOrUpgrade(item)) {
          params.buildMenu.sendBuildOrUpgrade(buildableUnit, params.tile);
        }
        params.closeMenu();
      },
    }));
}

export const attackMenuElement: MenuElement = {
  id: Slot.Attack,
  name: "radial_attack",
  disabled: (params: MenuElementParams) => params.game.inSpawnPhase(),
  icon: swordIcon,
  color: COLORS.attack,

  subMenu: (params: MenuElementParams) => {
    if (params === undefined) return [];
    return createMenuElements(params, "attack", "attack");
  },
};

export const sellStructureElement: MenuElement = {
  id: "sell_structure",
  name: "sell",
  disabled: (params: MenuElementParams) => {
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return true;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);

    // Cannot sell HQ
    const myHQ = frenzyState.coreBuildings.find(
      (b) => b.playerId === params.myPlayer.id(),
    );
    if (myHQ && Math.hypot(tileX - myHQ.x, tileY - myHQ.y) <= 10) {
      return true;
    }

    // Check for economic structures (mines, factories, ports) using findNearbyStructure
    const economicStructureTypes = ["mine", "factory", "port"];
    for (const structureType of economicStructureTypes) {
      const nearbyStructure = frenzyState.findNearbyStructure(
        tileX,
        tileY,
        STRUCTURE_CLICK_RANGE,
        structureType,
        params.myPlayer.id(),
      );
      if (nearbyStructure) {
        return false; // Found an economic structure, so sell is enabled
      }
    }

    // Check for tower units (defensePost, artillery, etc.) using findNearbyFrenzyUnit
    const towerUnitTypes = [
      "defensePost",
      "artillery",
      "shieldGenerator",
      "samLauncher",
      "missileSilo",
    ];
    for (const unitType of towerUnitTypes) {
      const nearbyUnit = frenzyState.findNearbyFrenzyUnit(
        tileX,
        tileY,
        STRUCTURE_CLICK_RANGE,
        unitType,
        params.myPlayer.id(),
      );
      if (nearbyUnit) {
        return false; // Found a tower, so sell is enabled
      }
    }

    return true; // No structure found, disable sell
  },
  text: "💰",
  fontSize: "20px",
  color: "#FFD700",
  tooltipKeys: [
    {
      key: "radial_menu.sell_structure_title",
      className: "title",
    },
    {
      key: "radial_menu.sell_structure_description",
      className: "description",
    },
  ],
  action: (params: MenuElementParams) => {
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);

    // Find nearby economic structure first (mines, factories, ports)
    const economicStructureTypes = ["mine", "factory", "port"];
    for (const structureType of economicStructureTypes) {
      const nearbyStructure = frenzyState.findNearbyStructure(
        tileX,
        tileY,
        STRUCTURE_CLICK_RANGE,
        structureType,
        params.myPlayer.id(),
      );
      if (nearbyStructure) {
        // Use the structure type from the found structure
        let unitType = "";
        if (structureType === "mine") unitType = "mine";
        else if (structureType === "factory") unitType = "factory";
        else if (structureType === "port") unitType = "port";

        params.playerActionHandler.handleSellFrenzyStructure(
          nearbyStructure.x,
          nearbyStructure.y,
          unitType,
        );
        params.closeMenu();
        return;
      }
    }

    // Find nearby tower unit
    const towerUnitTypes = [
      "defensePost",
      "artillery",
      "shieldGenerator",
      "samLauncher",
      "missileSilo",
    ];
    for (const unitType of towerUnitTypes) {
      const nearbyUnit = frenzyState.findNearbyFrenzyUnit(
        tileX,
        tileY,
        STRUCTURE_CLICK_RANGE,
        unitType,
        params.myPlayer.id(),
      );
      if (nearbyUnit) {
        params.playerActionHandler.handleSellFrenzyStructure(
          nearbyUnit.x,
          nearbyUnit.y,
          nearbyUnit.unitType,
        );
        params.closeMenu();
        return;
      }
    }

    params.closeMenu();
  },
};

export const deleteUnitElement: MenuElement = {
  id: Slot.Delete,
  name: "delete",
  cooldown: (params: MenuElementParams) => params.myPlayer.deleteUnitCooldown(),
  disabled: (params: MenuElementParams) => {
    const tileOwner = params.game.owner(params.tile);
    const isLand = params.game.isLand(params.tile);

    if (!tileOwner.isPlayer() || tileOwner.id() !== params.myPlayer.id()) {
      return true;
    }

    if (!isLand) {
      return true;
    }

    if (params.game.inSpawnPhase()) {
      return true;
    }

    if (params.myPlayer.deleteUnitCooldown() > 0) {
      return true;
    }

    const DELETE_SELECTION_RADIUS = 5;
    const myUnits = params.myPlayer
      .units()
      .filter(
        (unit) =>
          unit.constructionType() === undefined &&
          unit.markedForDeletion() === false &&
          params.game.manhattanDist(unit.tile(), params.tile) <=
            DELETE_SELECTION_RADIUS,
      );

    return myUnits.length === 0;
  },
  icon: xIcon,
  color: COLORS.delete,
  tooltipKeys: [
    {
      key: "radial_menu.delete_unit_title",
      className: "title",
    },
    {
      key: "radial_menu.delete_unit_description",
      className: "description",
    },
  ],
  action: (params: MenuElementParams) => {
    const DELETE_SELECTION_RADIUS = 5;
    const myUnits = params.myPlayer
      .units()
      .filter(
        (unit) =>
          params.game.manhattanDist(unit.tile(), params.tile) <=
          DELETE_SELECTION_RADIUS,
      );

    if (myUnits.length > 0) {
      myUnits.sort(
        (a, b) =>
          params.game.manhattanDist(a.tile(), params.tile) -
          params.game.manhattanDist(b.tile(), params.tile),
      );

      params.playerActionHandler.handleDeleteUnit(myUnits[0].id());
    }

    params.closeMenu();
  },
};

const HQ_UPGRADE_COST = BigInt(100_000);

export const upgradeHQElement: MenuElement = {
  id: "upgrade_hq",
  name: "upgrade_hq",
  displayed: (params: MenuElementParams) => {
    // Only show in Frenzy mode when clicking on own HQ that can be upgraded
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return false;

    const myHQ = frenzyState.coreBuildings.find(
      (b) => b.playerId === params.myPlayer.id(),
    );
    if (!myHQ) return false;

    // HQ max tier is 2
    if ((myHQ.tier ?? 1) >= 2) return false;

    // Check if the click is near the HQ (within 10 pixels)
    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const dist = Math.hypot(tileX - myHQ.x, tileY - myHQ.y);
    return dist <= 10;
  },
  disabled: (params: MenuElementParams) => {
    return params.myPlayer.gold() < HQ_UPGRADE_COST;
  },
  text: "⬆",
  fontSize: "24px",
  color: "#FFD700",
  tooltipKeys: [
    {
      key: "radial_menu.upgrade_hq_title",
      className: "title",
    },
    {
      key: "radial_menu.upgrade_hq_description",
      className: "description",
    },
  ],
  tooltipItems: [
    {
      text: `Cost: ${renderNumber(HQ_UPGRADE_COST)}`,
      className: "cost",
    },
  ],
  action: (params: MenuElementParams) => {
    params.playerActionHandler.handleUpgradeHQ();
    params.closeMenu();
  },
};

const FACTORY_UPGRADE_COST = BigInt(100_000);

// Range for detecting clicks on structures
// Formula: structure_size + 3
// Most structures (mine, factory, port, defense post) have size 8, so range is 11
// Smaller structures (SAM, shield) have size 6-7, but we use a standard range for consistency
const STRUCTURE_CLICK_RANGE = 11; // 8 (structure size) + 3

// All structure upgrades require HQ tier 2
const REQUIRED_HQ_TIER_FOR_UPGRADES = 2;

export const upgradeFactoryElement: MenuElement = {
  id: "upgrade_factory",
  name: "upgrade_factory",
  displayed: (params: MenuElementParams) => {
    // Only show in Frenzy mode when clicking on own factory
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return false;

    // Check if HQ tier >= 2 (required to upgrade factories)
    if (!frenzyState.canUpgradeFactory(params.myPlayer.id())) return false;

    // Check if clicking on a factory owned by this player
    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const myFactory = frenzyState.findNearbyStructure(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "factory",
      params.myPlayer.id(),
    );
    if (!myFactory) return false;

    // Check if factory is already tier 2
    return myFactory.tier < 2;
  },
  disabled: (params: MenuElementParams) => {
    return params.myPlayer.gold() < FACTORY_UPGRADE_COST;
  },
  text: "⬆",
  fontSize: "24px",
  color: "#FFD700",
  tooltipKeys: [
    {
      key: "radial_menu.upgrade_factory_title",
      className: "title",
    },
    {
      key: "radial_menu.upgrade_factory_description",
      className: "description",
    },
  ],
  tooltipItems: [
    {
      text: `Cost: ${renderNumber(FACTORY_UPGRADE_COST)}`,
      className: "cost",
    },
  ],
  action: (params: MenuElementParams) => {
    // Find the factory structure and upgrade it
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const myFactory = frenzyState.findNearbyStructure(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "factory",
      params.myPlayer.id(),
    );
    if (myFactory) {
      params.playerActionHandler.handleUpgradeFactory(myFactory.tile);
    }
    params.closeMenu();
  },
};

const MINE_UPGRADE_COST = BigInt(100_000);

export const upgradeMineElement: MenuElement = {
  id: "upgrade_mine",
  name: "upgrade_mine",
  displayed: (params: MenuElementParams) => {
    // Only show in Frenzy mode when clicking on own mine
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return false;

    // Check HQ tier requirement (must be tier 2+ to upgrade structures)
    if (
      frenzyState.getHQTier(params.myPlayer.id()) <
      REQUIRED_HQ_TIER_FOR_UPGRADES
    )
      return false;

    // Find nearby mine from frenzyState structures
    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const myMine = frenzyState.findNearbyStructure(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "mine",
      params.myPlayer.id(),
    );
    if (!myMine) return false;

    // Check if mine is already tier 2 (max level)
    return myMine.tier < 2;
  },
  disabled: (params: MenuElementParams) => {
    return params.myPlayer.gold() < MINE_UPGRADE_COST;
  },
  text: "⬆",
  fontSize: "24px",
  color: "#FFD700",
  tooltipKeys: [
    {
      key: "radial_menu.upgrade_mine_title",
      className: "title",
    },
    {
      key: "radial_menu.upgrade_mine_description",
      className: "description",
    },
  ],
  tooltipItems: [
    {
      text: `Cost: ${renderNumber(MINE_UPGRADE_COST)}`,
      className: "cost",
    },
  ],
  action: (params: MenuElementParams) => {
    // Find the mine structure and upgrade it using its tile
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const myMine = frenzyState.findNearbyStructure(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "mine",
      params.myPlayer.id(),
    );
    if (myMine) {
      params.playerActionHandler.handleUpgradeMine(myMine.tile);
    }
    params.closeMenu();
  },
};

const STRUCTURE_UPGRADE_COST = BigInt(100_000);

// Port upgrade element
export const upgradePortElement: MenuElement = {
  id: "upgrade_port",
  name: "upgrade_port",
  displayed: (params: MenuElementParams) => {
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return false;

    // Check HQ tier requirement
    if (
      frenzyState.getHQTier(params.myPlayer.id()) <
      REQUIRED_HQ_TIER_FOR_UPGRADES
    )
      return false;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const myPort = frenzyState.findNearbyStructure(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "port",
      params.myPlayer.id(),
    );
    if (!myPort) return false;

    return myPort.tier < 2;
  },
  disabled: (params: MenuElementParams) => {
    return params.myPlayer.gold() < STRUCTURE_UPGRADE_COST;
  },
  text: "⬆",
  fontSize: "24px",
  color: "#FFD700",
  tooltipKeys: [
    { key: "radial_menu.upgrade_port_title", className: "title" },
    { key: "radial_menu.upgrade_port_description", className: "description" },
  ],
  tooltipItems: [
    {
      text: `Cost: ${renderNumber(STRUCTURE_UPGRADE_COST)}`,
      className: "cost",
    },
  ],
  action: (params: MenuElementParams) => {
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const myPort = frenzyState.findNearbyStructure(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "port",
      params.myPlayer.id(),
    );
    if (myPort) {
      params.playerActionHandler.handleUpgradePort(myPort.tile);
    }
    params.closeMenu();
  },
};

// Defense Post upgrade element
export const upgradeDefensePostElement: MenuElement = {
  id: "upgrade_defense_post",
  name: "upgrade_defense_post",
  displayed: (params: MenuElementParams) => {
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return false;

    // Check HQ tier requirement
    if (
      frenzyState.getHQTier(params.myPlayer.id()) <
      REQUIRED_HQ_TIER_FOR_UPGRADES
    )
      return false;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const myDefensePost = frenzyState.findNearbyFrenzyUnit(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "defensePost",
      params.myPlayer.id(),
    );
    if (!myDefensePost) return false;

    return (myDefensePost.tier ?? 1) < 2;
  },
  disabled: (params: MenuElementParams) => {
    return params.myPlayer.gold() < STRUCTURE_UPGRADE_COST;
  },
  text: "⬆",
  fontSize: "24px",
  color: "#FFD700",
  tooltipKeys: [
    { key: "radial_menu.upgrade_defense_post_title", className: "title" },
    {
      key: "radial_menu.upgrade_defense_post_description",
      className: "description",
    },
  ],
  tooltipItems: [
    {
      text: `Cost: ${renderNumber(STRUCTURE_UPGRADE_COST)}`,
      className: "cost",
    },
  ],
  action: (params: MenuElementParams) => {
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const myDefensePost = frenzyState.findNearbyFrenzyUnit(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "defensePost",
      params.myPlayer.id(),
    );
    if (myDefensePost) {
      params.playerActionHandler.handleUpgradeFrenzyUnit(
        myDefensePost.id,
        "defensePost",
      );
    }
    params.closeMenu();
  },
};

// SAM Launcher upgrade element
export const upgradeSAMElement: MenuElement = {
  id: "upgrade_sam",
  name: "upgrade_sam",
  displayed: (params: MenuElementParams) => {
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return false;

    // Check HQ tier requirement
    if (
      frenzyState.getHQTier(params.myPlayer.id()) <
      REQUIRED_HQ_TIER_FOR_UPGRADES
    )
      return false;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const mySAM = frenzyState.findNearbyFrenzyUnit(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "samLauncher",
      params.myPlayer.id(),
    );
    if (!mySAM) return false;

    return (mySAM.tier ?? 1) < 2;
  },
  disabled: (params: MenuElementParams) => {
    return params.myPlayer.gold() < STRUCTURE_UPGRADE_COST;
  },
  text: "⬆",
  fontSize: "24px",
  color: "#FFD700",
  tooltipKeys: [
    { key: "radial_menu.upgrade_sam_title", className: "title" },
    { key: "radial_menu.upgrade_sam_description", className: "description" },
  ],
  tooltipItems: [
    {
      text: `Cost: ${renderNumber(STRUCTURE_UPGRADE_COST)}`,
      className: "cost",
    },
  ],
  action: (params: MenuElementParams) => {
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const mySAM = frenzyState.findNearbyFrenzyUnit(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "samLauncher",
      params.myPlayer.id(),
    );
    if (mySAM) {
      params.playerActionHandler.handleUpgradeFrenzyUnit(
        mySAM.id,
        "samLauncher",
      );
    }
    params.closeMenu();
  },
};

// Shield Generator upgrade element
export const upgradeShieldElement: MenuElement = {
  id: "upgrade_shield",
  name: "upgrade_shield",
  displayed: (params: MenuElementParams) => {
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return false;

    // Check HQ tier requirement
    if (
      frenzyState.getHQTier(params.myPlayer.id()) <
      REQUIRED_HQ_TIER_FOR_UPGRADES
    )
      return false;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const myShield = frenzyState.findNearbyFrenzyUnit(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "shieldGenerator",
      params.myPlayer.id(),
    );
    if (!myShield) return false;

    return (myShield.tier ?? 1) < 2;
  },
  disabled: (params: MenuElementParams) => {
    return params.myPlayer.gold() < STRUCTURE_UPGRADE_COST;
  },
  text: "⬆",
  fontSize: "24px",
  color: "#FFD700",
  tooltipKeys: [
    { key: "radial_menu.upgrade_shield_title", className: "title" },
    { key: "radial_menu.upgrade_shield_description", className: "description" },
  ],
  tooltipItems: [
    {
      text: `Cost: ${renderNumber(STRUCTURE_UPGRADE_COST)}`,
      className: "cost",
    },
  ],
  action: (params: MenuElementParams) => {
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const myShield = frenzyState.findNearbyFrenzyUnit(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "shieldGenerator",
      params.myPlayer.id(),
    );
    if (myShield) {
      params.playerActionHandler.handleUpgradeFrenzyUnit(
        myShield.id,
        "shieldGenerator",
      );
    }
    params.closeMenu();
  },
};

// Artillery upgrade element
export const upgradeArtilleryElement: MenuElement = {
  id: "upgrade_artillery",
  name: "upgrade_artillery",
  displayed: (params: MenuElementParams) => {
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return false;

    // Check HQ tier requirement
    if (
      frenzyState.getHQTier(params.myPlayer.id()) <
      REQUIRED_HQ_TIER_FOR_UPGRADES
    )
      return false;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const myArtillery = frenzyState.findNearbyFrenzyUnit(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "artillery",
      params.myPlayer.id(),
    );
    if (!myArtillery) return false;

    return (myArtillery.tier ?? 1) < 2;
  },
  disabled: (params: MenuElementParams) => {
    return params.myPlayer.gold() < STRUCTURE_UPGRADE_COST;
  },
  text: "⬆",
  fontSize: "24px",
  color: "#FFD700",
  tooltipKeys: [
    { key: "radial_menu.upgrade_artillery_title", className: "title" },
    {
      key: "radial_menu.upgrade_artillery_description",
      className: "description",
    },
  ],
  tooltipItems: [
    {
      text: `Cost: ${renderNumber(STRUCTURE_UPGRADE_COST)}`,
      className: "cost",
    },
  ],
  action: (params: MenuElementParams) => {
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const myArtillery = frenzyState.findNearbyFrenzyUnit(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "artillery",
      params.myPlayer.id(),
    );
    if (myArtillery) {
      params.playerActionHandler.handleUpgradeFrenzyUnit(
        myArtillery.id,
        "artillery",
      );
    }
    params.closeMenu();
  },
};

// Missile Silo upgrade element
export const upgradeSiloElement: MenuElement = {
  id: "upgrade_silo",
  name: "upgrade_silo",
  displayed: (params: MenuElementParams) => {
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return false;

    // Check HQ tier requirement
    if (
      frenzyState.getHQTier(params.myPlayer.id()) <
      REQUIRED_HQ_TIER_FOR_UPGRADES
    )
      return false;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const mySilo = frenzyState.findNearbyFrenzyUnit(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "missileSilo",
      params.myPlayer.id(),
    );
    if (!mySilo) return false;

    return (mySilo.tier ?? 1) < 2;
  },
  disabled: (params: MenuElementParams) => {
    return params.myPlayer.gold() < STRUCTURE_UPGRADE_COST;
  },
  text: "⬆",
  fontSize: "24px",
  color: "#FFD700",
  tooltipKeys: [
    { key: "radial_menu.upgrade_silo_title", className: "title" },
    { key: "radial_menu.upgrade_silo_description", className: "description" },
  ],
  tooltipItems: [
    {
      text: `Cost: ${renderNumber(STRUCTURE_UPGRADE_COST)}`,
      className: "cost",
    },
  ],
  action: (params: MenuElementParams) => {
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return;

    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const mySilo = frenzyState.findNearbyFrenzyUnit(
      tileX,
      tileY,
      STRUCTURE_CLICK_RANGE,
      "missileSilo",
      params.myPlayer.id(),
    );
    if (mySilo) {
      params.playerActionHandler.handleUpgradeFrenzyUnit(
        mySilo.id,
        "missileSilo",
      );
    }
    params.closeMenu();
  },
};

export const buildMenuElement: MenuElement = {
  id: Slot.Build,
  name: "build",
  disabled: (params: MenuElementParams) => params.game.inSpawnPhase(),
  icon: buildIcon,
  color: COLORS.build,
  tooltipKeys: [
    {
      key: "radial_menu.buildings_title",
      className: "title",
    },
    {
      key: "radial_menu.buildings_description",
      className: "description",
    },
  ],

  subMenu: (params: MenuElementParams) => {
    if (params === undefined) return [];
    // Buildings submenu (towers removed - accessible from main menu)
    const buildingItems = createMenuElements(params, "buildings", "build");
    return [...buildingItems];
  },
};

export const towersMenuElement: MenuElement = {
  id: "towers",
  name: "towers",
  disabled: (params: MenuElementParams) => params.game.inSpawnPhase(),
  icon: shieldIcon,
  color: COLORS.attack,
  tooltipKeys: [
    {
      key: "radial_menu.towers_title",
      className: "title",
    },
    {
      key: "radial_menu.towers_description",
      className: "description",
    },
  ],
  subMenu: (params: MenuElementParams) => {
    if (params === undefined) return [];
    return createMenuElements(params, "towers", "towers");
  },
};

export const boatMenuElement: MenuElement = {
  id: Slot.Boat,
  name: "boat",
  disabled: (params: MenuElementParams) =>
    !params.playerActions.buildableUnits.some(
      (unit) => unit.type === UnitType.TransportShip && unit.canBuild,
    ),
  icon: boatIcon,
  color: COLORS.boat,

  action: async (params: MenuElementParams) => {
    const spawn = await params.playerActionHandler.findBestTransportShipSpawn(
      params.myPlayer,
      params.tile,
    );

    params.playerActionHandler.handleBoatAttack(
      params.myPlayer,
      params.selected?.id() ?? null,
      params.tile,
      spawn !== false ? spawn : null,
    );

    params.closeMenu();
  },
};

export const transporterMenuElement: MenuElement = {
  id: "transporter",
  name: "transporter",
  disabled: (params: MenuElementParams) => {
    // In Frenzy mode, check if player has an available transporter
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return true;

    const myPlayerId = params.myPlayer.id();
    // Find any transporter owned by this player that is not currently flying or boarding
    const hasAvailableTransporter = frenzyState.units.some(
      (unit) =>
        unit.playerId === myPlayerId &&
        unit.unitType === "transporter" &&
        !unit.isFlying &&
        !unit.isWaitingForBoarding,
    );
    return !hasAvailableTransporter;
  },
  icon: airtransportIcon,
  color: COLORS.boat,
  tooltipKeys: [
    {
      key: "radial_menu.transporter_title",
      className: "title",
    },
    {
      key: "radial_menu.transporter_description",
      className: "description",
    },
  ],

  action: async (params: MenuElementParams) => {
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return;

    const myPlayerId = params.myPlayer.id();
    // Find the first available transporter (not flying or waiting for boarding)
    const transporter = frenzyState.units.find(
      (unit) =>
        unit.playerId === myPlayerId &&
        unit.unitType === "transporter" &&
        !unit.isFlying &&
        !unit.isWaitingForBoarding,
    );

    if (!transporter) return;

    // Get target coordinates from the tile
    const targetX = params.game.x(params.tile);
    const targetY = params.game.y(params.tile);

    // Calculate unit count based on attack ratio (max 5)
    const attackRatio = params.uiState?.attackRatio ?? 0.2;
    // Count available soldiers (not on transport duty)
    const soldiers = frenzyState.units.filter(
      (unit) =>
        unit.playerId === myPlayerId &&
        (unit.unitType === "soldier" || unit.unitType === "eliteSoldier"),
    );
    const unitCount = Math.min(
      5,
      Math.max(1, Math.floor(soldiers.length * attackRatio)),
    );

    // Emit the move transporter intent with unit count
    params.eventBus.emit(
      new MoveTransporterIntentEvent(
        transporter.id,
        targetX,
        targetY,
        unitCount,
      ),
    );

    params.closeMenu();
  },
};

export const centerButtonElement: CenterButtonElement = {
  disabled: (params: MenuElementParams): boolean => {
    const tileOwner = params.game.owner(params.tile);
    const isLand = params.game.isLand(params.tile);
    const isWater = params.game.isWater(params.tile);

    // In Frenzy mode, allow attacks anywhere (own territory, enemy, wilderness, water)
    const frenzyState = params.game.frenzyManager();
    if (frenzyState && !params.game.inSpawnPhase()) {
      // In Frenzy mode, only disable if tile is invalid (not land and not water)
      return !isLand && !isWater;
    }

    if (!isLand) {
      return true;
    }
    if (params.game.inSpawnPhase()) {
      if (tileOwner.isPlayer()) {
        return true;
      }
      return false;
    }
    return !params.playerActions.canAttack;
  },
  action: (params: MenuElementParams) => {
    if (params.game.inSpawnPhase()) {
      params.playerActionHandler.handleSpawn(params.tile);
    } else {
      params.playerActionHandler.handleAttack(
        params.myPlayer,
        params.selected?.id() ?? null,
        params.tile,
      );
    }
    params.closeMenu();
  },
};

export const rootMenuElement: MenuElement = {
  id: "root",
  name: "root",
  disabled: () => false,
  icon: infoIcon,
  color: COLORS.info,
  subMenu: (params: MenuElementParams) => {
    let ally = allyRequestElement;
    if (params.selected?.isAlliedWith(params.myPlayer)) {
      ally = allyBreakElement;
    }

    const tileOwner = params.game.owner(params.tile);
    const isOwnTerritory =
      tileOwner.isPlayer() &&
      (tileOwner as PlayerView).id() === params.myPlayer.id();

    // Check if clicking on own HQ or structures in Frenzy mode
    let isClickingOnHQ = false;
    let isClickingOnStructure = false;
    let structureUpgradeElement: MenuElement | null = null;

    const frenzyState = params.game.frenzyManager();
    if (frenzyState) {
      const myHQ = frenzyState.coreBuildings.find(
        (b) => b.playerId === params.myPlayer.id(),
      );
      if (myHQ) {
        const tileX = params.game.x(params.tile);
        const tileY = params.game.y(params.tile);
        const dist = Math.hypot(tileX - myHQ.x, tileY - myHQ.y);
        // Only show upgrade option if HQ can be upgraded (tier < 2)
        isClickingOnHQ = dist <= 20 && (myHQ.tier ?? 1) < 2;
      }

      // Check each structure type and set appropriate upgrade element
      // Priority order: HQ > Factory > Mine > Port > Silo > SAM > Shield > Artillery > DefensePost

      const tileXClick = params.game.x(params.tile);
      const tileYClick = params.game.y(params.tile);

      // Factory
      const myFactory = frenzyState.findNearbyStructure(
        tileXClick,
        tileYClick,
        STRUCTURE_CLICK_RANGE,
        "factory",
        params.myPlayer.id(),
      );
      if (myFactory) {
        isClickingOnStructure = true;
        const canUpgrade =
          frenzyState.canUpgradeFactory(params.myPlayer.id()) &&
          myFactory.tier < 2;
        if (canUpgrade) {
          structureUpgradeElement = upgradeFactoryElement;
        }
      }

      // Mine (City)
      if (!structureUpgradeElement) {
        const myMine = frenzyState.findNearbyStructure(
          tileXClick,
          tileYClick,
          STRUCTURE_CLICK_RANGE,
          "mine",
          params.myPlayer.id(),
        );
        if (myMine) {
          isClickingOnStructure = true;
          if (myMine.tier < 2) {
            structureUpgradeElement = upgradeMineElement;
          }
        }
      }

      // Port
      if (!structureUpgradeElement) {
        const myPort = frenzyState.findNearbyStructure(
          tileXClick,
          tileYClick,
          STRUCTURE_CLICK_RANGE,
          "port",
          params.myPlayer.id(),
        );
        if (myPort) {
          isClickingOnStructure = true;
          if (myPort.tier < 2) {
            structureUpgradeElement = upgradePortElement;
          }
        }
      }

      // Missile Silo
      if (!structureUpgradeElement) {
        const mySilo = frenzyState.findNearbyFrenzyUnit(
          tileXClick,
          tileYClick,
          STRUCTURE_CLICK_RANGE,
          "missileSilo",
          params.myPlayer.id(),
        );
        if (mySilo) {
          isClickingOnStructure = true;
          if ((mySilo.tier ?? 1) < 2) {
            structureUpgradeElement = upgradeSiloElement;
          }
        }
      }

      // SAM Launcher
      if (!structureUpgradeElement) {
        const mySAM = frenzyState.findNearbyFrenzyUnit(
          tileXClick,
          tileYClick,
          STRUCTURE_CLICK_RANGE,
          "samLauncher",
          params.myPlayer.id(),
        );
        if (mySAM) {
          isClickingOnStructure = true;
          if ((mySAM.tier ?? 1) < 2) {
            structureUpgradeElement = upgradeSAMElement;
          }
        }
      }

      // Shield Generator
      if (!structureUpgradeElement) {
        const myShield = frenzyState.findNearbyFrenzyUnit(
          tileXClick,
          tileYClick,
          STRUCTURE_CLICK_RANGE,
          "shieldGenerator",
          params.myPlayer.id(),
        );
        if (myShield) {
          isClickingOnStructure = true;
          if ((myShield.tier ?? 1) < 2) {
            structureUpgradeElement = upgradeShieldElement;
          }
        }
      }

      // Artillery
      if (!structureUpgradeElement) {
        const myArtillery = frenzyState.findNearbyFrenzyUnit(
          tileXClick,
          tileYClick,
          STRUCTURE_CLICK_RANGE,
          "artillery",
          params.myPlayer.id(),
        );
        if (myArtillery) {
          isClickingOnStructure = true;
          if ((myArtillery.tier ?? 1) < 2) {
            structureUpgradeElement = upgradeArtilleryElement;
          }
        }
      }

      // Defense Post
      if (!structureUpgradeElement) {
        const myDefensePost = frenzyState.findNearbyFrenzyUnit(
          tileXClick,
          tileYClick,
          STRUCTURE_CLICK_RANGE,
          "defensePost",
          params.myPlayer.id(),
        );
        if (myDefensePost) {
          isClickingOnStructure = true;
          if ((myDefensePost.tier ?? 1) < 2) {
            structureUpgradeElement = upgradeDefensePostElement;
          }
        }
      }
    }

    // In own territory: determine what to show in the top slot (upgrade)
    // - On HQ: upgrade HQ
    // - On upgradeable structure: upgrade element
    // - Otherwise: generic disabled upgrade slot
    let upgradeSlot: MenuElement;
    if (isClickingOnHQ) {
      upgradeSlot = upgradeHQElement;
    } else if (structureUpgradeElement) {
      upgradeSlot = structureUpgradeElement;
    } else {
      // Generic disabled upgrade slot
      upgradeSlot = {
        id: "upgrade_disabled",
        name: "upgrade",
        disabled: () => true,
        text: "⬆",
        fontSize: "24px",
        color: "#999",
        tooltipKeys: [
          {
            key: "radial_menu.upgrade_title",
            className: "title",
          },
          {
            key: "radial_menu.upgrade_description",
            className: "description",
          },
        ],
      };
    }

    // Sell/delete slot: in Frenzy mode use sell structure element, otherwise use the actual sell element or generic disabled slot
    let sellSlot: MenuElement;
    if (params.game.frenzyManager()) {
      // In Frenzy mode, always show sell structure element
      sellSlot = sellStructureElement;
    } else if (isClickingOnStructure) {
      sellSlot = deleteUnitElement;
    } else {
      // Generic disabled sell slot
      sellSlot = {
        id: "sell_disabled",
        name: "sell",
        disabled: () => true,
        text: "💰",
        fontSize: "20px",
        color: "#999",
      };
    }

    const menuItems: (MenuElement | null)[] = [
      ...(isOwnTerritory
        ? [upgradeSlot, buildMenuElement, towersMenuElement, sellSlot]
        : [infoMenuElement, transporterMenuElement, ally, attackMenuElement]),
    ];

    return menuItems.filter((item): item is MenuElement => item !== null);
  },
};
