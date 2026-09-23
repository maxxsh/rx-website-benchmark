import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULTS = {
  input: path.join(__dirname, "../static/script-data/medicare-drugs-list.json"),
  output: path.join(
    __dirname,
    "../static/script-data/fda-validated-final-list.json",
  ),
  fdaBase: "https://api.fda.gov/drug/ndc.json",
  maxRows: 5000,
  concurrency: 1,
  resultsLimit: 1050,
  rateLimitDelayMs: 30000,
  requestTimeoutMs: 20000,
  maxAttempts: 2,
  maxRateLimitRetries: 20,
  verbose: false,
};

function parseArgs(argv) {
  const args = { ...DEFAULTS, dryRun: false };

  const readNumber = (value, flagName) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      throw new Error(`${flagName} must be a positive number`);
    }
    return Math.floor(num);
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];

    if (current === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (current === "--verbose") {
      args.verbose = true;
      continue;
    }

    if (current === "--input") {
      args.input = path.resolve(process.cwd(), String(argv[i + 1] ?? ""));
      i += 1;
      continue;
    }

    if (current === "--output") {
      args.output = path.resolve(process.cwd(), String(argv[i + 1] ?? ""));
      i += 1;
      continue;
    }

    if (current === "--max-rows") {
      args.maxRows = readNumber(argv[i + 1], "--max-rows");
      i += 1;
      continue;
    }

    if (current === "--results-limit") {
      args.resultsLimit = readNumber(argv[i + 1], "--results-limit");
      i += 1;
      continue;
    }

    if (current === "--concurrency") {
      args.concurrency = readNumber(argv[i + 1], "--concurrency");
      i += 1;
      continue;
    }

    if (current === "--rate-limit-delay-ms") {
      args.rateLimitDelayMs = readNumber(argv[i + 1], "--rate-limit-delay-ms");
      i += 1;
      continue;
    }

    if (current === "--request-timeout-ms") {
      args.requestTimeoutMs = readNumber(argv[i + 1], "--request-timeout-ms");
      i += 1;
      continue;
    }

    if (current === "--max-attempts") {
      args.maxAttempts = readNumber(argv[i + 1], "--max-attempts");
      i += 1;
      continue;
    }

    if (current === "--max-rate-limit-retries") {
      args.maxRateLimitRetries = readNumber(
        argv[i + 1],
        "--max-rate-limit-retries",
      );
      i += 1;
      continue;
    }
  }

  return args;
}

function cleanBrandName(name) {
  return String(name ?? "")
    .replace(/\*/g, "")
    .trim();
}

