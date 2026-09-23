import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULTS = {
  input: path.join(
    __dirname,
    "../static/script-data/fda-validated-final-list.json",
  ),
  outputScriptData: path.join(
    __dirname,
    "../static/script-data/working-list-final.json",
  ),
};

function parseArgs(argv) {
  const args = {
    ...DEFAULTS,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];

    if (current === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (current === "--input") {
      args.input = path.resolve(process.cwd(), String(argv[i + 1] ?? ""));
      i += 1;
      continue;
    }

    if (current === "--output-script-data") {
      args.outputScriptData = path.resolve(
        process.cwd(),
        String(argv[i + 1] ?? ""),
      );
      i += 1;
      continue;
    }
  }

  return args;
}

function normalizeBrand(value) {
  return String(value ?? "").trim();
}

function toDomainSlug(value) {
  return normalizeBrand(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function validateInputRows(rows) {
  if (!Array.isArray(rows)) {
    throw new Error("Input JSON must be an array");
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || typeof row !== "object") {
      throw new Error(`Input row ${i + 1} must be an object`);
    }

    if (!("brand" in row)) {
      throw new Error(`Input row ${i + 1} missing brand`);
    }
  }
}

function validateOutputRows(rows) {
  if (!Array.isArray(rows)) {
    throw new Error("Output must be an array");
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];

    const required = ["brand", "website", "redirect", "status"];
    for (const key of required) {
      if (!(key in row)) {
        throw new Error(`Output row ${i + 1} missing ${key}`);
      }
    }

    if (typeof row.brand !== "string" || !row.brand.trim()) {
      throw new Error(`Output row ${i + 1} has invalid brand`);
    }

    if (typeof row.website !== "string" || !row.website.trim()) {
      throw new Error(`Output row ${i + 1} has invalid website`);
    }

    if (
      typeof row.redirect !== "string" ||
      !row.redirect.startsWith("https://")
    ) {
      throw new Error(`Output row ${i + 1} has invalid redirect`);
    }

    if (row.status !== "active") {
      throw new Error(`Output row ${i + 1} has invalid status`);
    }
  }
}

function buildWorkingList(inputRows) {
  const seen = new Set();
  const out = [];

  for (const row of inputRows) {
    const brand = normalizeBrand(row.brand);
    if (!brand) continue;

    const slug = toDomainSlug(brand);
    if (!slug) continue;

    const dedupeKey = brand.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const website = `${slug}.com`;

    out.push({
      brand,
      website,
      redirect: `https://${website}/`,
      status: "active",
    });
  }

  return out;
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log("Step 3: Generate websites list from FDA validated list");
  console.log(`Input: ${options.input}`);
  console.log(`Output (script-data): ${options.outputScriptData}`);

  const inputRaw = await fs.readFile(options.input, "utf8");
  const inputRows = JSON.parse(inputRaw);
  validateInputRows(inputRows);

  const outputRows = buildWorkingList(inputRows);
  validateOutputRows(outputRows);

  console.log(`Input rows: ${inputRows.length}`);
  console.log(`Output rows: ${outputRows.length}`);

  if (options.dryRun) {
    console.log("Dry run complete. Files not written.");
    return;
  }

  await writeJson(options.outputScriptData, outputRows);

  console.log(`Saved: ${options.outputScriptData}`);
}

main().catch((error) => {
  console.error(`Step 3 failed: ${error.message || error}`);
  process.exit(1);
});
