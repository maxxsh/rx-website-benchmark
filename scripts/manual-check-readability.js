import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import textReadability from "text-readability";
import nspell from "nspell";
import { readFile } from "fs/promises";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  inputDir: path.join(__dirname, "../static/local-pages"),
  outputFile: path.join(
    __dirname,
    "../static/readable/manual-grouped-results.json",
  ),
};

// Spell checker instance
let spellChecker = null;

async function initSpellChecker() {
  try {
    const dictionaryPath = path.join(
      __dirname,
      "../node_modules/dictionary-en",
    );
    const affBuffer = await readFile(path.join(dictionaryPath, "index.aff"));
    const dicBuffer = await readFile(path.join(dictionaryPath, "index.dic"));

    spellChecker = nspell({
      aff: affBuffer,
      dic: dicBuffer,
    });
  } catch (error) {
    console.error(
      "Warning: Could not initialize spell checker:",
      error.message,
    );
    console.log("Continuing without spell checking...");
    spellChecker = null;
  }
}

function extractContent(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) {
    throw new Error("Failed to extract readable content");
  }
  return article;
}

function calculateSpellingErrors(text) {
  if (!spellChecker || !text) return 0;
  const words = text.match(/\b[a-zA-Z]+\b/g) || [];
  if (words.length === 0) return 0;

  let errorCount = 0;
  const checkedWords = new Set();
  const misspelledWords = [];

  for (const word of words) {
    const lower = word.toLowerCase();
    if (checkedWords.has(lower) || word.length < 2) continue;
    checkedWords.add(lower);
    if (!spellChecker.correct(word)) {
      errorCount++;
      misspelledWords.push(word);
    }
  }

  if (misspelledWords.length > 0) {
    console.log(`\nMisspelled words found (${misspelledWords.length}):`);
    console.log(misspelledWords.join(", "));
    console.log("");
  }

  return (errorCount / checkedWords.size) * 100;
}

function analyzeReadability(content) {
  const text = content.textContent || "";
  const plainText = text.replace(/\s+/g, " ").trim();

  const fleschScore = textReadability.fleschReadingEase(plainText);
  const gunningFogScore = textReadability.gunningFog(plainText);
  const spellingErrorPercentage = calculateSpellingErrors(plainText);
  const wordCount = (plainText.match(/\b\w+\b/g) || []).length;

  return {
    title: content.title || "Untitled",
    fleschKincaidReadingEase: Number(fleschScore.toFixed(2)),
    gunningFogIndex: Number(gunningFogScore.toFixed(2)),
    spellingErrorPercentage: Number(spellingErrorPercentage.toFixed(2)),
    wordCount,
    excerpt: content.excerpt || "",
  };
}

function calculateSummary(results) {
  const entries = Object.values(results);
  const successes = entries.filter((r) => r.error === null);
  const summary = {
    totalPages: entries.length,
    successfulPages: successes.length,
    failedPages: entries.length - successes.length,
    averageFleschKincaidReadingEase: 0,
    averageGunningFogIndex: 0,
    averageSpellingErrorPercentage: 0,
    averageWordCount: 0,
  };

  if (successes.length > 0) {
    summary.averageFleschKincaidReadingEase = Number(
      (
        successes.reduce((sum, r) => sum + r.fleschKincaidReadingEase, 0) /
        successes.length
      ).toFixed(2),
    );
    summary.averageGunningFogIndex = Number(
      (
        successes.reduce((sum, r) => sum + r.gunningFogIndex, 0) /
        successes.length
      ).toFixed(2),
    );
    summary.averageSpellingErrorPercentage = Number(
      (
        successes.reduce((sum, r) => sum + r.spellingErrorPercentage, 0) /
        successes.length
      ).toFixed(2),
    );
    summary.averageWordCount = Math.round(
      successes.reduce((sum, r) => sum + r.wordCount, 0) / successes.length,
    );
  }

  return summary;
}

