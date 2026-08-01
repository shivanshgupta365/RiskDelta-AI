import type { FastifyInstance } from "fastify";
import { registerCommercialPlaceholderRoutes } from "./commercial.js";

export async function registerPolicyRoutes(app: FastifyInstance) {
  registerCommercialPlaceholderRoutes(app, "policies", [
    { method: "GET", url: "/policies" },
    { method: "GET", url: "/policies/:id" },
    { method: "POST", url: "/policies" },
    { method: "PATCH", url: "/policies/:id" },
    { method: "POST", url: "/policies/:id/simulate" },
  ]);
}
