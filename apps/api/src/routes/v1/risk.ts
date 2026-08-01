import type { FastifyInstance } from "fastify";
import { registerCommercialPlaceholderRoutes } from "./commercial.js";

export async function registerRiskRoutes(app: FastifyInstance) {
  registerCommercialPlaceholderRoutes(app, "risk-workbench", [{ method: "GET", url: "/risk/overview" }]);
}
