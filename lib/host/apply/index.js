// Host apply orchestration: build an explicit activation context and wire factories in original order.

import { createState } from "./state.js";
import { createUpdates } from "./updates.js";
import { createController } from "./controller.js";
import { createQuotaService } from "./quota-service.js";
import { createMediaService } from "./media-service.js";
import { createReferences } from "./references.js";
import { createInterpret } from "./interpret.js";
import { createMediaFailures } from "./media-failures.js";
import { createSessionStatus } from "./session-status.js";
import { createImageJobs } from "./image-jobs.js";
import { createVideoJobs } from "./video-jobs.js";
import { createVideoCommand } from "./video-command.js";
import { createVideoEdit } from "./video-edit.js";
import { createAgentTool } from "./agent-tool.js";
import { createLifecycle } from "./lifecycle.js";
import { createCommands } from "./commands.js";
import { createHttpRoutes } from "./http-routes.js";

export function applyImpl(ctx, config) {
  const shared = { ctx, config };
  Object.assign(shared, createState(shared));
  Object.assign(shared, createUpdates(shared));
  Object.assign(shared, createController(shared));
  Object.assign(shared, createQuotaService(shared));
  Object.assign(shared, createMediaService(shared));
  Object.assign(shared, createReferences(shared));
  Object.assign(shared, createInterpret(shared));
  Object.assign(shared, createMediaFailures(shared));
  Object.assign(shared, createSessionStatus(shared));
  Object.assign(shared, createImageJobs(shared));
  Object.assign(shared, createVideoJobs(shared));
  Object.assign(shared, createVideoCommand(shared));
  Object.assign(shared, createVideoEdit(shared));
  Object.assign(shared, createAgentTool(shared));
  Object.assign(shared, createLifecycle(shared));
  Object.assign(shared, createCommands(shared));
  shared.registerAgentTool();
  Object.assign(shared, createHttpRoutes(shared));
}
