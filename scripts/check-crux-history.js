import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.CRUX_API_KEY;
const FORM_FACTOR = "ALL_FORM_FACTORS"; // ALL_FORM_FACTORS | PHONE | DESKTOP | TABLET
const URL_ONLY = true;
const API_URL =
  "https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord";

const INPUT_FILE = path.join(
  __dirname,
  "../static/script-data/validated-working-list-final.json",
);

const OUTPUT_FILE = path.join(
  __dirname,
  "../static/crux/crux-grouped-results.json",
);

/**
 * Categorize metric based on histogram densities (CrUX Vis methodology)
 * - 3 (good): >= 75% good
 * - 1 (poor): > 25% poor
 * - 2 (needs improvement): otherwise
 */
function getLastIndex(histogramTimeseries) {
  return Math.max(
    ...histogramTimeseries.map((bin) => (bin.densities?.length || 1) - 1),
  );
}

function normalizeDensity(value) {
  if (value === null || value === undefined || value === "NaN") {
    return null;
  }
  return value;
}

function getDensitiesForIndex(histogramTimeseries, index) {
  const dens = histogramTimeseries.map((bin) =>
    normalizeDensity(bin.densities?.[index]),
  );
  if (dens.some((value) => value === null)) {
    return null;
  }
  return dens;
}

function getAverageDensities(histogramTimeseries) {
  const averages = histogramTimeseries.map((bin) => {
    const values = (bin.densities || [])
      .map(normalizeDensity)
      .filter((v) => v !== null);
    if (values.length === 0) {
      return null;
    }
    const sum = values.reduce((acc, v) => acc + v, 0);
    return sum / values.length;
  });

  if (averages.some((value) => value === null)) {
    return null;
  }
  return averages;
}

function categorizeMetricFromDensities(densities) {
  if (!densities || densities.length < 3) {
    return null;
  }

  const goodDensity = densities[0] || 0;
  const poorDensity = densities[2] || 0;

  if (goodDensity >= 0.75) {
    return 3;
  }

  if (poorDensity > 0.25) {
    return 1;
  }

  return 2;
}

function getLatestMetricStatus(histogramTimeseries) {
  if (!histogramTimeseries || histogramTimeseries.length === 0) {
    return null;
  }

  const lastIndex = getLastIndex(histogramTimeseries);
  if (lastIndex < 0) {
    return null;
  }

  const densities = getDensitiesForIndex(histogramTimeseries, lastIndex);
  return categorizeMetricFromDensities(densities);
}

function getFullRangeMetricStatus(histogramTimeseries) {
  if (!histogramTimeseries || histogramTimeseries.length === 0) {
    return null;
  }

  const densities = getAverageDensities(histogramTimeseries);
  return categorizeMetricFromDensities(densities);
}

/**
 * Fetch CrUX History data for a URL
 */
