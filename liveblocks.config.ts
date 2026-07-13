// Define Liveblocks types for your application
// https://liveblocks.io/docs/api-reference/liveblocks-react#Typing-your-data
import type { AiChatFeedMessage, AiStatusFeedMessage } from "@/types/tasks";

declare global {
  interface Liveblocks {
    // Each user's Presence, for useMyPresence, useOthers, etc.
    Presence: {
      // Real-time cursor coordinates on the canvas (null when off-canvas).
      cursor: { x: number; y: number } | null;
      // Whether this user is currently prompting the AI assistant.
      thinking: boolean;
      // What this user currently has selected, so every other participant can
      // see it. Selection lives in presence rather than Storage on purpose:
      // `@liveblocks/react-flow` pins `selected: false` in its node/edge sync
      // config, because one user's selection must never overwrite another's.
      // Presence is ephemeral and per-connection, which is exactly right — it
      // clears itself when the user disconnects.
      selection: { nodes: string[]; edges: string[] } | null;
    };

    // The Storage tree for the room, for useMutation, useStorage, etc.
    Storage: Record<string, never>;

    // Custom user info set when authenticating with a secret key
    UserMeta: {
      id: string;
      info: {
        // Display name shown next to the user's cursor / in the avatar stack.
        name: string;
        // Avatar image URL (empty string when the user has no avatar).
        avatar: string;
        // Deterministic cursor color derived from the user id.
        color: string;
      };
    };

    // Custom events, for useBroadcastEvent, useEventListener. Unused — AI status
    // is published through the shared `ai-status-feed` Liveblocks feed (see
    // `FeedMessageData` below and `types/tasks.ts`) rather than a parallel
    // broadcast channel.
    RoomEvent: Record<string, never>;

    // Custom metadata set on threads, for useThreads, useCreateThread, etc.
    ThreadMetadata: Record<string, never>;

    // Custom room info set with resolveRoomsInfo, for useRoomInfo
    RoomInfo: Record<string, never>;

    // Payload of each message in a Liveblocks feed, for useFeedMessages /
    // createFeedMessage. `FeedMessageData` is app-wide (one type for every
    // feed), so it is the union of the two feeds' payloads: the AI agents
    // publish progress into `ai-status-feed`, and room members chat in
    // `ai-chat`. The feeds stay separate — each reader validates the payload it
    // expects (`parseAiStatusFeedMessage` / `parseAiChatFeedMessage`) and skips
    // anything that doesn't match.
    FeedMessageData: AiStatusFeedMessage | AiChatFeedMessage;

    // Custom metadata set on a feed, for useFeeds / createFeed. Unused.
    FeedMetadata: Record<string, never>;
  }
}

export {};
