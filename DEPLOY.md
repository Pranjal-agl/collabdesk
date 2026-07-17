# Deploying CollabDesk for free (Render)

This repo is set up to deploy as a **single Docker container**: Spring Boot serves
both the `/api` REST endpoints and the built Angular app (as static files), so
there's no separate frontend host, no CORS to configure, and no external
database to provision. The `Dockerfile` at the repo root does the whole build.

## Why this shape, and the one tradeoff

The database is embedded H2, stored on the container's local disk. Render's
free web services don't have persistent disk — every restart (including
waking up from the 15-minute idle spin-down) starts a fresh container. That
means **any data created during a session resets** on the next cold start.
For a demo/portfolio project this is arguably a feature, not a bug: every
demo starts from the same known-good seeded state (`data.sql`), and login
credentials never drift. If you want data to actually persist across
restarts, swap the datasource for a real free Postgres (e.g. Neon or
Supabase) — ask and I'll wire that in.

## Steps

1. **Push this repo to GitHub** if it isn't already (Render deploys from a
   GitHub connection).

2. **Generate a real JWT secret** — don't deploy with the placeholder in
   `application.yml`. Any 256-bit-plus random string works, e.g.:
   ```bash
   openssl rand -base64 48
   ```
   Save the output; you'll paste it into Render in a moment.

3. **Create a Render account** at render.com (free, no card required for
   this tier) and click **New > Web Service**.

4. **Connect your GitHub repo.** Render will detect the `Dockerfile` at the
   repo root automatically — select **Docker** as the environment if asked.

5. **Instance type: Free.**

6. **Environment variables** (Render dashboard → your service → Environment):
   | Key | Value |
   |---|---|
   | `JWT_SECRET` | the string you generated in step 2 |
   | `SPRING_PROFILES_ACTIVE` | `prod` |

   The `prod` profile (`application-prod.yml`) disables the H2 web console
   (you don't want a public DB browser on a live URL) and refuses to start
   if `JWT_SECRET` isn't actually set, instead of silently signing tokens
   with a known placeholder.

7. **Health check path:** leave it as `/` (default). This repo doesn't
   include Spring Boot Actuator, so `/actuator/health` — which you may see
   suggested in Render's own docs — won't exist here; `/` serves the
   Angular shell and returns 200, which is enough for Render's check.

8. **Deploy.** First build takes a few minutes (it's compiling both the
   Angular app and the Spring Boot jar in the same pipeline). Render gives
   you a URL like `https://collabdesk.onrender.com` when it's live.

9. **Log in** with any of the seeded users (all password `admin123`):
   `alice@acme.com` (admin), `bob@acme.com` (member).

## What to expect on the free tier

- **Cold starts:** after ~15 minutes with no traffic, the service spins
  down. The next request wakes it up, which takes roughly 30–60 seconds
  (first the container boots, then the JVM starts). This is normal — not a
  bug in your app.
- **750 free instance-hours/month** per Render workspace. A single always-
  on demo service well under that unless you're running it 24/7 for the
  whole month.
- **Data resets** on every cold start, per the tradeoff above.

## What I couldn't verify from here

I don't have Docker or Maven available in this environment, so I could not
actually run `docker build` end-to-end myself. I traced through the
Dockerfile stage-by-stage and confirmed the Angular output path
(`dist/collabdesk/browser`) matches what the Dockerfile copies, but the
build itself is unverified. Push it and watch Render's build log — if it
fails partway through, paste me the log and I'll fix it, the same way we
worked through the GitHub Actions failures.
