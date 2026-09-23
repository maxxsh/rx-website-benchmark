import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_STANDARDS = new Set(["A", "AA", "AAA"]);

function parseStandard(argv) {
  const directFlag = argv
    .find((arg) => arg.startsWith("--"))
    ?.slice(2)
    .toUpperCase();

  if (directFlag && ALLOWED_STANDARDS.has(directFlag)) {
    return directFlag;
  }

  const named = argv.find((arg) => arg.startsWith("--standard="));
  if (named) {
    const value = named.split("=")[1]?.toUpperCase();
    if (value && ALLOWED_STANDARDS.has(value)) {
      return value;
    }
  }

  return "AA";
}

function buildPaths(standard) {
  return {
    inputPath: path.join(__dirname, `../static/pa11y/${standard}/results.json`),
    outputPath: path.join(
      __dirname,
      `../static/pa11y/${standard}/grouped-results.json`,
    ),
  };
}

function groupResultsByCode(results) {
  const grouped = {};
  let globalUniqueErrors = 0;

  for (const [url, issues] of Object.entries(results)) {
    const groups = {};

    for (const issue of issues) {
      const key = issue.code;
      if (!groups[key]) {
        groups[key] = {
          code: issue.code,
          type: issue.type,
          typeCode: issue.typeCode,
          message: issue.message,
          runner: issue.runner,
          runnerExtras: issue.runnerExtras,
          totalErrors: 0,
        };
      }
      groups[key].totalErrors += 1;
    }

    const groupedIssues = Object.values(groups);
    const pageUniqueErrors = groupedIssues.length;
    const pageErrorInstances = groupedIssues.reduce(
      (sum, err) => sum + err.totalErrors,
      0,
    );

    globalUniqueErrors += pageUniqueErrors;

    grouped[url] = {
      totalUniqueErrors: pageUniqueErrors,
      totalErrorInstances: pageErrorInstances,
      errors: groupedIssues,
    };
  }

  return { grouped, globalUniqueErrors };
}

async function main() {
  const standard = parseStandard(process.argv.slice(2));
  if (!ALLOWED_STANDARDS.has(standard)) {
    throw new Error("Invalid standard. Use --A, --AA, --AAA, or --standard=AA");
  }

  const { inputPath, outputPath } = buildPaths(standard);
  const rawData = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const results = rawData?.results;

  if (!results || typeof results !== "object") {
    throw new Error(`Invalid results format in ${inputPath}`);
  }

  const { grouped, globalUniqueErrors } = groupResultsByCode(results);

  const finalOutput = {
    totalPages: Object.keys(grouped).length,
    totalUniqueErrors: globalUniqueErrors,
    totalErrorInstances: Number(rawData.errors || 0),
    results: grouped,
  };

  await fs.writeFile(
    outputPath,
    `${JSON.stringify(finalOutput, null, 2)}\n`,
    "utf8",
  );

  console.log(`Grouped results saved to ${outputPath}`);
  console.log(
    `Processed ${finalOutput.totalPages} pages | ${finalOutput.totalUniqueErrors} unique error types | ${finalOutput.totalErrorInstances} total error instances`,
  );
}

main().catch((error) => {
  console.error(`group-al11y failed: ${error.message || error}`);
  process.exit(1);
});
