import { dev } from "$app/environment";
import { slugify } from "$lib/utils.js";
import {
  processLighthouseReport,
  createFallbackData,
} from "$lib/auditProcessors.js";
import { read_s, read_s_ref } from "$lib/calculations/read_s.js";
import { computeAllScores } from "$lib/calculations/scores.js";
import fs from "fs";
import path from "path";

export const prerender = true;

function readJsonSafe(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  let fileContent = fs.readFileSync(filePath, "utf-8");
  if (!fileContent) {
    return fallback;
  }

  // Remove BOM if present
  if (fileContent.charCodeAt(0) === 0xfeff) {
    fileContent = fileContent.slice(1);
  }

  try {
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Failed to parse JSON: ${filePath}`, error);
    return fallback;
  }
}

function isNumber(value) {
  return typeof value === "number" && !Number.isNaN(value);
}

function toNullableNumber(value) {
  if (isNumber(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

function getCruxMetricValue(cruxEntry, key) {
  if (!cruxEntry) {
    return null;
  }

  const directValue = cruxEntry[key];
  if (directValue !== null && directValue !== undefined) {
    return directValue;
  }

  const fullValue = cruxEntry.fullDataRange?.[key];
  if (fullValue !== null && fullValue !== undefined) {
    return fullValue;
  }

  return null;
}

function formatCruxDevices(cruxEntry) {
  const device = cruxEntry?.device;
  if (!device) {
    return null;
  }

  const phone = toNullableNumber(device.phone);
  const tablet = toNullableNumber(device.tablet);
  const desktop = toNullableNumber(device.desktop);

  if (!isNumber(phone) || !isNumber(tablet) || !isNumber(desktop)) {
    return null;
  }

  const formatValue = (value) => Math.round(value * 10) / 10;
  return `${formatValue(phone)}/${formatValue(tablet)}/${formatValue(desktop)}`;
}

function buildScoreRow(site) {
  return {
    "Loading Performance": getCruxMetricValue(site.crux, "loadingPerformance"),
    Interactivity: getCruxMetricValue(site.crux, "interactivity"),
    "Visual Stability": getCruxMetricValue(site.crux, "visualStability"),
    "LH Performance": isNumber(site.performance)
      ? site.performance * 100
      : null,
    "LH Best Practices": isNumber(site.bestPractices)
      ? site.bestPractices * 100
      : null,
    "LH SEO": isNumber(site.seo) ? site.seo * 100 : null,
    "Pa11y A": isNumber(site.pa11yErrorsA) ? site.pa11yErrorsA : null,
    "Pa11y AA": isNumber(site.pa11yErrorsAA) ? site.pa11yErrorsAA : null,
    READ_S: isNumber(site.readScore) ? site.readScore : null,
  };
}

export async function generateEnrichedData() {
  try {
    // Load brands data
    const brandsPath = path.join(
      process.cwd(),
      "static/script-data/validated-working-list-final.json",
    );
    const brandsData = readJsonSafe(brandsPath, []);

    // Load Pa11y grouped results
    const pa11yAAPath = path.join(
      process.cwd(),
      "static/pa11y/AA/grouped-results.json",
    );
    const pa11yAPath = path.join(
      process.cwd(),
      "static/pa11y/A/grouped-results.json",
    );
    const readablePath = path.join(
      process.cwd(),
      "static/readable/combined-readable-results.json",
    );
    const cruxPath = path.join(
      process.cwd(),
      "static/crux/crux-grouped-results.json",
    );

    let pa11yAAData = {};
    let pa11yAData = {};
    let readableData = {};
    let cruxData = {};

    const pa11yAAJson = readJsonSafe(pa11yAAPath, null);
    pa11yAAData = pa11yAAJson?.results || {};

    const pa11yAJson = readJsonSafe(pa11yAPath, null);
    pa11yAData = pa11yAJson?.results || {};

    const readableJson = readJsonSafe(readablePath, null);
    readableData = readableJson?.results || {};

    const cruxJson = readJsonSafe(cruxPath, null);
    cruxData = cruxJson?.results || {};

    const readabilityRef = read_s_ref(readableData);

    const enrichedData = [];

    for (const brand of brandsData) {
      const slug = slugify(brand.redirect);

      if (!slug) {
        enrichedData.push(
          createFallbackData(brand, null, {
            pa11yAErrors: null,
            pa11yAAErrors: null,
          }),
        );
        continue;
      }

      try {
        // Read Lighthouse report from file system
        const reportPath = path.join(
          process.cwd(),
          `static/lighthouse/${slug}.report.json`,
        );

        if (!fs.existsSync(reportPath)) {
          console.error(`Lighthouse report not found: ${reportPath}`);
          throw new Error(`Report not found: ${reportPath}`);
        }

        const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));

        // Get Pa11y error counts
        const pa11yAErrors =
          pa11yAData[brand.redirect]?.totalErrorInstances ?? null;
        const pa11yAAErrors =
          pa11yAAData[brand.redirect]?.totalErrorInstances ?? null;

        // Check if Pa11y reports exist and store paths
        const pa11ySlug = slugify(brand.redirect, "pa11y");
        const pa11yAAReportPath = path.join(
          process.cwd(),
          `static/pa11y/AA/${pa11ySlug}.html`,
        );
        const pa11yAReportPath = path.join(
          process.cwd(),
          `static/pa11y/A/${pa11ySlug}.html`,
        );

        const pa11yAAExists = fs.existsSync(pa11yAAReportPath);
        const pa11yAExists = fs.existsSync(pa11yAReportPath);

        const processedData = processLighthouseReport(
          brand,
          report,
          { pa11yAErrors, pa11yAAErrors },
          slug,
          { pa11yAAExists, pa11yAExists, pa11ySlug },
        );

        // Add readable data and LH average
        const readable = readableData[brand.redirect] || {};
        const pa11yErrorsA = toNullableNumber(processedData.pa11yErrorsA);
        const pa11yErrorsAA = toNullableNumber(processedData.pa11yErrorsAA);
        const performance = toNullableNumber(processedData.performance);
        const accessibility = toNullableNumber(processedData.accessibility);
        const bestPractices = toNullableNumber(processedData.bestPractices);
        const seo = toNullableNumber(processedData.seo);

        let lhAverage = null;
        if (
          isNumber(performance) &&
          isNumber(accessibility) &&
          isNumber(bestPractices) &&
          isNumber(seo)
        ) {
          lhAverage = (performance + accessibility + bestPractices + seo) / 4;
        }

        // Handle null or missing readable values explicitly
        const fleschKincaid = readable.fleschKincaidReadingEase ?? null;
        const gunningFog = readable.gunningFogIndex ?? null;
        const spellingError = readable.spellingErrorPercentage ?? null;
        const wordCount = readable.wordCount ?? null;
        const readScore = read_s(
          fleschKincaid,
          gunningFog,
          wordCount,
          readabilityRef,
        );

        const cruxEntry = cruxData[brand.redirect] || null;
        const loadingPerformance = getCruxMetricValue(
          cruxEntry,
          "loadingPerformance",
        );
        const interactivity = getCruxMetricValue(cruxEntry, "interactivity");
        const visualStability = getCruxMetricValue(
          cruxEntry,
          "visualStability",
        );
        const devicesPercent = formatCruxDevices(cruxEntry) || null;

        enrichedData.push({
          ...processedData,
          performance,
          accessibility,
          bestPractices,
          seo,
          pa11yErrorsA,
          pa11yErrorsAA,
          lhAverage,
          fleschKincaid,
          gunningFog,
          spellingError,
          wordCount,
          readScore,
          readableManualTest: readable.manualTest === true,
          crux: cruxEntry,
          loadingPerformance,
          interactivity,
          visualStability,
          "Devices %": devicesPercent,
        });
      } catch (error) {
        console.error(`Failed to load report for ${brand.brand}:`, error);

        // Get Pa11y error counts even if Lighthouse report failed
        const pa11yAErrors =
          pa11yAData[brand.redirect]?.totalErrorInstances ?? null;
        const pa11yAAErrors =
          pa11yAAData[brand.redirect]?.totalErrorInstances ?? null;

        const fallbackData = createFallbackData(brand, slug, {
          pa11yAErrors,
          pa11yAAErrors,
        });
        const performance = toNullableNumber(fallbackData.performance);
        const accessibility = toNullableNumber(fallbackData.accessibility);
        const bestPractices = toNullableNumber(fallbackData.bestPractices);
        const seo = toNullableNumber(fallbackData.seo);
        const fallbackPa11yErrorsA = toNullableNumber(
          fallbackData.pa11yErrorsA,
        );
        const fallbackPa11yErrorsAA = toNullableNumber(
          fallbackData.pa11yErrorsAA,
        );
        const readable = readableData[brand.redirect] || {};
        const fleschKincaid = readable.fleschKincaidReadingEase ?? null;
        const gunningFog = readable.gunningFogIndex ?? null;
        const spellingError = readable.spellingErrorPercentage ?? null;
        const wordCount = readable.wordCount ?? null;
        const readScore = read_s(
          fleschKincaid,
          gunningFog,
          wordCount,
          readabilityRef,
        );

        const cruxEntry = cruxData[brand.redirect] || null;
        const loadingPerformance = getCruxMetricValue(
          cruxEntry,
          "loadingPerformance",
        );
        const interactivity = getCruxMetricValue(cruxEntry, "interactivity");
        const visualStability = getCruxMetricValue(
          cruxEntry,
          "visualStability",
        );
        const devicesPercent = formatCruxDevices(cruxEntry) || null;

        enrichedData.push({
          ...fallbackData,
          performance,
          accessibility,
          bestPractices,
          seo,
          pa11yErrorsA: fallbackPa11yErrorsA,
          pa11yErrorsAA: fallbackPa11yErrorsAA,
          fleschKincaid,
          gunningFog,
          spellingError,
          wordCount,
          readScore,
          readableManualTest: readable.manualTest === true,
          crux: cruxEntry,
          loadingPerformance,
          interactivity,
          visualStability,
          "Devices %": devicesPercent,
        });
      }
    }

    const scoreRows = enrichedData.map((site) => buildScoreRow(site));
    const computedScores = computeAllScores(scoreRows);

    return enrichedData.map((site, index) => {
      const score = computedScores[index]?.Score ?? null;
      const fScore = computedScores[index]?.FScore ?? null;

      return {
        ...site,
        score: isNumber(score) ? score : null,
        FScore: isNumber(fScore) ? fScore : null,
      };
    });
  } catch (error) {
    console.error("Failed to generate enriched data:", error);
    return [];
  }
}

