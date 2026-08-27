import { prismaExtension } from "@trigger.dev/build/extensions/prisma";
import { defineConfig } from "@trigger.dev/sdk";
import { config } from "dotenv";

// The CLI resolves `.env`, `.env.development`, `.env.local`,
// `.env.development.local`, and `dev.vars` into an object it hands to the task
// worker — `resolveDotEnvVars` writes into a local object, never `process.env`
// (`trigger.dev/dist/esm/utilities/dotEnv.js`). So nothing is loaded into the
// process that evaluates *this* file, and TRIGGER_PROJECT_REF has to be read
// here explicitly.
//
// Tasks need no such help: `.env.local` reaches them through that resolver like
// every other key. Note the CLI's precedence is the **inverse** of Next.js's —
// first file found wins, so `.env` beats `.env.local` there and loses to it here.
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
  build: {
    extensions: [
      // `generate-spec` writes a `ProjectSpec` row, so Prisma is now part of the
      // task bundle. "modern" is the mode for this project's setup — Prisma 7
      // with the `prisma-client` provider and the `@prisma/adapter-pg` driver
      // adapter — and it keeps `@prisma/client` external (the generated client
      // in `app/generated/prisma` imports `@prisma/client/runtime/client`).
      //
      // Modern mode does not run `prisma generate` for you. The generated client
      // is gitignored, so a deploy must run `prisma generate` first — the same
      // pre-existing requirement the Next.js build already has.
      prismaExtension({ mode: "modern" }),
    ],
  },
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
