import type { FastifyInstance } from "fastify";
import { registerCommercialPlaceholderRoutes } from "./commercial.js";

export async function registerIncidentRoutes(app: FastifyInstance) {
  registerCommercialPlaceholderRoutes(app, "incidents", [
    { method: "GET", url: "/incidents" },
    { method: "GET", url: "/incidents/:id" },
    { method: "PATCH", url: "/incidents/:id/status" },
  ]);
}
