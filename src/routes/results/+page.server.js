import { generateEnrichedData } from "$lib/server/benchmark.js";
import { summarizeScores, summarizeComponents } from "$lib/calculations/summary.js";

export const prerender = true;

export async function load() {
  const rows = await generateEnrichedData();
  return {
    summary: summarizeScores(rows),
    componentSummary: summarizeComponents(rows),
  };
}
