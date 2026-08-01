import type { FastifyInstance } from "fastify";
import { registerCommercialPlaceholderRoutes } from "./commercial.js";

export async function registerRuntimeControlRoutes(app: FastifyInstance) {
  registerCommercialPlaceholderRoutes(app, "runtime-controls", [
    { method: "GET", url: "/runtime-controls" },
    { method: "GET", url: "/runtime-controls/:slug" },
  ]);
}
