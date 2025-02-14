import express, { json } from "express";
import http from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import { GameManager } from "./GameManager";
import {
  ClientMessage,
  ClientMessageSchema,
  GameRecord,
  GameRecordSchema,
  LogSeverity,
} from "../core/Schemas";
import {
  GameEnv,
  getConfig,
  getServerConfig,
} from "../core/configuration/Config";
import { slog } from "./StructuredLog";
import { Client } from "./Client";
import { GamePhase, GameServer } from "./GameServer";
import { archive } from "./Archive";
import { DiscordBot } from "./DiscordBot";
import {
  sanitizeUsername,
  validateUsername,
} from "../core/validations/username";
import { Request, Response } from "express";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import dotenv from "dotenv";
import crypto from "crypto";
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const serverConfig = getServerConfig();

// Initialize Secret Manager
const secretManager = new SecretManagerServiceClient();

// Discord OAuth Configuration (will be populated from secrets)
let DISCORD_CLIENT_ID: string;
let DISCORD_CLIENT_SECRET: string;

// Serve static files from the 'out' directory
app.use(express.static(path.join(__dirname, "../../out")));
app.use(express.json());

const gm = new GameManager(serverConfig);

let lobbiesString = "";

// Discord OAuth callback endpoint
app.get("/auth/callback", async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("No code provided");
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID!,
        client_secret: DISCORD_CLIENT_SECRET!,
        code: code as string,
        grant_type: "authorization_code",
        redirect_uri: serverConfig.discordRedirectURI(),
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to get access token");
    }

    const tokenData = await tokenResponse.json();

    // Get user information
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      throw new Error("Failed to get user information");
    }

    const userData = await userResponse.json();
    const sessionToken = crypto.randomBytes(32).toString("hex");

    // TODO: store userData and sessionToken in database.

    res.cookie("session", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
    });
    res.redirect(`/`);
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).send("Authentication failed");
  }
});

