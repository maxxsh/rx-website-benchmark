import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULTS = {
  input: path.join(__dirname, "../static/script-data/working-list-final.json"),
  csv: path.join(__dirname, "../src/lib/manully-validated-338.csv"),
  output: path.join(
    __dirname,
    "../static/script-data/validated-working-list-final.json",
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

    if (current === "--csv") {
      args.csv = path.resolve(process.cwd(), String(argv[i + 1] ?? ""));
      i += 1;
      continue;
    }

    if (current === "--output") {
      args.output = path.resolve(process.cwd(), String(argv[i + 1] ?? ""));
      i += 1;
      continue;
    }
  }

  return args;
}

function normalizeBrand(value) {
  return String(value ?? "")
    .replace(/\*/g, "")
    .trim()
    .toLowerCase();
}

function normalizeWebsite(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseRedirectCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const byBrand = new Map();
  const byWebsite = new Map();
  let ignored = 0;

  for (const line of lines) {
    const cells = parseCsvLine(line);
    if (cells.length < 6) {
      ignored += 1;
      continue;
    }

    const brandRaw = cells[1] ?? "";
    const websiteRaw = cells[3] ?? "";
    const redirectRaw = cells[5] ?? "";

    const brand = normalizeBrand(brandRaw);
    const website = normalizeWebsite(websiteRaw);
    const redirect = String(redirectRaw ?? "").trim();

    if (!redirect) {
      ignored += 1;
      continue;
    }

    if (brand) {
      byBrand.set(brand, redirect);
    }

    if (website) {
      byWebsite.set(website, redirect);
    }
  }

  return {
    byBrand,
    byWebsite,
    ignored,
    parsedRows: lines.length,
  };
}

function validateWorkingRows(rows) {
  if (!Array.isArray(rows)) {
    throw new Error("Input JSON must be an array");
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || typeof row !== "object") {
      throw new Error(`Input row ${i + 1} must be an object`);
    }

    for (const key of ["brand", "website", "redirect", "status"]) {
      if (!(key in row)) {
        throw new Error(`Input row ${i + 1} missing ${key}`);
      }
    }
  }
}

function applyRedirects(workingRows, redirectLookup) {
  let appliedByBrand = 0;
  let appliedByWebsite = 0;
  let excluded = 0;
  const matchedBrands = new Set();

  const output = workingRows.flatMap((row) => {
    const brandKey = normalizeBrand(row.brand);
    const websiteKey = normalizeWebsite(row.website);

    let redirect = redirectLookup.byBrand.get(brandKey);
    let source = "brand";

    if (!redirect) {
      redirect = redirectLookup.byWebsite.get(websiteKey);
      source = "website";
    }

    if (!redirect) {
      excluded += 1;
      return [];
    }

    if (source === "brand") {
      appliedByBrand += 1;
      matchedBrands.add(brandKey);
    } else {
      appliedByWebsite += 1;
      for (const [key, value] of redirectLookup.byBrand) {
        if (value === redirect) matchedBrands.add(key);
      }
    }

    return [{
      ...row,
      redirect,
    }];
  });

  const missing = [...redirectLookup.byBrand.keys()].filter((key) => !matchedBrands.has(key));
  if (missing.length) {
    throw new Error(`Manually selected brands missing from candidate list: ${missing.join(", ")}`);
  }
  if (new Set(output.map((row) => row.redirect)).size !== output.length) {
    throw new Error("Manual selection contains duplicate homepage URLs");
  }

  return {
    output,
    appliedByBrand,
    appliedByWebsite,
    excluded,
  };
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log("Step 4: Select manually verified homepages and apply curated URLs");
  console.log(`Input: ${options.input}`);
  console.log(`CSV: ${options.csv}`);
  console.log(`Output: ${options.output}`);

  const workingRowsRaw = await fs.readFile(options.input, "utf8");
  const workingRows = JSON.parse(workingRowsRaw);
  validateWorkingRows(workingRows);

  const csvText = await fs.readFile(options.csv, "utf8");
  const redirectLookup = parseRedirectCsv(csvText);

  const { output, appliedByBrand, appliedByWebsite, excluded } =
    applyRedirects(workingRows, redirectLookup);

  console.log(`Working rows: ${workingRows.length}`);
  console.log(`CSV rows parsed: ${redirectLookup.parsedRows}`);
  console.log(`CSV rows ignored: ${redirectLookup.ignored}`);
  console.log(`Redirects applied by brand: ${appliedByBrand}`);
  console.log(`Redirects applied by website: ${appliedByWebsite}`);
  console.log(`Excluded candidates: ${excluded}`);
  console.log(`Selected homepages: ${output.length}`);

  if (options.dryRun) {
    console.log("Dry run complete. Files not written.");
    return;
  }

  await writeJson(options.output, output);
  console.log(`Saved: ${options.output}`);
}

main().catch((error) => {
  console.error(`Step 4 failed: ${error.message || error}`);
  process.exit(1);
});