function sanitizeBrand(name) {
  return cleanBrandName(name).replace(/"/g, "");
}

function isNoMatchesError(reason) {
  return (
    String(reason ?? "")
      .trim()
      .toLowerCase() === "no matches found!"
  );
}

function isRateLimit(status, code, message) {
  const msg = String(message ?? "").toLowerCase();
  return (
    status === 429 || code === "OVER_RATE_LIMIT" || msg.includes("rate limit")
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildQueryUrl(fdaBase, brand) {
  const searchQuery =
    `product_type:"HUMAN PRESCRIPTION DRUG" ` +
    `AND marketing_category:"NDA" ` +
    `AND brand_name:"${sanitizeBrand(brand)}" ` +
    `AND listing_expiration_date:[20260101 TO 99991231] ` +
    `AND route:"ORAL"`;

  const params = new URLSearchParams({
    search: searchQuery,
    count: "brand_name_base.exact",
  });

  return `${fdaBase}?${params.toString()}`;
}

async function readErrorInfo(response) {
  try {
    const body = await response.clone().json();
    return {
      message: body?.error?.message || body?.message || "",
      code: body?.error?.code || body?.code || "",
    };
  } catch {
    return { message: "", code: "" };
  }
}

async function checkDrug(drug, options, rateLimitState) {
  const url = buildQueryUrl(options.fdaBase, drug.Brnd_Name);
  let lastReason = "Unknown";
  let rateLimitRetries = 0;

  const blockForRateLimit = async () => {
    if (rateLimitState.active && rateLimitState.promise) {
      await rateLimitState.promise;
    }
  };

  const triggerRateLimitSleep = async () => {
    if (!rateLimitState.active) {
      rateLimitState.active = true;
      rateLimitState.promise = wait(options.rateLimitDelayMs).then(() => {
        rateLimitState.active = false;
        rateLimitState.promise = null;
      });
    }
    await rateLimitState.promise;
  };

  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    try {
      await blockForRateLimit();
      const response = await fetch(url, {
        signal: AbortSignal.timeout(options.requestTimeoutMs),
      });

      if (!response.ok) {
        const { message, code } = await readErrorInfo(response);
        lastReason =
          message || code || `${response.status} ${response.statusText}`;

        if (isRateLimit(response.status, code, message)) {
          rateLimitRetries += 1;
          if (rateLimitRetries > options.maxRateLimitRetries) {
            break;
          }
          attempt -= 1;
          await triggerRateLimitSleep();
          continue;
        }

        if (response.status === 503 && attempt + 1 < options.maxAttempts) {
          await wait(700);
          continue;
        }

        break;
      }

      const json = await response.json();

      if (json.error) {
        const code = json.error.code;
        const message = json.error.message || "API error";

        if (isRateLimit(response.status, code, message)) {
          lastReason = message || code || "Rate limited";
          rateLimitRetries += 1;
          if (rateLimitRetries > options.maxRateLimitRetries) {
            break;
          }
          attempt -= 1;
          await triggerRateLimitSleep();
          continue;
        }

        lastReason = message;
        break;
      }

      if (!Array.isArray(json.results) || json.results.length === 0) {
        lastReason = "No results";
        break;
      }

      const match = json.results.find((entry) => (entry.count ?? 0) > 0);
      if (!match) {
        lastReason = "Count 0";
        break;
      }

      return { ok: true };
    } catch (error) {
      lastReason = error?.message || "Network error";
      if (error?.name === "TimeoutError") {
        lastReason = `Request timeout after ${options.requestTimeoutMs}ms`;
      }
      if (attempt + 1 < options.maxAttempts) {
        await wait(400);
        continue;
      }
    }
  }

  return { ok: false, reason: lastReason };
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

    if (!("Brnd_Name" in row)) {
      throw new Error(`Input row ${i + 1} missing Brnd_Name`);
    }
  }
}

function validateOutputRows(rows) {
  if (!Array.isArray(rows)) {
    throw new Error("Output must be an array");
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const required = ["brand", "spending", "beneficiaries"];
    for (const key of required) {
      if (!(key in row)) {
        throw new Error(`Output row ${i + 1} missing ${key}`);
      }
    }

    if (typeof row.brand !== "string") {
      throw new Error(`Output row ${i + 1} has non-string brand`);
    }
    if (typeof row.spending !== "number") {
      throw new Error(`Output row ${i + 1} has non-number spending`);
    }
    if (typeof row.beneficiaries !== "number") {
      throw new Error(`Output row ${i + 1} has non-number beneficiaries`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log("Step 2: Validate Medicare drugs against FDA NDC API");
  console.log(`Input: ${options.input}`);
  console.log(`Output: ${options.output}`);
  console.log(
    `Config: maxRows=${options.maxRows}, resultsLimit=${options.resultsLimit}, concurrency=${options.concurrency}, rateLimitDelayMs=${options.rateLimitDelayMs}, requestTimeoutMs=${options.requestTimeoutMs}, maxRateLimitRetries=${options.maxRateLimitRetries}`,
  );

  const inputRaw = await fs.readFile(options.input, "utf8");
  const inputRows = JSON.parse(inputRaw);
  validateInputRows(inputRows);

  const limitedInput = inputRows.slice(0, options.maxRows);
  const pending = [...limitedInput];
  const validated = [];
  const skipped = [];

  let checked = 0;
  const shouldStop = () => validated.length >= options.resultsLimit;

  const rateLimitState = { active: false, promise: null };

  const worker = async () => {
    while (pending.length > 0) {
      if (shouldStop()) {
        pending.length = 0;
        break;
      }

      const drug = pending.shift();
      if (!drug) {
        continue;
      }

      const result = await checkDrug(drug, options, rateLimitState);

      if (result.ok) {
        validated.push({
          brand: cleanBrandName(drug.Brnd_Name),
          spending: Number(drug.Tot_Spndng_2023),
          beneficiaries: Number(drug.Tot_Benes_2023),
        });

        validated.sort((a, b) => b.beneficiaries - a.beneficiaries);

        if (shouldStop()) {
          pending.length = 0;
        }
      } else {
        skipped.push({
          brand: cleanBrandName(drug.Brnd_Name),
          reason: result.reason || "Unknown",
        });

        if (options.verbose && !isNoMatchesError(result.reason)) {
          console.log(
            `Skipped: ${cleanBrandName(drug.Brnd_Name)} | reason: ${result.reason || "Unknown"}`,
          );
        }
      }

      checked += 1;
      if (checked % 25 === 0 || shouldStop()) {
        console.log(
          `Progress: checked=${checked}, validated=${validated.length}, pending=${pending.length}`,
        );
      }
    }
  };

  const workers = Array.from({ length: options.concurrency }, () => worker());
  await Promise.all(workers);

  validateOutputRows(validated);

  const uniqueBrands = new Set(validated.map((row) => row.brand.toLowerCase()))
    .size;

  console.log(`Checked: ${checked}`);
  console.log(`Validated: ${validated.length}`);
  console.log(`Skipped: ${skipped.length}`);
  console.log(`Unique validated brands: ${uniqueBrands}`);

  if (options.dryRun) {
    console.log("Dry run complete. File not written.");
    return;
  }

  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(
    options.output,
    `${JSON.stringify(validated, null, 2)}\n`,
    "utf8",
  );

  console.log(`Saved: ${options.output}`);
}

main().catch((error) => {
  console.error(`Step 2 failed: ${error.message || error}`);
  process.exit(1);
});