app.get("/auth/discord", (req: Request, res: Response) => {
  console.log("Redirecting to Discord OAuth...");
  const redirectUri = serverConfig.discordRedirectURI();
  const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify`;
  console.log("Auth URL:", authorizeUrl);
  res.redirect(authorizeUrl);
});

// New GET endpoint to list lobbies
app.get("/lobbies", (req: Request, res: Response) => {
  res.send(lobbiesString);
});

app.post("/private_lobby", (req, res) => {
  const id = gm.createPrivateGame();
  console.log("creating private lobby with id ${id}");
  res.json({
    id: id,
  });
});

app.post("/archive_singleplayer_game", (req, res) => {
  try {
    const gameRecord: GameRecord = req.body;
    const clientIP = req.ip || req.socket.remoteAddress || "unknown";

    if (!gameRecord) {
      console.log("game record not found in request");
      res.status(404).json({ error: "Game record not found" });
      return;
    }
    gameRecord.players.forEach((p) => (p.ip = clientIP));
    GameRecordSchema.parse(gameRecord);
    archive(gameRecord);
    res.json({
      success: true,
    });
  } catch (error) {
    slog({
      logKey: "complete_single_player_game_record",
      msg: `Failed to complete game record: ${error}`,
      severity: LogSeverity.Error,
    });
    res.status(400).json({ error: "Invalid game record format" });
  }
});

app.post("/start_private_lobby/:id", (req, res) => {
  console.log(`starting private lobby with id ${req.params.id}`);
  gm.startPrivateGame(req.params.id);
});

app.put("/private_lobby/:id", (req, res) => {
  const lobbyID = req.params.id;
  gm.updateGameConfig(lobbyID, {
    gameMap: req.body.gameMap,
    difficulty: req.body.difficulty,
    disableBots: req.body.disableBots,
    disableNPCs: req.body.disableNPCs,
    creativeMode: req.body.creativeMode,
  });
});

app.get("/lobby/:id/exists", (req, res) => {
  const lobbyId = req.params.id;
  console.log(`checking lobby ${lobbyId} exists`);
  const lobbyExists = gm.hasActiveGame(lobbyId);

  res.json({
    exists: lobbyExists,
  });
});

app.get("/lobby/:id", (req, res) => {
  const game = gm.game(req.params.id);
  if (game == null) {
    console.log(`lobby ${req.params.id} not found`);
    return res.status(404).json({ error: "Game not found" });
  }
  res.json({
    players: game.activeClients.map((c) => ({
      username: c.username,
      clientID: c.clientID,
    })),
  });
});

app.get("/private_lobby/:id", (req, res) => {
  res.json({
    hi: "5",
  });
});

app.get("*", function (req, res) {
  // SPA routing
  res.sendFile(path.join(__dirname, "../../out/index.html"));
});

wss.on("connection", (ws, req) => {
  ws.on("message", (message: string) => {
    try {
      const clientMsg: ClientMessage = ClientMessageSchema.parse(
        JSON.parse(message),
      );
      if (clientMsg.type == "join") {
        const forwarded = req.headers["x-forwarded-for"];
        let ip = Array.isArray(forwarded)
          ? forwarded[0]
          : forwarded || req.socket.remoteAddress;
        if (Array.isArray(ip)) {
          ip = ip[0];
        }
        const { isValid, error } = validateUsername(clientMsg.username);
        if (!isValid) {
          console.log(
            `game ${clientMsg.gameID}, client ${clientMsg.clientID} received invalid username, ${error}`,
          );
          return;
        }
        clientMsg.username = sanitizeUsername(clientMsg.username);
        gm.addClient(
          new Client(
            clientMsg.clientID,
            clientMsg.persistentID,
            ip,
            clientMsg.username,
            ws,
          ),
          clientMsg.gameID,
          clientMsg.lastTurn,
        );
      }
      if (clientMsg.type == "log") {
        slog({
          logKey: "client_console_log",
          msg: clientMsg.log,
          severity: clientMsg.severity,
          clientID: clientMsg.clientID,
          gameID: clientMsg.gameID,
          persistentID: clientMsg.persistentID,
        });
      }
    } catch (error) {
      console.log(`errror handling websocket message: ${error}`);
    }
  });
  ws.on("error", (error: Error) => {
    if ((error as any).code === "WS_ERR_UNEXPECTED_RSV_1") {
      ws.close(1002);
    }
  });
});

function startServer() {
  setInterval(() => tick(), 1000);
  setInterval(() => updateLobbies(), 100);

  initializeSecrets();

  const PORT = process.env.PORT || 3000;
  console.log(`Server will try to run on http://localhost:${PORT}`);

  server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

function tick() {
  gm.tick();
}

function updateLobbies() {
  lobbiesString = JSON.stringify({
    lobbies: gm
      .gamesByPhase(GamePhase.Lobby)
      .filter((g) => g.isPublic)
      .map((g) => ({
        id: g.id,
        msUntilStart: g.startTime() - Date.now(),
        numClients: g.numClients(),
        gameConfig: g.gameConfig,
      }))
      .sort((a, b) => a.msUntilStart - b.msUntilStart),
  });
}

// Initialize secrets and start server
async function initializeSecrets() {
  try {
    DISCORD_CLIENT_ID = await getSecret(
      "DISCORD_CLIENT_ID",
      serverConfig.env(),
    );
    DISCORD_CLIENT_SECRET = await getSecret(
      "DISCORD_CLIENT_SECRET",
      serverConfig.env(),
    );

    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
      throw new Error("Failed to load Discord secrets");
    }
  } catch (error) {
    console.error("Failed to initialize secrets:", error);
    process.exit(1);
  }
}

async function getSecret(secretName: string, ge: GameEnv) {
  if (ge == GameEnv.Dev) {
    console.log(`loading secret ${secretName} from environment variable`);
    return process.env[secretName]; // This is how you access env vars dynamically
  }
  console.log(`loading secret ${secretName} from Google secrets manager`);
  const name = `projects/openfrontio/secrets/${secretName}/versions/latest`;
  const [version] = await secretManager.accessSecretVersion({ name });
  return version.payload?.data?.toString();
}

startServer();
