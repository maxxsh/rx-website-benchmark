import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CMS_DATA_URL =
  "https://data.cms.gov/data-api/v1/dataset/0ccf1b76-38e8-48c1-ad71-ab0eb69fb766/data?column=Brnd_Name,Gnrc_Name,Mftr_Name,Tot_Spndng_2023,Tot_Benes_2023&offset=0&size=100000&sort=-Tot_Benes_2023&filter[Mftr_Name]=Overall&filter[condition][path]=Tot_Benes_2023&filter[condition][operator]=%3C%3E&filter[condition][value]=";

const OUTPUT_PATH = path.join(
  __dirname,
  "../static/script-data/medicare-drugs-list.json",
);

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\*+$/g, "")
    .toLowerCase();
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    limit: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];

    if (current === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (current === "--limit") {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("--limit must be a positive number");
      }
      args.limit = Math.floor(value);
      i += 1;
    }
  }

  return args;
}

function validateRows(rows) {
  if (!Array.isArray(rows)) {
    throw new Error("Expected an array of rows");
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const required = [
      "Brnd_Name",
      "Gnrc_Name",
      "Mftr_Name",
      "Tot_Spndng_2023",
      "Tot_Benes_2023",
    ];

    for (const key of required) {
      if (!(key in row)) {
        throw new Error(`Row ${i + 1} is missing key: ${key}`);
      }
    }

    if (normalizeName(row.Brnd_Name) === normalizeName(row.Gnrc_Name)) {
      throw new Error(
        `Row ${i + 1} appears generic-only after filtering: ${row.Brnd_Name}`,
      );
    }
  }
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));

  console.log("Step 1: Fetch Medicare drug data");
  console.log(`Source: ${CMS_DATA_URL}`);

  const response = await fetch(CMS_DATA_URL);
  if (!response.ok) {
    throw new Error(
      `CMS request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("CMS response is not an array");
  }

  const filtered = payload.filter(
    (item) => normalizeName(item.Brnd_Name) !== normalizeName(item.Gnrc_Name),
  );

  const output =
    typeof limit === "number" ? filtered.slice(0, limit) : filtered;

  validateRows(output);

  const uniqueBrands = new Set(
    output.map((row) => normalizeName(row.Brnd_Name)).filter(Boolean),
  ).size;

  console.log(`Fetched rows: ${payload.length}`);
  console.log(`Filtered rows: ${output.length}`);
  console.log(`Unique brands: ${uniqueBrands}`);

  if (dryRun) {
    console.log("Dry run complete. File not written.");
    return;
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(
    OUTPUT_PATH,
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );

  console.log(`Saved: ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(`Step 1 failed: ${error.message || error}`);
  process.exit(1);
});
