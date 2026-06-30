#!/usr/bin/env node
/**
 * Scrapes each site listed in sites.json using the Firecrawl v2 /scrape API
 * (JSON extraction) and writes the combined results to data/events.json.
 *
 * The Firecrawl API key is read from the FIRECRAWL_API_KEY environment
 * variable. It is NEVER hardcoded here — locally export it in your shell,
 * and in GitHub Actions it comes from an encrypted repository secret.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const API_KEY = process.env.FIRECRAWL_API_KEY;
if (!API_KEY) {
  console.error("ERROR: FIRECRAWL_API_KEY environment variable is not set.");
  process.exit(1);
}

const SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";

const EXTRACT_PROMPT = [
  "Extract every upcoming event, course, program, class, or retreat listed on this page.",
  "For each one return:",
  "- event_name: the title of the event",
  "- event_date: the date exactly as shown on the page (keep the original text)",
  "- event_date_iso: the start date as YYYY-MM-DD if you can determine it (including the year); otherwise an empty string",
  "- link: the absolute URL to that event's own detail/registration page",
  "Only include events that have a clear name. Do not invent events.",
].join("\n");

const SCHEMA = {
  type: "object",
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          event_name: { type: "string" },
          event_date: { type: "string" },
          event_date_iso: { type: "string" },
          link: { type: "string" },
        },
        required: ["event_name"],
      },
    },
  },
};

/** Resolve a possibly-relative link against the source page URL. */
function absolutize(link, base) {
  if (!link) return "";
  try {
    return new URL(link, base).href;
  } catch {
    return link;
  }
}

async function scrapeSite(site, attempt = 1) {
  const body = {
    url: site.url,
    formats: [{ type: "json", prompt: EXTRACT_PROMPT, schema: SCHEMA }],
  };

  const res = await fetch(SCRAPE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    // Retry once on transient errors (rate limit / server errors).
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
      const wait = attempt * 5000;
      console.warn(`  ${site.organization}: HTTP ${res.status}, retrying in ${wait}ms…`);
      await new Promise((r) => setTimeout(r, wait));
      return scrapeSite(site, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const events = data?.data?.json?.events ?? [];
  return events;
}

async function main() {
  const sites = JSON.parse(await readFile(join(ROOT, "sites.json"), "utf8"));
  const allEvents = [];
  const errors = [];

  for (const site of sites) {
    process.stdout.write(`Scraping ${site.organization} … `);
    try {
      const events = await scrapeSite(site);
      for (const e of events) {
        if (!e?.event_name) continue;
        allEvents.push({
          organization: site.organization,
          event_name: String(e.event_name).trim(),
          event_date: String(e.event_date ?? "").trim(),
          event_date_iso: String(e.event_date_iso ?? "").trim(),
          link: absolutize(String(e.link ?? "").trim(), site.url),
          source_page: site.url,
        });
      }
      console.log(`${events.length} events`);
    } catch (err) {
      console.log(`FAILED — ${err.message}`);
      errors.push({ organization: site.organization, error: err.message });
    }
  }

  // Sort: events with a known ISO date first (chronologically), then the rest.
  allEvents.sort((a, b) => {
    if (a.event_date_iso && b.event_date_iso) {
      return a.event_date_iso.localeCompare(b.event_date_iso);
    }
    if (a.event_date_iso) return -1;
    if (b.event_date_iso) return 1;
    return a.organization.localeCompare(b.organization);
  });

  const output = {
    generated_at: new Date().toISOString(),
    site_count: sites.length,
    event_count: allEvents.length,
    errors,
    events: allEvents,
  };

  await writeFile(
    join(ROOT, "data", "events.json"),
    JSON.stringify(output, null, 2) + "\n",
    "utf8"
  );

  console.log(`\nWrote ${allEvents.length} events to data/events.json`);
  if (errors.length) {
    console.log(`${errors.length} site(s) failed — see "errors" in the JSON.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
