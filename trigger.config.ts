import { defineConfig } from "@trigger.dev/sdk";
import { config } from "dotenv";

// The Trigger.dev CLI evaluates this file in Node and only auto-loads `.env`,
// so load Next.js's `.env.local` here to pick up TRIGGER_PROJECT_REF.
// In CI/deploy, set TRIGGER_PROJECT_REF in the environment instead.
config({ path: ".env.local" });

const projectRef = process.env.TRIGGER_PROJECT_REF;

if (!projectRef) {
  throw new Error(
    "TRIGGER_PROJECT_REF is not set. Add it to .env.local (get the ref, starting with 'proj_', from your Trigger.dev dashboard).",
  );
}

export default defineConfig({
  project: projectRef,
  runtime: "node",
  dirs: ["./trigger"],
  maxDuration: 36000,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      randomize: true,
    },
  },
});
