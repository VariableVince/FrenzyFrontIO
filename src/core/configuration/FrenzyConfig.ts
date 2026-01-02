import { GameEnv } from "./Config";
import { DefaultServerConfig } from "./DefaultConfig";

/**
 * FrenzyFront server configuration.
 * Uses production-like settings but skips Cloudflare tunnel setup.
 * This is for self-hosted FrenzyFront deployments.
 */
export class FrenzyServerConfig extends DefaultServerConfig {
  numWorkers(): number {
    return 2;
  }

  env(): GameEnv {
    // Return Prod to get production game settings
    // But we handle tunnel skip separately in Server.ts
    return GameEnv.Prod;
  }

  jwtAudience(): string {
    return "frenzyfront.io";
  }

  // Override jwtIssuer to skip external API calls for cosmetics
  // We don't have an external API server, so just disable JWT verification
  jwtIssuer(): string {
    // Return empty string to effectively disable cosmetics fetching
    // The PrivilegeRefresher will fail but fail-open is designed for this
    return "";
  }

  adminToken(): string {
    return process.env.ADMIN_TOKEN ?? "frenzy_admin_key";
  }

  apiKey(): string {
    return process.env.API_KEY ?? "frenzy_api_key";
  }

  domain(): string {
    return process.env.DOMAIN ?? "frenzyfront.io";
  }

  subdomain(): string {
    return process.env.SUBDOMAIN ?? "";
  }
}

export const frenzyConfig = new FrenzyServerConfig();
