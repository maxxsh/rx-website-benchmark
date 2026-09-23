import { dev } from "$app/environment";
import { slugify } from "$lib/utils.js";
import {
  processLighthouseReport,
  createFallbackData,
} from "$lib/auditProcessors.js";
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

async function generateEnrichedData() {
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

    let pa11yAAData = {};
    let pa11yAData = {};

    const pa11yAAJson = readJsonSafe(pa11yAAPath, null);
    pa11yAAData = pa11yAAJson?.results || {};

    const pa11yAJson = readJsonSafe(pa11yAPath, null);
    pa11yAData = pa11yAJson?.results || {};

    const enrichedData = [];

    for (const brand of brandsData) {
      const slug = slugify(brand.redirect);

      if (!slug) {
        enrichedData.push(
          createFallbackData(brand, null, {
            pa11yAErrors: "N/A",
            pa11yAAErrors: "N/A",
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

        enrichedData.push(
          processLighthouseReport(
            brand,
            report,
            { pa11yAErrors, pa11yAAErrors },
            slug,
            { pa11yAAExists, pa11yAExists, pa11ySlug },
          ),
        );
      } catch (error) {
        console.error(`Failed to load report for ${brand.brand}:`, error);

        // Get Pa11y error counts even if Lighthouse report failed
        const pa11yAErrors =
          pa11yAData[brand.redirect]?.totalErrorInstances ?? null;
        const pa11yAAErrors =
          pa11yAAData[brand.redirect]?.totalErrorInstances ?? null;

        enrichedData.push(
          createFallbackData(brand, slug, { pa11yAErrors, pa11yAAErrors }),
        );
      }
    }

    return enrichedData;
  } catch (error) {
    console.error("Failed to generate enriched data:", error);
    return [];
  }
}

export async function load({ fetch }) {
  try {
    // In production (build time), generate enriched data from file system
    if (!dev) {
      console.log("Building enriched data for production...");
      const enrichedData = await generateEnrichedData();

      // Load brands data for compatibility
      const brandsPath = path.join(
        process.cwd(),
        "static/script-data/validated-working-list-final.json",
      );
      const brandsData = readJsonSafe(brandsPath, []);

      return {
        brands: brandsData,
        enrichedData: enrichedData,
        isPrerendered: true,
      };
    }

    // In development, just load brands data and let client handle enrichment
    const response = await fetch(
      "/script-data/validated-working-list-final.json",
    );
    const brandsData = await response.json();

    return {
      brands: brandsData,
      enrichedData: null,
      isPrerendered: false,
    };
  } catch (error) {
    console.error("Failed to load data:", error);
    return {
      brands: [],
      enrichedData: null,
      isPrerendered: false,
    };
  }
}