async function main() {
  console.log("=== Readability Checker Started ===\n");

  try {
    console.log("Initializing spell checker...");
    await initSpellChecker();
    console.log("Spell checker ready!\n");

    console.log(`Reading HTML files from: ${CONFIG.inputDir}`);
    const files = await fs.readdir(CONFIG.inputDir);
    const htmlFiles = files.filter((file) => file.endsWith(".html"));

    console.log(`Found ${htmlFiles.length} HTML files to process\n`);

    if (htmlFiles.length === 0) {
      console.log("No HTML files found in directory");
      return;
    }

    const newResults = {};
    let processedCount = 0;

    // Process each HTML file
    for (const fileName of htmlFiles) {
      const filePath = path.join(CONFIG.inputDir, fileName);
      const localUrl = `file://${filePath}`;
      const relativeUrl = `\\static\\local-pages\\${fileName}`;
      const brandName = fileName.replace(".html", "");

      console.log(
        `Processing (${processedCount + 1}/${htmlFiles.length}): ${fileName}`,
      );

      try {
        const html = await fs.readFile(filePath, "utf-8");
        const content = extractContent(html, localUrl);
        const analysis = analyzeReadability(content);

        newResults[brandName] = {
          url: relativeUrl,
          ...analysis,
          timestamp: new Date().toISOString(),
          manualTest: true,
          error: null,
        };
        console.log(`✓ Successfully processed: ${fileName}`);
      } catch (error) {
        console.error(`✗ Error processing ${fileName}: ${error.message}`);
        newResults[brandName] = {
          url: relativeUrl,
          title: null,
          fleschKincaidReadingEase: null,
          gunningFogIndex: null,
          spellingErrorPercentage: null,
          wordCount: null,
          excerpt: null,
          timestamp: new Date().toISOString(),
          manualTest: true,
          error: error.message,
        };
      }

      processedCount++;
      console.log("");
    }

    // Load existing grouped results (if any)
    let existing = null;
    try {
      const raw = await fs.readFile(CONFIG.outputFile, "utf-8");
      existing = JSON.parse(raw);
    } catch (e) {
      existing = null;
    }

    const mergedResults = existing?.results ? { ...existing.results } : {};

    let updatedSuccesses = 0;
    let addedSuccesses = 0;
    let addedFailures = 0;
    let untouched = 0;

    // Only replace entries for URLs that succeeded this run; leave others untouched
    Object.entries(newResults).forEach(([brandName, res]) => {
      const already = mergedResults[brandName];
      if (res.error === null) {
        if (already) {
          updatedSuccesses += 1;
        } else {
          addedSuccesses += 1;
        }
        mergedResults[brandName] = res;
      } else if (!already) {
        addedFailures += 1;
        mergedResults[brandName] = res;
      } else {
        untouched += 1;
      }
    });

    const summary = calculateSummary(mergedResults);
    const output = { ...summary, results: mergedResults };

    const outputDir = path.dirname(CONFIG.outputFile);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      CONFIG.outputFile,
      JSON.stringify(output, null, 2),
      "utf-8",
    );

    console.log("\n=== Readability Checker Completed ===");
    // Highlight update summary in red for visibility
    const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
    console.log(
      yellow(
        `Updates: ${updatedSuccesses} replaced, ${addedSuccesses} new successes, ${addedFailures} new failures, ${untouched} unchanged`,
      ),
    );
    console.log(`Total pages: ${summary.totalPages}`);
    console.log(`Successful: ${summary.successfulPages}`);
    console.log(`Failed: ${summary.failedPages}`);
    console.log(
      `Average Flesch-Kincaid Reading Ease: ${summary.averageFleschKincaidReadingEase}`,
    );
    console.log(`Average Gunning Fog Index: ${summary.averageGunningFogIndex}`);
    console.log(
      `Average Spelling Error %: ${summary.averageSpellingErrorPercentage}`,
    );
    console.log(`Average Word Count: ${summary.averageWordCount}`);
    console.log(`Results saved to: ${CONFIG.outputFile}`);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
