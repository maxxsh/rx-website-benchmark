import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import textReadability from "text-readability";
import nspell from "nspell";
import { readFile } from "fs/promises";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  inputFile: path.join(__dirname, "../src/lib/sites.txt"),
  // inputFile: path.join(__dirname, "../src/lib/failled-readable.txt"),
  outputFile: path.join(__dirname, "../static/readable/grouped-results.json"),
  timeout: 15000, // 15 seconds
  retryAttempts: 1,
  concurrency: 1, // user preference
  delayBetweenRequests: 1000, // 1 second delay
  puppeteerOptions: {
    headless: true,
    userDataDir: path.join(__dirname, "../tmp/puppeteer-profile"),
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
};

// Browser instance (reused)
let browser = null;

// Spell checker instance
let spellChecker = null;

async function initSpellChecker() {
  try {
    const dictionaryPath = path.join(
      __dirname,
      "../node_modules/dictionary-en"
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
      error.message
    );
    console.log("Continuing without spell checking...");
    spellChecker = null;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch HTML content from a URL with timeout using Puppeteer
 */
async function fetchWithPuppeteer(url, timeout) {
  let page = null;

  try {
    if (!browser) {
      browser = await puppeteer.launch(CONFIG.puppeteerOptions);
    }

    page = await browser.newPage();
    page.setDefaultTimeout(timeout);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout,
    });

    // Wait longer (up to timeout) for real content to appear
    try {
      await page.waitForFunction(
        () => {
          const body = document.body;
          if (!body) return false;
          const textLen = body.innerText ? body.innerText.length : 0;
          return textLen > 500 || document.querySelector("main, article");
        },
        { timeout }
      );
    } catch (e) {
      // If the wait times out, continue with whatever we have
    }

    // Small extra wait
    await delay(2000);

    const html = await page.content();
    return html;
  } finally {
    if (page) {
      await page.close();
    }
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

  for (const word of words) {
    const lower = word.toLowerCase();
    if (checkedWords.has(lower) || word.length < 2) continue;
    checkedWords.add(lower);
    if (!spellChecker.correct(word)) errorCount++;
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

async function processUrl(url, attempt = 1) {
  console.log(`Processing: ${url} (Attempt ${attempt})`);
  try {
    const html = await fetchWithPuppeteer(url, CONFIG.timeout);
    const content = extractContent(html, url);
    const analysis = analyzeReadability(content);

    return {
      url,
      ...analysis,
      timestamp: new Date().toISOString(),
      manualTest: false,
      error: null,
    };
  } catch (error) {
    console.error(`Error processing ${url}: ${error.message}`);
    if (attempt < CONFIG.retryAttempts) {
      console.log(`Retrying ${url}...`);
      await delay(CONFIG.delayBetweenRequests * 2);
      return processUrl(url, attempt + 1);
    }
    return {
      url,
      title: null,
      fleschKincaidReadingEase: null,
      gunningFogIndex: null,
      spellingErrorPercentage: null,
      wordCount: null,
      excerpt: null,
      timestamp: new Date().toISOString(),
      manualTest: false,
      error: error.message,
    };
  }
}

async function processBatch(urls) {
  const results = {};
  let processedCount = 0;

  for (let i = 0; i < urls.length; i += CONFIG.concurrency) {
    const batch = urls.slice(i, i + CONFIG.concurrency);
    const batchResults = await Promise.all(batch.map((url) => processUrl(url)));

    for (const result of batchResults) {
      results[result.url] = result;
      processedCount++;
      console.log(`Progress: ${processedCount}/${urls.length} URLs processed`);
    }

    if (processedCount < urls.length) {
      await delay(CONFIG.delayBetweenRequests);
    }
  }

  return results;
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
      ).toFixed(2)
    );
    summary.averageGunningFogIndex = Number(
      (
        successes.reduce((sum, r) => sum + r.gunningFogIndex, 0) /
        successes.length
      ).toFixed(2)
    );
    summary.averageSpellingErrorPercentage = Number(
      (
        successes.reduce((sum, r) => sum + r.spellingErrorPercentage, 0) /
        successes.length
      ).toFixed(2)
    );
    summary.averageWordCount = Math.round(
      successes.reduce((sum, r) => sum + r.wordCount, 0) / successes.length
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

    console.log(`Reading URLs from: ${CONFIG.inputFile}`);
    const fileContent = await fs.readFile(CONFIG.inputFile, "utf-8");
    const urls = fileContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && line.startsWith("http"));

    console.log(`Found ${urls.length} URLs to process\n`);
    if (urls.length === 0) return;

    console.log("Launching Puppeteer browser...");
    browser = await puppeteer.launch(CONFIG.puppeteerOptions);
    console.log("Browser ready!\n");

    const newResults = await processBatch(urls);

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
    Object.values(newResults).forEach((res) => {
      const already = mergedResults[res.url];
      if (res.error === null) {
        if (already) {
          updatedSuccesses += 1;
        } else {
          addedSuccesses += 1;
        }
        mergedResults[res.url] = res;
      } else if (!already) {
        addedFailures += 1;
        mergedResults[res.url] = res;
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
      "utf-8"
    );

    console.log("\n=== Readability Checker Completed ===");
    // Highlight update summary in red for visibility
    const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
    console.log(
      yellow(
        `Updates: ${updatedSuccesses} replaced, ${addedSuccesses} new successes, ${addedFailures} new failures, ${untouched} unchanged`
      )
    );
    console.log(`Total pages: ${summary.totalPages}`);
    console.log(`Successful: ${summary.successfulPages}`);
    console.log(`Failed: ${summary.failedPages}`);
    console.log(
      `Average Flesch-Kincaid Reading Ease: ${summary.averageFleschKincaidReadingEase}`
    );
    console.log(`Average Gunning Fog Index: ${summary.averageGunningFogIndex}`);
    console.log(
      `Average Spelling Error %: ${summary.averageSpellingErrorPercentage}`
    );
    console.log(`Average Word Count: ${summary.averageWordCount}`);
    console.log(`Results saved to: ${CONFIG.outputFile}`);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  } finally {
    if (browser) {
      console.log("\nClosing browser...");
      await browser.close();
    }
  }
}

main();
