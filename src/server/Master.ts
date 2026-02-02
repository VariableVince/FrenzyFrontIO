import cluster from "cluster";
import express from "express";
import rateLimit from "express-rate-limit";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { getServerConfigFromServer } from "../core/configuration/ConfigLoader";
import { GameInfo, ID } from "../core/Schemas";
import { generateID } from "../core/Util";
import { logger } from "./Logger";
import { MapPlaylist } from "./MapPlaylist";

const config = getServerConfigFromServer();
const playlist = new MapPlaylist();
const readyWorkers = new Set();

const app = express();
const server = http.createServer(app);

const log = logger.child({ comp: "m" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.json());
app.use(
  express.static(path.join(__dirname, "../../static"), {
    maxAge: "1y", // Set max-age to 1 year for all static assets
    setHeaders: (res, path) => {
      // You can conditionally set different cache times based on file types
      if (path.endsWith(".html")) {
        // Set HTML files to no-cache to ensure Express doesn't send 304s
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, proxy-revalidate",
        );
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        // Prevent conditional requests
        res.setHeader("ETag", "");
      } else if (path.match(/\.(js|css|svg)$/)) {
        // JS, CSS, SVG get long cache with immutable
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (path.match(/\.(bin|dat|exe|dll|so|dylib)$/)) {
        // Binary files also get long cache with immutable
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
      // Other file types use the default maxAge setting
    },
  }),
);
app.use(express.json());

app.set("trust proxy", 3);
app.use(
  rateLimit({
    windowMs: 1000, // 1 second
    max: 20, // 20 requests per IP per second
  }),
);

let publicLobbiesJsonStr = "";

const publicLobbyIDs: Set<string> = new Set();

// Start the master process
export async function startMaster() {
  if (!cluster.isPrimary) {
    throw new Error(
      "startMaster() should only be called in the primary process",
    );
  }

  log.info(`Primary ${process.pid} is running`);
  log.info(`Setting up ${config.numWorkers()} workers...`);

  // Fork workers
  for (let i = 0; i < config.numWorkers(); i++) {
    const worker = cluster.fork({
      WORKER_ID: i,
    });

    log.info(`Started worker ${i} (PID: ${worker.process.pid})`);
  }

  cluster.on("message", (worker, message) => {
    if (message.type === "WORKER_READY") {
      const workerId = message.workerId;
      readyWorkers.add(workerId);
      log.info(
        `Worker ${workerId} is ready. (${readyWorkers.size}/${config.numWorkers()} ready)`,
      );
      // Start scheduling when all workers are ready
      if (readyWorkers.size === config.numWorkers()) {
        log.info("All workers ready, starting game scheduling");

        let isScheduling = false;

        const scheduleLobbies = async () => {
          if (isScheduling) return; // Prevent concurrent scheduling
          isScheduling = true;
          try {
            await schedulePublicGame(playlist);
            // Refresh lobbies after scheduling so clients can see the new game
            await fetchLobbies();
          } finally {
            isScheduling = false;
          }
        };

        const checkAndSchedule = async () => {
          const lobbies = await fetchLobbies();
          log.info(`Checked lobbies: ${lobbies} active lobbies`);
          if (lobbies === 0) {
            await scheduleLobbies();
          }
        };

        // Schedule immediately on startup
        checkAndSchedule();

        // Check periodically if we need to schedule new games
        // In dev mode, check more frequently to see map rotation faster
        const scheduleInterval = config.gameCreationRate() * 2;
        setInterval(checkAndSchedule, scheduleInterval);

        // Refresh lobby info frequently and schedule new game if needed.
        // Lower interval improves how quickly newly-joined players show up on the main page.
        setInterval(async () => {
          const lobbies = await fetchLobbies();
          if (lobbies === 0) {
            await scheduleLobbies();
          }
        }, 1000);
      }
    }
  });

  // Handle worker crashes
  cluster.on("exit", (worker, code, signal) => {
    const workerId = (worker as any).process?.env?.WORKER_ID;
    if (!workerId) {
      log.error(`worker crashed could not find id`);
      return;
    }

    log.warn(
      `Worker ${workerId} (PID: ${worker.process.pid}) died with code: ${code} and signal: ${signal}`,
    );
    log.info(`Restarting worker ${workerId}...`);

    // Restart the worker with the same ID
    const newWorker = cluster.fork({
      WORKER_ID: workerId,
    });

    log.info(
      `Restarted worker ${workerId} (New PID: ${newWorker.process.pid})`,
    );
  });

  const PORT = 3000;
  server.listen(PORT, () => {
    log.info(`Master HTTP server listening on port ${PORT}`);
  });
}

app.get("/api/env", async (req, res) => {
  const envConfig = {
    game_env: process.env.GAME_ENV,
  };
  if (!envConfig.game_env) return res.sendStatus(500);
  res.json(envConfig);
});

// Add lobbies endpoint to list public games for this worker
app.get("/api/public_lobbies", async (req, res) => {
  res.send(publicLobbiesJsonStr);
});

// API endpoint to change the map for the current public lobby
const MAP_CHANGE_LOCKOUT_MS = 10 * 1000; // 10 seconds before game starts

app.post("/api/change_map/:direction", async (req, res) => {
  // Check if any lobby is about to start (within lockout period)
  const lobbies = JSON.parse(publicLobbiesJsonStr).lobbies as GameInfo[];
  for (const lobby of lobbies) {
    if (
      lobby.msUntilStart !== undefined &&
      lobby.msUntilStart <= MAP_CHANGE_LOCKOUT_MS
    ) {
      return res.status(409).json({
        error: "Cannot change map - game starting soon",
        msUntilStart: lobby.msUntilStart,
      });
    }
  }

  const direction = req.params.direction;

  if (direction === "next") {
    playlist.nextMap();
  } else if (direction === "previous") {
    playlist.previousMap();
  } else {
    return res
      .status(400)
      .json({ error: "Invalid direction. Use 'next' or 'previous'" });
  }

  // Delete all current public lobbies and create a new one with the new map
  for (const gameID of publicLobbyIDs) {
    try {
      const port = config.workerPort(gameID);
      await fetch(`http://localhost:${port}/api/cancel_game/${gameID}`, {
        method: "POST",
        headers: { [config.adminHeader()]: config.adminToken() },
      });
    } catch (error) {
      log.error(`Error cancelling game ${gameID}:`, error);
    }
    publicLobbyIDs.delete(gameID);
  }

  // Schedule a new game with the new map
  try {
    await schedulePublicGame(playlist);
    await fetchLobbies();
    res
      .status(200)
      .json({ success: true, mapIndex: playlist.getCurrentMapIndex() });
  } catch (error) {
    log.error("Error scheduling new game after map change:", error);
    res.status(500).json({ error: "Failed to schedule new game" });
  }
});

// API endpoint to start the current public game immediately
app.post("/api/start_now", async (req, res) => {
  // Find the first public lobby and start it immediately
  for (const gameID of publicLobbyIDs) {
    try {
      const port = config.workerPort(gameID);
      const response = await fetch(
        `http://localhost:${port}/api/start_public_game/${gameID}`,
        {
          method: "POST",
          headers: { [config.adminHeader()]: config.adminToken() },
        },
      );

      if (response.ok) {
        publicLobbyIDs.delete(gameID);
        // Schedule a new game for the next players
        await schedulePublicGame(playlist);
        await fetchLobbies();
        return res.status(200).json({ success: true, gameID });
      }
    } catch (error) {
      log.error(`Error starting game ${gameID}:`, error);
    }
  }

  res.status(404).json({ error: "No public lobby found to start" });
});

app.post("/api/kick_player/:gameID/:clientID", async (req, res) => {
  if (req.headers[config.adminHeader()] !== config.adminToken()) {
    res.status(401).send("Unauthorized");
    return;
  }

  const { gameID, clientID } = req.params;

  if (!ID.safeParse(gameID).success || !ID.safeParse(clientID).success) {
    res.sendStatus(400);
    return;
  }

  try {
    const response = await fetch(
      `http://localhost:${config.workerPort(gameID)}/api/kick_player/${gameID}/${clientID}`,
      {
        method: "POST",
        headers: {
          [config.adminHeader()]: config.adminToken(),
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to kick player: ${response.statusText}`);
    }

    res.status(200).send("Player kicked successfully");
  } catch (error) {
    log.error(`Error kicking player from game ${gameID}:`, error);
    res.status(500).send("Failed to kick player");
  }
});

async function fetchLobbies(): Promise<number> {
  const fetchPromises: Promise<GameInfo | null>[] = [];

  for (const gameID of new Set(publicLobbyIDs)) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000); // 5 second timeout
    const port = config.workerPort(gameID);
    const promise = fetch(`http://localhost:${port}/api/game/${gameID}`, {
      headers: { [config.adminHeader()]: config.adminToken() },
      signal: controller.signal,
    })
      .then((resp) => {
        if (!resp.ok) {
          // Game not found (404) or other error - remove from tracking
          publicLobbyIDs.delete(gameID);
          return null;
        }
        return resp.json();
      })
      .then((json) => {
        if (json === null) return null;
        return json as GameInfo;
      })
      .catch((error) => {
        log.error(`Error fetching game ${gameID}:`, error);
        // Return null or a placeholder if fetch fails
        publicLobbyIDs.delete(gameID);
        return null;
      });

    fetchPromises.push(promise);
  }

  // Wait for all promises to resolve
  const results = await Promise.all(fetchPromises);

  // Filter out any null results from failed fetches
  const lobbyInfos: GameInfo[] = results
    .filter((result) => result !== null)
    .map((gi: GameInfo) => {
      return {
        gameID: gi.gameID,
        numClients: gi?.clients?.length ?? 0,
        clients: gi?.clients ?? [], // Include client info for player names
        gameConfig: gi.gameConfig,
        msUntilStart: (gi.msUntilStart ?? Date.now()) - Date.now(),
      } as GameInfo;
    });

  lobbyInfos.forEach((l) => {
    if (
      "msUntilStart" in l &&
      l.msUntilStart !== undefined &&
      l.msUntilStart <= 250
    ) {
      log.info(
        `Removing game ${l.gameID} from publicLobbyIDs: msUntilStart=${l.msUntilStart}`,
      );
      publicLobbyIDs.delete(l.gameID);
      return;
    }

    if (
      "gameConfig" in l &&
      l.gameConfig !== undefined &&
      "maxPlayers" in l.gameConfig &&
      l.gameConfig.maxPlayers !== undefined &&
      "numClients" in l &&
      l.numClients !== undefined &&
      l.gameConfig.maxPlayers <= l.numClients
    ) {
      log.info(`Removing game ${l.gameID} from publicLobbyIDs: full`);
      publicLobbyIDs.delete(l.gameID);
      return;
    }
  });

  // Update the JSON string
  log.info(`Updating publicLobbiesJsonStr with ${lobbyInfos.length} lobbies`);
  publicLobbiesJsonStr = JSON.stringify({
    lobbies: lobbyInfos,
  });

  return publicLobbyIDs.size;
}

// Function to schedule a new public game
async function schedulePublicGame(playlist: MapPlaylist) {
  const gameID = generateID();
  publicLobbyIDs.add(gameID);
  log.info(
    `Added game ${gameID} to publicLobbyIDs, total: ${publicLobbyIDs.size}`,
  );

  const workerPath = config.workerPath(gameID);

  // Send request to the worker to start the game
  try {
    const response = await fetch(
      `http://localhost:${config.workerPort(gameID)}/api/create_game/${gameID}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [config.adminHeader()]: config.adminToken(),
        },
        body: JSON.stringify(playlist.gameConfig()),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to schedule public game: ${response.statusText}`);
    }
  } catch (error) {
    log.error(`Failed to schedule public game on worker ${workerPath}:`, error);
    throw error;
  }
}

// SPA fallback route
app.get("*", function (req, res) {
  res.sendFile(path.join(__dirname, "../../static/index.html"));
});
