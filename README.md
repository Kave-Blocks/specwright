This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Background tasks (Trigger.dev)

Durable background work (the design and spec agents in `trigger/`) runs on [Trigger.dev](https://trigger.dev). The Next.js dev server does **not** execute tasks — you need the Trigger dev server running alongside it in a second terminal:

```bash
npm run trigger:dev     # registers tasks and runs them locally
npm run trigger:deploy  # ship tasks to the cloud
```

This needs `TRIGGER_SECRET_KEY` (the **DEV** key from the Trigger.dev dashboard's API Keys page) in your `.env.local`. The first run also asks you to log the CLI in via the browser.

### Versioning

The CLI is a pinned devDependency rather than an `npx trigger.dev@latest` call, so the lockfile — not the npm registry — decides which version you run. That matters because **the CLI and the SDK must be on the same major**; a `@latest` CLI against our pinned SDK would break `dev` and `deploy` the day Trigger.dev ships its next major.

Four packages therefore move together, pinned exactly (no caret):

| Package | Kind |
| --- | --- |
| `@trigger.dev/sdk` | dependency |
| `@trigger.dev/react-hooks` | dependency |
| `@trigger.dev/build` | devDependency |
| `trigger.dev` (the CLI) | devDependency |

To upgrade, bump all of them in a single commit:

```bash
npm add --save-exact @trigger.dev/sdk@<version> @trigger.dev/react-hooks@<version>
npm add --save-dev --save-exact @trigger.dev/build@<version> trigger.dev@<version>
```

Two things that surprise people:

- The CLI's binary is named `trigger`, not `trigger.dev` — which is why the scripts read `trigger dev` and don't mirror the package name.
- The agent skill files under `.claude/skills/trigger-*` and `.github/skills/trigger-*` are **generated** by the Trigger.dev installer. Don't hand-edit them; re-run the installer after an upgrade, or your changes get overwritten.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
