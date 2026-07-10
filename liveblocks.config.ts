// Define Liveblocks types for your application
// https://liveblocks.io/docs/api-reference/liveblocks-react#Typing-your-data
declare global {
  interface Liveblocks {
    // Each user's Presence, for useMyPresence, useOthers, etc.
    Presence: {
      // Real-time cursor coordinates on the canvas (null when off-canvas).
      cursor: { x: number; y: number } | null;
      // Whether this user is currently prompting the AI assistant.
      thinking: boolean;
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

    // Custom events, for useBroadcastEvent, useEventListener
    // Example: | { type: "PLAY" } | { type: "REACTION"; emoji: "🔥" };
    RoomEvent: Record<string, never>;

    // Custom metadata set on threads, for useThreads, useCreateThread, etc.
    ThreadMetadata: Record<string, never>;

    // Custom room info set with resolveRoomsInfo, for useRoomInfo
    RoomInfo: Record<string, never>;
  }
}

export {};
