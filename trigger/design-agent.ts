import { logger, task } from "@trigger.dev/sdk";

/** Payload the design route hands to the background task. */
export interface DesignAgentPayload {
  prompt: string;
  roomId: string;
}

/**
 * Durable design-generation task. This is the wiring shell only: it accepts the
 * prompt + target room and logs them. No AI providers are called and no
 * nodes/edges are produced yet — that lands in a later unit. Kept on the same
 * plain `task` pattern as `example.ts` rather than introducing a schema layer.
 */
export const designAgent = task({
  id: "design-agent",
  run: async (payload: DesignAgentPayload) => {
    logger.info("design-agent received request", {
      roomId: payload.roomId,
      prompt: payload.prompt,
    });

    return {
      status: "received" as const,
      roomId: payload.roomId,
      prompt: payload.prompt,
    };
  },
});
