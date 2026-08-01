import type { FastifyInstance } from "fastify";
import { registerCommercialPlaceholderRoutes } from "./commercial.js";

export async function registerIntegrationRoutes(app: FastifyInstance) {
  registerCommercialPlaceholderRoutes(app, "integrations", [
    { method: "GET", url: "/integrations" },
    { method: "POST", url: "/integrations" },
    { method: "PATCH", url: "/integrations/:id" },
    { method: "POST", url: "/integrations/:id/verify" },
  ]);
}