async function fetchCruxData(url, formFactor = FORM_FACTOR) {
  try {
    const requestBody = {
      url: url,
      formFactor: formFactor,
      collectionPeriodCount: 25, // ~6 months of weekly data
    };

    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { error: "no data" };
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching CrUX data for ${url}:`, error.message);
    return { error: error.message };
  }
}

async function fetchCruxOriginData(origin, formFactor = FORM_FACTOR) {
  try {
    const requestBody = {
      origin: origin,
      formFactor: formFactor,
      collectionPeriodCount: 25, // ~6 months of weekly data
    };

    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { error: "no data" };
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(
      `Error fetching CrUX data for origin ${origin}:`,
      error.message,
    );
    return { error: error.message };
  }
}
/**
 * Get latest non-null fraction from a fraction timeseries
 */
function getLatestFraction(fractions) {
  if (!fractions || fractions.length === 0) {
    return null;
  }
  const value = normalizeDensity(fractions[fractions.length - 1]);
  return value;
}

/**
 * Calculate device distribution from metrics.form_factors fractions
 */
function getDeviceDistributionFromMetrics(metrics) {
  const fractions = metrics?.form_factors?.fractionTimeseries;
  if (!fractions) {
    return null;
  }

  const phone = getLatestFraction(fractions.phone?.fractions);
  const desktop = getLatestFraction(fractions.desktop?.fractions);
  const tablet = getLatestFraction(fractions.tablet?.fractions);

  if (phone === null && desktop === null && tablet === null) {
    return null;
  }

  const phonePct = phone !== null ? Math.round(phone * 1000) / 10 : null;
  const desktopPct = desktop !== null ? Math.round(desktop * 1000) / 10 : null;
  const tabletPct = tablet !== null ? Math.round(tablet * 1000) / 10 : null;

  return {
    phone: phonePct,
    desktop: desktopPct,
    tablet: tabletPct,
  };
}

/**
 * Process CrUX data and extract summary metrics
 */
function processCruxData(data) {
  if (data.error) {
    return {
      loadingPerformance: null,
      interactivity: null,
      visualStability: null,
      fullDataRange: {
        loadingPerformance: null,
        interactivity: null,
        visualStability: null,
      },
      device: null,
      error: data.error,
      manualTest: false,
    };
  }

  const metrics = data.record?.metrics;
  if (!metrics) {
    return {
      loadingPerformance: null,
      interactivity: null,
      visualStability: null,
      fullDataRange: {
        loadingPerformance: null,
        interactivity: null,
        visualStability: null,
      },
      device: null,
      error: "no data",
      manualTest: false,
    };
  }

  // Loading Performance: LCP (Largest Contentful Paint)
  const lcpHistogram = metrics.largest_contentful_paint?.histogramTimeseries;
  const loadingLatest = getLatestMetricStatus(lcpHistogram);
  const loadingFull = getFullRangeMetricStatus(lcpHistogram);

  // Interactivity: INP (Interaction to Next Paint) only
  const interactivityHistogram =
    metrics.interaction_to_next_paint?.histogramTimeseries;
  const interactivityLatest = interactivityHistogram
    ? getLatestMetricStatus(interactivityHistogram)
    : null;
  const interactivityFull = interactivityHistogram
    ? getFullRangeMetricStatus(interactivityHistogram)
    : null;

  // Visual Stability: CLS (Cumulative Layout Shift)
  const clsHistogram = metrics.cumulative_layout_shift?.histogramTimeseries;
  const visualLatest = getLatestMetricStatus(clsHistogram);
  const visualFull = getFullRangeMetricStatus(clsHistogram);

  return {
    loadingPerformance: loadingLatest,
    interactivity: interactivityLatest,
    visualStability: visualLatest,
    fullDataRange: {
      loadingPerformance: loadingFull,
      interactivity: interactivityFull,
      visualStability: visualFull,
    },
    device: getDeviceDistributionFromMetrics(metrics),
    error: null,
    manualTest: false,
  };
}

/**
 * Add delay between requests to avoid rate limiting
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main function
 */
async function main() {
  console.log("Starting CrUX History API data collection...");

  if (!API_KEY) {
    console.error("Error: CRUX_API_KEY environment variable is not set.");
    console.error(
      "Get your API key from: https://console.cloud.google.com/apis/credentials",
    );
    console.error("\nUsage:");
    console.error('  PowerShell: $env:CRUX_API_KEY="your-key"; npm run crux');
    process.exit(1);
  }


  // Read input file
  let workingList;
  try {
    const fileContent = fs.readFileSync(INPUT_FILE, "utf-8");
    workingList = JSON.parse(fileContent);
  } catch (error) {
    console.error("Error reading input file:", error.message);
    process.exit(1);
  }

  console.log(`Processing ${workingList.length} URLs...`);

  // Load existing output to avoid duplicate requests
  let existingResults = {};
  let existingSummary = null;
  try {
    if (fs.existsSync(OUTPUT_FILE)) {
      const existingContent = fs.readFileSync(OUTPUT_FILE, "utf-8");
      existingSummary = JSON.parse(existingContent);
      existingResults = existingSummary.results || {};
      console.log(
        `Loaded ${
          Object.keys(existingResults).length
        } existing results from output file.`,
      );
    }
  } catch (error) {
    console.warn("Failed to read existing output file:", error.message);
  }

  const results = { ...existingResults };

  for (let i = 0; i < workingList.length; i++) {
    const item = workingList[i];
    const url = item.redirect;

    if (results[url] && !results[url].error) {
      console.log(
        `[${i + 1}/${workingList.length}] Skipping (already exists): ${url}`,
      );
      continue;
    }

    console.log(`[${i + 1}/${workingList.length}] Processing: ${url}`);

    // Fetch CrUX data for configured form factor (URL), fallback to origin if needed
    let cruxData = await fetchCruxData(url, FORM_FACTOR);
    let targetOrigin = null;

    if (cruxData.error === "no data" && !URL_ONLY) {
      try {
        targetOrigin = new URL(url).origin;
      } catch {
        targetOrigin = null;
      }

      if (targetOrigin) {
        const originData = await fetchCruxOriginData(targetOrigin, FORM_FACTOR);
        if (!originData.error) {
          cruxData = originData;
        }
      }
    }

    const processedData = processCruxData(cruxData);

    // If using a specific form factor, fetch ALL_FORM_FACTORS to get device split
    if (!processedData.error && FORM_FACTOR !== "ALL_FORM_FACTORS") {
      const deviceTarget = targetOrigin || url;
      const allDevicesData = targetOrigin
        ? await fetchCruxOriginData(deviceTarget, "ALL_FORM_FACTORS")
        : await fetchCruxData(deviceTarget, "ALL_FORM_FACTORS");

      if (!allDevicesData.error) {
        processedData.device = getDeviceDistributionFromMetrics(
          allDevicesData.record?.metrics,
        );
      }
    }

    results[url] = processedData;

    // Add delay to avoid rate limiting (adjust as needed)
    if (i < workingList.length - 1) {
      await delay(200); // 200ms delay between requests
    }
  }

  // Recalculate counts from final results
  let successCount = 0;
  let errorCount = 0;
  let noDataCount = 0;

  for (const existing of Object.values(results)) {
    if (existing?.error) {
      if (existing.error === "no data") {
        noDataCount++;
      } else {
        errorCount++;
      }
    } else {
      successCount++;
    }
  }

  // Create summary
  const summary = {
    totalPages: workingList.length,
    successfulPages: successCount,
    noDataPages: noDataCount,
    failedPages: errorCount,
    timestamp: new Date().toISOString(),
    results: results,
  };

  // Write output file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2));

  console.log("\n=== Summary ===");
  console.log(`Total URLs processed: ${workingList.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`No data: ${noDataCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`\nOutput saved to: ${OUTPUT_FILE}`);
}

// Run the script
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
