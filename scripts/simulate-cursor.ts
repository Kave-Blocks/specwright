/**
 * Simulates a second participant on a canvas — a moving cursor plus a held
 * selection — so live cursors and remote selection highlights can be verified
 * with a single browser window and a single mouse.
 *
 * It writes presence through `liveblocks.setPresence` from the node SDK, the same
 * path the AI agent uses (see `trigger/design-agent.ts`) and the same presence a
 * real browser participant produces. If the phantom renders, the whole read side
 * is proven: the presence subscription, `useOthers`/`useOther`, the flow-
 * coordinate mapping, and the selection highlights on nodes and edges.
 *
 * With no element ids, it selects the first node in the room so there is always
 * something to look at, and prints the room's other ids so a specific node or
 * edge can be targeted instead.
 *
 * Usage:
 *   pnpm simulate:cursor <roomId> [elementId...]
 *   pnpm simulate:cursor hello-pr5xvs
 *   pnpm simulate:cursor hello-pr5xvs node_abc edge_def
 *
 * Stop with Ctrl-C; presence is cleared on exit so the phantom disappears.
 */
import { Liveblocks } from "@liveblocks/node";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

/** The phantom's identity — deliberately not a real Clerk user id. */
const USER_ID = "phantom-tester";
const NAME = "Phantom Tester";
const COLOR = "#f472b6"; // pink, from the CURSOR_COLORS palette in lib/liveblocks.ts

/** How often presence is pushed. The cursor's 100ms transition smooths this. */
const TICK_MS = 200;
/** Presence lifetime, refreshed on every tick. Short so a crash self-cleans. */
const TTL_SECONDS = 15;
/** Short TTL on exit so the phantom disappears promptly. */
const CLEAR_TTL_SECONDS = 1;

/** A lazy figure-eight through canvas coordinates. */
const CENTER = { x: 400, y: 400 };
const RADIUS = { x: 320, y: 200 };
const PERIOD_MS = 8000;

/** A type alias, not an interface: only aliases satisfy the SDK's `JsonObject`. */
type Selection = {
  nodes: string[];
  edges: string[];
};

function cursorAt(elapsedMs: number): { x: number; y: number } {
  const t = (elapsedMs / PERIOD_MS) * Math.PI * 2;
  return {
    x: Math.round(CENTER.x + Math.sin(t) * RADIUS.x),
    y: Math.round(CENTER.y + Math.sin(t * 2) * RADIUS.y),
  };
}

/**
 * Read the room's node and edge ids straight out of Storage. The React Flow
 * integration keeps them as maps keyed by id under `flow` — see the storage
 * shape written by `useLiveblocksFlow`.
 */
async function readGraphIds(
  liveblocks: Liveblocks,
  roomId: string,
): Promise<{ nodes: string[]; edges: string[] }> {
  const storage = (await liveblocks.getStorageDocument(roomId, "json")) as {
    flow?: { nodes?: Record<string, unknown>; edges?: Record<string, unknown> };
  };

  return {
    nodes: Object.keys(storage.flow?.nodes ?? {}),
    edges: Object.keys(storage.flow?.edges ?? {}),
  };
}

/**
 * Split the requested ids into nodes and edges by looking each one up in the
 * room, so the caller can pass ids without caring which kind they are. Ids that
 * match nothing are reported rather than silently held as a selection nobody can
 * see.
 */
function resolveSelection(
  requested: string[],
  graph: { nodes: string[]; edges: string[] },
): { selection: Selection; unknown: string[] } {
  const nodeIds = new Set(graph.nodes);
  const edgeIds = new Set(graph.edges);
  const selection: Selection = { nodes: [], edges: [] };
  const unknown: string[] = [];

  for (const id of requested) {
    if (nodeIds.has(id)) selection.nodes.push(id);
    else if (edgeIds.has(id)) selection.edges.push(id);
    else unknown.push(id);
  }

  return { selection, unknown };
}

async function main(): Promise<void> {
  const [roomId, ...requestedIds] = process.argv.slice(2);

  if (!roomId) {
    console.error("Usage: pnpm simulate:cursor <roomId> [elementId...]");
    console.error("The roomId is the project id in the editor URL:");
    console.error("  localhost:3000/editor/hello-pr5xvs  ->  hello-pr5xvs");
    process.exit(1);
  }

  const secret = process.env.LIVEBLOCKS_SECRET_KEY;

  if (!secret) {
    console.error("LIVEBLOCKS_SECRET_KEY is not set (.env.local or .env)");
    process.exit(1);
  }

  const liveblocks = new Liveblocks({ secret });
  const graph = await readGraphIds(liveblocks, roomId);

  let selection: Selection;

  if (requestedIds.length > 0) {
    const resolved = resolveSelection(requestedIds, graph);
    selection = resolved.selection;

    if (resolved.unknown.length > 0) {
      console.warn(
        `Not in room "${roomId}", ignoring: ${resolved.unknown.join(", ")}`,
      );
    }
  } else {
    // Nothing requested: hold the first node so there is always a visible
    // selection highlight to check, and show what else could be targeted.
    selection = { nodes: graph.nodes.slice(0, 1), edges: [] };
  }

  const startedAt = Date.now();
  let stopping = false;

  const push = async (): Promise<void> => {
    if (stopping) return;

    try {
      await liveblocks.setPresence(roomId, {
        userId: USER_ID,
        data: {
          cursor: cursorAt(Date.now() - startedAt),
          thinking: false,
          selection:
            selection.nodes.length > 0 || selection.edges.length > 0
              ? selection
              : null,
        },
        userInfo: { name: NAME, avatar: "", color: COLOR },
        ttl: TTL_SECONDS,
      });
    } catch (error) {
      console.error(
        "setPresence failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  // Prove the room and credentials are good before claiming success.
  await push();

  console.log(`Phantom "${NAME}" is now in room "${roomId}".`);
  console.log(`  cursor:    tracing a figure-eight across the canvas`);
  console.log(
    `  selection: ${
      selection.nodes.length + selection.edges.length > 0
        ? [...selection.nodes, ...selection.edges].join(", ")
        : "none (the room has no nodes or edges yet)"
    }`,
  );
  console.log(`\nOpen localhost:3000/editor/${roomId} — you should see a pink`);
  console.log(`cursor moving, and a pink box around the selected node.`);

  if (requestedIds.length === 0 && graph.nodes.length + graph.edges.length > 0) {
    console.log(`\nTo target something else, pass its id:`);
    console.log(`  nodes: ${graph.nodes.join(" ") || "(none)"}`);
    console.log(`  edges: ${graph.edges.join(" ") || "(none)"}`);
  }

  console.log("\nPress Ctrl-C to stop.");

  const timer = setInterval(() => void push(), TICK_MS);

  const shutdown = async (): Promise<void> => {
    stopping = true;
    clearInterval(timer);

    try {
      await liveblocks.setPresence(roomId, {
        userId: USER_ID,
        data: { cursor: null, thinking: false, selection: null },
        userInfo: { name: NAME, avatar: "", color: COLOR },
        ttl: CLEAR_TTL_SECONDS,
      });
    } catch {
      // Best-effort: the short TTL expires it anyway.
    }

    console.log("\nPhantom cleared.");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main();
