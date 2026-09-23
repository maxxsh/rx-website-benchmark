import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULTS = {
  input: path.join(
    __dirname,
    "../static/script-data/validated-working-list-final.json",
  ),
  pa11yA: path.join(__dirname, "../.pa11yci-a.json"),
  pa11yAA: path.join(__dirname, "../.pa11yci-aa.json"),
  sites: path.join(__dirname, "../src/lib/sites.txt"),
};

const ACTIONS = new Map([
  [
    "https://www.tecfidera.com/",
    {
      url: "https://www.tecfidera.com/",
      actions: [
        'click element a[aria-label="CONTINUE TO SITE button"]',
        "wait for url to be https://www.tecfidera.com/",
      ],
      screenCapture: "./static/pa11y/A/www-tecfidera-com-after-continue.png",
    },
  ],
  [
    "https://thyquidity.com/",
    {
      url: "https://thyquidity.com/",
      screenCapture: "./static/pa11y/TEMP/thyquidity.png",
      chromeLaunchConfig: {
        headless: true,
        args: [
          "--disable-features=HttpsFirstBalancedModeAutoEnable",
          "--disable-extensions",
          "--disable-plugins",
          "--disable-background-networking",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-infobars",
        ],
      },
    },
  ],
]);

function parseArgs(argv) {
  const args = {
    ...DEFAULTS,
    dryRun: false,
    compareExisting: false,
    testDir: null,
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

    if (current === "--pa11y-a") {
      args.pa11yA = path.resolve(process.cwd(), String(argv[i + 1] ?? ""));
      i += 1;
      continue;
    }

    if (current === "--pa11y-aa") {
      args.pa11yAA = path.resolve(process.cwd(), String(argv[i + 1] ?? ""));
      i += 1;
      continue;
    }

    if (current === "--sites") {
      args.sites = path.resolve(process.cwd(), String(argv[i + 1] ?? ""));
      i += 1;
      continue;
    }

    if (current === "--test-dir") {
      args.testDir = path.resolve(process.cwd(), String(argv[i + 1] ?? ""));
      i += 1;
      continue;
    }

    if (current === "--compare-existing") {
      args.compareExisting = true;
    }
  }

  if (args.testDir) {
    args.pa11yA = path.join(args.testDir, ".pa11yci-a.json");
    args.pa11yAA = path.join(args.testDir, ".pa11yci-aa.json");
    args.sites = path.join(args.testDir, "sites.txt");
  }

  return args;
}

function buildUrls(validatedWebsites) {
  return validatedWebsites
    .map((item) => String(item.redirect || "").trim())
    .filter(Boolean);
}

function generatePa11yUrls(urls) {
  const result = [];
  urls.forEach((url) => {
    result.push(url);
    if (ACTIONS.has(url)) {
      result.push(ACTIONS.get(url));
    }
  });
  return result;
}

function createConfig(standard, urls) {
  const destinationFolder = standard;

  return {
    defaults: {
      timeout: 30000,
      standard: `WCAG2${standard}`,
      puppeteerLaunchOptions: {
        userDataDir: "./tmp/puppeteer-profile",
      },
      reporters: [
        [
          "pa11y-ci-reporter-html",
          {
            destination: `./static/pa11y/${destinationFolder}`,
            includeZeroIssues: true,
          },
        ],
        [
          "json",
          {
            fileName: `static/pa11y/${destinationFolder}/results.json`,
          },
        ],
      ],
    },
    urls: generatePa11yUrls(urls),
  };
}

async function writeText(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

function stableNormalize(value) {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }

  if (value && typeof value === "object") {
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = stableNormalize(value[key]);
    }
    return normalized;
  }

  return value;
}

async function compareJsonFile(generatedPath, existingPath) {
  const [generatedRaw, existingRaw] = await Promise.all([
    fs.readFile(generatedPath, "utf8"),
    fs.readFile(existingPath, "utf8"),
  ]);

  const generatedNormalized = stableNormalize(JSON.parse(generatedRaw));
  const existingNormalized = stableNormalize(JSON.parse(existingRaw));

  return (
    JSON.stringify(generatedNormalized) === JSON.stringify(existingNormalized)
  );
}

async function compareTextFile(generatedPath, existingPath) {
  const [generatedRaw, existingRaw] = await Promise.all([
    fs.readFile(generatedPath, "utf8"),
    fs.readFile(existingPath, "utf8"),
  ]);

  const generatedNormalized = generatedRaw.replace(/\r\n/g, "\n").trimEnd();
  const existingNormalized = existingRaw.replace(/\r\n/g, "\n").trimEnd();
  return generatedNormalized === existingNormalized;
}

async function runComparison(options) {
  const checks = [
    {
      label: ".pa11yci-a.json",
      generated: options.pa11yA,
      existing: DEFAULTS.pa11yA,
      type: "json",
    },
    {
      label: ".pa11yci-aa.json",
      generated: options.pa11yAA,
      existing: DEFAULTS.pa11yAA,
      type: "json",
    },
    {
      label: "sites.txt",
      generated: options.sites,
      existing: DEFAULTS.sites,
      type: "text",
    },
  ];

  let allMatch = true;

  for (const check of checks) {
    const isSame =
      check.type === "json"
        ? await compareJsonFile(check.generated, check.existing)
        : await compareTextFile(check.generated, check.existing);

    allMatch = allMatch && isSame;
    console.log(
      `${isSame ? "PASS" : "FAIL"} ${check.label} | generated=${check.generated} | existing=${check.existing}`,
    );
  }

  if (allMatch) {
    console.log(
      "Comparison complete: all generated files match existing files.",
    );
  } else {
    console.log("Comparison complete: one or more generated files differ.");
    process.exitCode = 1;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  const validatedWebsites = JSON.parse(
    await fs.readFile(options.input, "utf8"),
  );
  if (!Array.isArray(validatedWebsites)) {
    throw new Error("Step 5 input must be an array");
  }

  const urls = buildUrls(validatedWebsites);
  const pa11yAConfig = createConfig("A", urls);
  const pa11yAAConfig = createConfig("AA", urls);

  if (options.dryRun) {
    console.log(`Step 5 dry run: urls=${urls.length}`);
    return;
  }

  await writeText(options.pa11yA, `${JSON.stringify(pa11yAConfig, null, 2)}\n`);
  await writeText(
    options.pa11yAA,
    `${JSON.stringify(pa11yAAConfig, null, 2)}\n`,
  );
  await writeText(options.sites, `${urls.join("\n")}\n`);

  console.log(
    `Step 5 complete: wrote ${options.pa11yA}, ${options.pa11yAA}, ${options.sites}`,
  );

  if (options.compareExisting) {
    await runComparison(options);
  }
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(`Step 5 failed: ${error.message || error}`);
    process.exit(1);
  });
}
