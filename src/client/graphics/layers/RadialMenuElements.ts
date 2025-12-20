import { Config } from "../../../core/configuration/Config";
import { AllPlayers, PlayerActions, UnitType } from "../../../core/game/Game";
import { TileRef } from "../../../core/game/GameMap";
import { GameView, PlayerView } from "../../../core/game/GameView";
import { Emoji, flattenedEmojiTable } from "../../../core/Util";
import { renderNumber, translateText } from "../../Utils";
import { BuildItemDisplay, BuildMenu, flattenedBuildTable } from "./BuildMenu";
import { ChatIntegration } from "./ChatIntegration";
import { EmojiTable } from "./EmojiTable";
import { PlayerActionHandler } from "./PlayerActionHandler";
import { PlayerPanel } from "./PlayerPanel";
import { TooltipItem } from "./RadialMenu";

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
    // Tactical structures (shown in tactical submenu)
    addStructureIfEnabled(UnitType.DefensePost);
    addStructureIfEnabled(UnitType.MissileSilo);
    addStructureIfEnabled(UnitType.SAMLauncher);
    addStructureIfEnabled(UnitType.ShieldGenerator);
    addStructureIfEnabled(UnitType.Artillery);
  } else {
    addStructureIfEnabled(UnitType.Warship);
    addStructureIfEnabled(UnitType.HydrogenBomb);
    addStructureIfEnabled(UnitType.MIRV);
    addStructureIfEnabled(UnitType.AtomBomb);
  }

  return Units;
}

// Strategic structures - economic/production
const STRATEGIC_UNIT_TYPES: UnitType[] = [
  UnitType.City,
  UnitType.Port,
  UnitType.Factory,
];

// Tactical structures - military/defensive
const TACTICAL_UNIT_TYPES: UnitType[] = [
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
  UnitType.Warship,
];

function createMenuElements(
  params: MenuElementParams,
  filterType: "attack" | "build" | "strategic" | "tactical",
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
        case "strategic":
          return STRATEGIC_UNIT_TYPES.includes(item.unitType);
        case "tactical":
          return TACTICAL_UNIT_TYPES.includes(item.unitType);
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
    // Only show in Frenzy mode when clicking on own HQ
    const frenzyState = params.game.frenzyManager();
    if (!frenzyState) return false;
    
    const myHQ = frenzyState.coreBuildings.find(
      (b) => b.playerId === params.myPlayer.id(),
    );
    if (!myHQ) return false;
    
    // Check if the click is near the HQ (within 20 pixels)
    const tileX = params.game.x(params.tile);
    const tileY = params.game.y(params.tile);
    const dist = Math.hypot(tileX - myHQ.x, tileY - myHQ.y);
    return dist <= 20;
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
    const nearbyUnits = params.game.nearbyUnits(params.tile, 3, [UnitType.Factory]);
    const myFactory = nearbyUnits.find(
      ({ unit }) =>
        unit.owner().isPlayer() &&
        (unit.owner() as PlayerView).id() === params.myPlayer.id(),
    );
    if (!myFactory) return false;
    
    // Check if factory is already tier 2
    const factoryTier = frenzyState.getFactoryTier(myFactory.unit.tile());
    return factoryTier < 2;
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
    // Find the factory tile
    const nearbyUnits = params.game.nearbyUnits(params.tile, 3, [UnitType.Factory]);
    const myFactory = nearbyUnits.find(
      ({ unit }) =>
        unit.owner().isPlayer() &&
        (unit.owner() as PlayerView).id() === params.myPlayer.id(),
    );
    if (myFactory) {
      params.playerActionHandler.handleUpgradeFactory(myFactory.unit.tile());
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

  subMenu: (params: MenuElementParams) => {
    if (params === undefined) return [];
    // Strategic structures + tactical submenu
    const strategicItems = createMenuElements(params, "strategic", "build");
    return [...strategicItems, tacticalMenuElement];
  },
};

export const tacticalMenuElement: MenuElement = {
  id: "tactical",
  name: "tactical",
  disabled: (params: MenuElementParams) => params.game.inSpawnPhase(),
  icon: shieldIcon,
  color: COLORS.attack,
  tooltipKeys: [
    {
      key: "radial_menu.tactical_title",
      className: "title",
    },
    {
      key: "radial_menu.tactical_description",
      className: "description",
    },
  ],
  subMenu: (params: MenuElementParams) => {
    if (params === undefined) return [];
    return createMenuElements(params, "tactical", "tactical");
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

export const centerButtonElement: CenterButtonElement = {
  disabled: (params: MenuElementParams): boolean => {
    const tileOwner = params.game.owner(params.tile);
    const isLand = params.game.isLand(params.tile);
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

    // Check if clicking on own HQ or factory in Frenzy mode
    let isClickingOnHQ = false;
    let isClickingOnOwnFactory = false;
    let isClickingOnStructure = false;
    let canUpgradeFactory = false;
    const frenzyState = params.game.frenzyManager();
    if (frenzyState) {
      const myHQ = frenzyState.coreBuildings.find(
        (b) => b.playerId === params.myPlayer.id(),
      );
      if (myHQ) {
        const tileX = params.game.x(params.tile);
        const tileY = params.game.y(params.tile);
        const dist = Math.hypot(tileX - myHQ.x, tileY - myHQ.y);
        isClickingOnHQ = dist <= 20;
      }
      
      // Check if clicking on own factory
      const nearbyFactories = params.game.nearbyUnits(params.tile, 3, [UnitType.Factory]);
      const myFactory = nearbyFactories.find(
        ({ unit }) =>
          unit.owner().isPlayer() &&
          (unit.owner() as PlayerView).id() === params.myPlayer.id(),
      );
      if (myFactory) {
        isClickingOnOwnFactory = true;
        isClickingOnStructure = true;
        // Check if factory can be upgraded (HQ tier >= 2 and factory tier < 2)
        canUpgradeFactory = frenzyState.canUpgradeFactory(params.myPlayer.id()) &&
          frenzyState.getFactoryTier(myFactory.unit.tile()) < 2;
      }
      
      // Check if clicking on any structure (mine, port, etc.)
      const nearbyStructures = params.game.nearbyUnits(params.tile, 3, [
        UnitType.City, UnitType.Port, UnitType.MissileSilo, 
        UnitType.SAMLauncher, UnitType.DefensePost,
        UnitType.ShieldGenerator, UnitType.Artillery
      ]);
      if (nearbyStructures.some(({ unit }) => 
        unit.owner().isPlayer() && 
        (unit.owner() as PlayerView).id() === params.myPlayer.id()
      )) {
        isClickingOnStructure = true;
      }
    }

    // In own territory: determine what to show in the first slot
    // - On HQ: upgrade HQ
    // - On Factory: upgrade factory
    // - On other structure: delete unit
    // - On empty land: tactical menu
    let ownTerritoryFirstItem: MenuElement = tacticalMenuElement;
    if (isClickingOnHQ) {
      ownTerritoryFirstItem = upgradeHQElement;
    } else if (isClickingOnOwnFactory && canUpgradeFactory) {
      ownTerritoryFirstItem = upgradeFactoryElement;
    } else if (isClickingOnStructure) {
      ownTerritoryFirstItem = deleteUnitElement;
    }

    const menuItems: (MenuElement | null)[] = [
      infoMenuElement,
      ...(isOwnTerritory
        ? [ownTerritoryFirstItem, ally, buildMenuElement]
        : [boatMenuElement, ally, attackMenuElement]),
    ];

    return menuItems.filter((item): item is MenuElement => item !== null);
  },
};
