<script>
  import { onMount } from "svelte";

  let data = null;
  let error = null;

  onMount(async () => {
    try {
      const [res, listRes] = await Promise.all([
        fetch("/crux/crux-grouped-results.json"),
        fetch("/script-data/validated-working-list-final.json"),
      ]);
      if (!res.ok || !listRes.ok) throw new Error("Could not load the study dataset");
      const jsonData = await res.json();
      const homepages = await listRes.json();

      // Process data
      const processed = processData(jsonData, homepages);
      data = processed;
    } catch (err) {
      error = err.message;
    }
  });

  function processData(jsonData, homepages) {
    const urls = [...new Set(homepages.map((site) => site.redirect || site.website))];
    const results = urls.map((url) => jsonData.results?.[url] ?? {});
    const N_total = urls.length;

    const metrics = ["loadingPerformance", "interactivity", "visualStability"];
    const metricLabels = {
      loadingPerformance: "Loading Performance (LCP)",
      interactivity: "Interactivity (INP)",
      visualStability: "Visual Stability (CLS)",
    };

    const processedMetrics = {};

    metrics.forEach((metric) => {
      let good = 0,
        ni = 0,
        poor = 0,
        missing = 0;
      Object.values(results).forEach((site) => {
        const val =
          site[metric] !== null && site[metric] !== undefined
            ? site[metric]
            : site.fullDataRange?.[metric];
        if (val === 3) good++;
        else if (val === 2) ni++;
        else if (val === 1) poor++;
        else missing++;
      });

      const N_nonmissing = good + ni + poor;
      const pct_good = N_nonmissing > 0 ? (good / N_nonmissing) * 100 : 0;
      const pct_ni = N_nonmissing > 0 ? (ni / N_nonmissing) * 100 : 0;
      const pct_poor = N_nonmissing > 0 ? (poor / N_nonmissing) * 100 : 0;

      processedMetrics[metric] = {
        label: metricLabels[metric],
        N_nonmissing,
        good,
        ni,
        poor,
        missing,
        pct_good,
        pct_ni,
        pct_poor,
        sum_check: good + ni + poor + missing,
      };

      // Log the table
      console.log(
        `${metric}: good=${good}, ni=${ni}, poor=${poor}, missing=${missing}, sum_check=${good + ni + poor + missing}`,
      );
      console.log(
        `pct among non-missing: good=${pct_good.toFixed(2)}%, ni=${pct_ni.toFixed(2)}%, poor=${pct_poor.toFixed(2)}%, sum=${(pct_good + pct_ni + pct_poor).toFixed(2)}%`,
      );
    });

    return { processedMetrics, N_total };
  }
</script>

<svelte:head>
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<section class=" items-start py-0" aria-labelledby="crux-visual-title">
  {#if error}
    <p>Error: {error}</p>
  {:else if data}
    <h2 id="crux-visual-title" class="text-4xl mt-0">
      Distribution of CrUX Field Metric Classifications
    </h2>
    <p class="text-xl text-gray-600">
      Percentages are calculated among non-missing CrUX observations for each
      metric (n shown); missing data are excluded from denominators.
    </p>

    <div
      class="grid w-full mt-20 gap-[1%] items-center gap-y-2 grid-cols-[auto_1fr]"
    >
      {#each Object.entries(data.processedMetrics) as [key, metric]}
        <div class="text-xs sm:text-sm font-bold text-right">
          {metric.label} (n={metric.N_nonmissing})
        </div>
        <div class="flex flex-col">
          <div class="flex items-center h-6">
            <!-- Good -->
            <div
              class="h-6 bg-green-500 flex items-center justify-center text-white text-xs font-bold"
              style="width: {metric.pct_good}%;"
            >
              {#if metric.pct_good >= 4}{metric.pct_good.toFixed(1)}%{/if}
            </div>
            <!-- Needs Improvement -->
            <div
              class="h-6 bg-yellow-500 flex items-center justify-center text-black text-xs font-bold"
              style="width: {metric.pct_ni}%;"
            >
              {#if metric.pct_ni >= 4}{metric.pct_ni.toFixed(1)}%{/if}
            </div>
            <!-- Poor -->
            <div
              class="h-6 bg-red-500 flex items-center justify-center text-white text-xs font-bold"
              style="width: {metric.pct_poor}%;"
            >
              {#if metric.pct_poor >= 4}{metric.pct_poor.toFixed(1)}%{/if}
            </div>
          </div>
        </div>
      {/each}
      <div></div>
      <div
        class="relative w-full h-4 border-t text-[.5rem] sm:text-[.65rem] border-gray-300 mt-4 text-gray-500"
      >
        <span class="absolute bottom-0 left-0">0%</span>
        <span class="absolute bottom-0 left-[20%]">20%</span>
        <span class="absolute bottom-0 left-[40%]">40%</span>
        <span class="absolute bottom-0 left-[60%]">60%</span>
        <span class="absolute bottom-0 left-[80%]">80%</span>
        <span class="absolute bottom-0 -right-[2ch]">100%</span>
      </div>
    </div>

    <footer class="mt-12 text-xs text-gray-600">
      <div class="flex gap-4 my-5">
        <div class="flex gap-1">
          <div class="inline-block w-4 h-4 bg-green-500"></div>
          Good
        </div>
        <div class="flex gap-1">
          <div class="inline-block w-4 h-4 bg-yellow-500"></div>
          Needs Improvement
        </div>
        <div class="flex gap-1">
          <div class="inline-block w-4 h-4 bg-red-500"></div>
          Poor
        </div>
      </div>
    </footer>
  {:else}
    <p>Loading...</p>
  {/if}
</section>
