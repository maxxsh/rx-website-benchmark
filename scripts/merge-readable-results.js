import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GROUPED_FILE = path.join(
  __dirname,
  "../static/readable/grouped-results.json"
);
const MANUAL_FILE = path.join(
  __dirname,
  "../static/readable/manual-grouped-results.json"
);
const OUTPUT_FILE = path.join(
  __dirname,
  "../static/readable/combined-readable-results.json"
);

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const cleaned = raw.replace(/^\uFEFF/, "");
  return JSON.parse(cleaned);
}

function normalizeHostname(hostname) {
  return hostname.replace(/^www\./i, "");
}

function findMatchingUrl(manualKey, groupedResults) {
  const entries = Object.keys(groupedResults);
  const matches = [];

  for (const url of entries) {
    try {
      const parsed = new URL(url);
      const hostname = normalizeHostname(parsed.hostname).toLowerCase();
      const pathLower = parsed.pathname.toLowerCase();
      const keyLower = manualKey.toLowerCase();

      if (hostname.includes(keyLower) || pathLower.includes(`/${keyLower}`)) {
        matches.push(url);
      }
    } catch {
      // Skip invalid URLs
    }
  }

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    const exactHost = matches.find((url) => {
      try {
        const parsed = new URL(url);
        const hostname = normalizeHostname(parsed.hostname).toLowerCase();
        return (
          hostname === manualKey.toLowerCase() ||
          hostname.startsWith(`${manualKey.toLowerCase()}.`)
        );
      } catch {
        return false;
      }
    });

    return exactHost || matches[0];
  }

  return null;
}

function mergeManualIntoGrouped(groupedData, manualData) {
  const combined = JSON.parse(JSON.stringify(groupedData));
  const manualResults = manualData.results || {};
  const groupedResults = combined.results || {};

  const missingMatches = [];
  const updated = [];

  for (const [manualKey, manualEntry] of Object.entries(manualResults)) {
    const matchUrl = findMatchingUrl(manualKey, groupedResults);

    if (!matchUrl) {
      missingMatches.push(manualKey);
      continue;
    }

    const existing = groupedResults[matchUrl] || { url: matchUrl };

    groupedResults[matchUrl] = {
      ...existing,
      title: manualEntry.title,
      fleschKincaidReadingEase: manualEntry.fleschKincaidReadingEase,
      gunningFogIndex: manualEntry.gunningFogIndex,
      spellingErrorPercentage: manualEntry.spellingErrorPercentage,
      wordCount: manualEntry.wordCount,
      excerpt: manualEntry.excerpt,
      timestamp: manualEntry.timestamp,
      manualTest: true,
      error: manualEntry.error ?? null,
    };

    updated.push({ manualKey, url: matchUrl });
  }

  return { combined, updated, missingMatches };
}

function main() {
  const groupedData = readJson(GROUPED_FILE);
  const manualData = readJson(MANUAL_FILE);

  const { combined, updated, missingMatches } = mergeManualIntoGrouped(
    groupedData,
    manualData
  );

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(combined, null, 2));

  console.log(`Combined file written: ${OUTPUT_FILE}`);
  console.log(`Updated ${updated.length} entries.`);
  if (missingMatches.length > 0) {
    console.log("No URL match for:", missingMatches.join(", "));
  }
}

main();
