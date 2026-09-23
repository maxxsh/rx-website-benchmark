import { dev } from "$app/environment";
import { generateEnrichedData } from "$lib/server/benchmark.js";

export const prerender = true;

export async function load({ fetch }) {
  try {
    // In production (build time), generate enriched data from file system
    if (!dev) {
      console.log("Building enriched data for production...");
      const enrichedData = await generateEnrichedData();

      const brandsData = enrichedData.map(({ brand, website, redirect }) => ({ brand, website, redirect }));

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
