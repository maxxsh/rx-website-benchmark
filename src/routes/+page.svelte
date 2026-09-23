<script>
  import ArticleContext from "$lib/components/ArticleContext.svelte";
  import { browser, dev } from "$app/environment";
  import { onMount } from "svelte";
  import { slugify } from "$lib/utils.js";
  import {
    processLighthouseReport,
    createFallbackData,
  } from "$lib/auditProcessors.js";
  import { read_s, read_s_ref } from "$lib/calculations/read_s.js";
  import { computeAllScores } from "$lib/calculations/scores.js";

  export let data;

  let sortBy = "brand";
  let sortDirection = "asc";

  // Use pre-generated data if available (production), otherwise load client-side (development)
  const usePrerenderedData = data.isPrerendered && data.enrichedData;

  let enrichedData = usePrerenderedData ? data.enrichedData : [];
  let readableData = {};
  let cruxData = {};
  let isLoading = !usePrerenderedData;

  onMount(async () => {
    if (!browser || !dev) return;

    let cruxTimestamp = null;

    try {
      const cruxResponse = await fetch("/crux/crux-grouped-results.json");
      if (cruxResponse.ok) {
        const cruxJson = await cruxResponse.json();
        cruxData = cruxJson.results || {};
        cruxTimestamp = cruxJson.timestamp;
      }
    } catch (error) {
      console.error("Failed to load CrUX grouped results:", error);
    }

    // Otherwise, load client-side (development)
    console.log("Loading data client-side (development mode)");

    try {
      // Load Pa11y grouped results and readable data
      const [
        pa11yAAResponse,
        pa11yAResponse,
        readableResponse,
        websitesResponse,
      ] = await Promise.all([
        fetch("/pa11y/AA/grouped-results.json"),
        fetch("/pa11y/A/grouped-results.json"),
        fetch("/readable/combined-readable-results.json"),
        fetch("/script-data/fda-validated-final-list.json"),
      ]);

      const pa11yAAJson = pa11yAAResponse.ok
        ? await pa11yAAResponse.json()
        : null;
      const pa11yAJson = pa11yAResponse.ok ? await pa11yAResponse.json() : null;
      const readableJson = readableResponse.ok
        ? await readableResponse.json()
        : null;
      const websitesJson = websitesResponse.ok
        ? await websitesResponse.json()
        : [];

      const pa11yAAResults = pa11yAAJson?.results || {};
      const pa11yAResults = pa11yAJson?.results || {};
      readableData = readableJson?.results || {};

      // Create beneficiaries map
      const beneficiariesMap = new Map();
      for (const item of websitesJson) {
        beneficiariesMap.set(item.brand.toLowerCase(), item.beneficiaries);
      }

      const updatedData = [];
      const brands = data?.brands || [];

      for (const brand of brands) {
        const slug = slugify(brand.redirect);
        const pa11yAErrors =
          pa11yAResults[brand.redirect]?.totalErrorInstances ?? null;
        const pa11yAAErrors =
          pa11yAAResults[brand.redirect]?.totalErrorInstances ?? null;

        if (!slug) {
          updatedData.push(
            createFallbackData(brand, null, {
              pa11yAErrors,
              pa11yAAErrors,
            }),
          );
          continue;
        }

        try {
          const reportResponse = await fetch(
            `/lighthouse/${slug.replace(/%/g, "%25")}.report.json`,
          );

          if (!reportResponse.ok) {
            throw new Error(`Report not found: ${slug}`);
          }

          const report = await reportResponse.json();
          const pa11ySlug = slugify(brand.redirect, "pa11y");

          const processedData = processLighthouseReport(
            brand,
            report,
            { pa11yAErrors, pa11yAAErrors },
            slug,
            { pa11ySlug },
          );

          updatedData.push({
            ...processedData,
            crux: cruxData[brand.redirect] || null,
            "Devices %":
              formatCruxDevices({ crux: cruxData[brand.redirect] }) || null,
            crux_run_date: cruxTimestamp,
            beneficiaries:
              beneficiariesMap.get(brand.brand.toLowerCase()) || null,
          });
        } catch (error) {
          console.error(
            `Failed to process report for ${brand.redirect}:`,
            error,
          );

          updatedData.push({
            ...createFallbackData(brand, slug, {
              pa11yAErrors,
              pa11yAAErrors,
            }),
            crux: cruxData[brand.redirect] || null,
            "Devices %":
              formatCruxDevices({ crux: cruxData[brand.redirect] }) || null,
            crux_run_date: cruxTimestamp,
            beneficiaries:
              beneficiariesMap.get(brand.brand.toLowerCase()) || null,
          });
        }
      }

      enrichedData = updatedData;
    } catch (error) {
      console.error("Failed to load data client-side:", error);
      enrichedData = [];
    } finally {
      isLoading = false;
    }
  });

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

  function getCruxEntry(site) {
    if (!site) {
      return null;
    }

    return site.crux ?? cruxData?.[site.redirect] ?? null;
  }

  function getCruxMetricValue(site, key) {
    const entry = getCruxEntry(site);
    if (!entry) {
      return null;
    }

    const directValue = entry[key];
    if (directValue !== null && directValue !== undefined) {
      return directValue;
    }

    const fullValue = entry.fullDataRange?.[key];
    if (fullValue !== null && fullValue !== undefined) {
      return fullValue;
    }

    return null;
  }

  function isCruxMetricFromFull(site, key) {
    const entry = getCruxEntry(site);
    if (!entry?.fullDataRange) {
      return false;
    }

    const directValue = entry[key];
    if (directValue !== null && directValue !== undefined) {
      return false;
    }

    const fullValue = entry.fullDataRange?.[key];
    return fullValue !== null && fullValue !== undefined;
  }

  function formatCruxDevices(site) {
    const entry = getCruxEntry(site);
    const device = entry?.device;
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
    return `${formatValue(phone)}/${formatValue(tablet)}/${formatValue(
      desktop,
    )}`;
  }

  function getCruxSortValue(site, key) {
    const value = getCruxMetricValue(site, key);
    return isNumber(value) ? value : 999;
  }

  function buildScoreRow(site) {
    return {
      "Loading Performance": getCruxMetricValue(site, "loadingPerformance"),
      Interactivity: getCruxMetricValue(site, "interactivity"),
      "Visual Stability": getCruxMetricValue(site, "visualStability"),
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

  function handleHeaderClick(event) {
    const sortKey = event.target?.closest("th")?.dataset?.sortKey;
    if (!sortKey) return;

    if (sortBy === sortKey) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortBy = sortKey;
      sortDirection = "asc";
    }
  }

  function handleHeaderKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleHeaderClick(event);
    }
  }

  $: readabilityRef = usePrerenderedData ? null : read_s_ref(readableData);

  // Enrich data with readable metrics and LH average
  $: enrichedDataWithReadable = enrichedData.map((site) => {
    // If using pre-rendered data (production), it already has all the fields
    if (usePrerenderedData) {
      return site;
    }

    // Otherwise (dev mode), enrich with readableData
    const readable = readableData[site.redirect] || {};
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

    const performance = toNullableNumber(site.performance);
    const accessibility = toNullableNumber(site.accessibility);
    const bestPractices = toNullableNumber(site.bestPractices);
    const seo = toNullableNumber(site.seo);
    const pa11yErrorsA = toNullableNumber(site.pa11yErrorsA);
    const pa11yErrorsAA = toNullableNumber(site.pa11yErrorsAA);

    // Calculate Lighthouse average
    let lhAverage = null;
    if (
      isNumber(performance) &&
      isNumber(accessibility) &&
      isNumber(bestPractices) &&
      isNumber(seo)
    ) {
      lhAverage = (performance + accessibility + bestPractices + seo) / 4;
    }

    return {
      ...site,
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
      readability_run_date: readable.timestamp ?? null,
    };
  });

  $: scoreRows = usePrerenderedData
    ? []
    : enrichedDataWithReadable.map((site) => buildScoreRow(site));

  $: computedScores = usePrerenderedData ? [] : computeAllScores(scoreRows);

  $: enrichedDataWithScore = enrichedDataWithReadable.map((site, index) => {
    if (usePrerenderedData) {
      return site;
    }

    const score = computedScores[index]?.Score ?? null;
    const fScore = computedScores[index]?.FScore ?? null;

    // Add CrUX metrics as top-level properties for summary
    const loadingPerformance = getCruxMetricValue(site, "loadingPerformance");
    const interactivity = getCruxMetricValue(site, "interactivity");
    const visualStability = getCruxMetricValue(site, "visualStability");

    return {
      ...site,
      score: isNumber(score) ? score : null,
      FScore: isNumber(fScore) ? fScore : null,
      loadingPerformance,
      interactivity,
      visualStability,
    };
  });


  $: sortedData =
    enrichedDataWithScore.length > 0
      ? [...enrichedDataWithScore].sort((a, b) => {
          let aVal, bVal;

          switch (sortBy) {
            case "brand":
              aVal = a.brand.toLowerCase();
              bVal = b.brand.toLowerCase();
              break;
            case "website":
              aVal = a.website.toLowerCase();
              bVal = b.website.toLowerCase();
              break;
            case "performance":
              aVal = isNumber(a.performance) ? a.performance : -1;
              bVal = isNumber(b.performance) ? b.performance : -1;
              break;
            case "accessibility":
              aVal = isNumber(a.accessibility) ? a.accessibility : -1;
              bVal = isNumber(b.accessibility) ? b.accessibility : -1;
              break;
            case "bestPractices":
              aVal = isNumber(a.bestPractices) ? a.bestPractices : -1;
              bVal = isNumber(b.bestPractices) ? b.bestPractices : -1;
              break;
            case "seo":
              aVal = isNumber(a.seo) ? a.seo : -1;
              bVal = isNumber(b.seo) ? b.seo : -1;
              break;
            case "lhAverage":
              aVal = isNumber(a.lhAverage) ? a.lhAverage : -1;
              bVal = isNumber(b.lhAverage) ? b.lhAverage : -1;
              break;
            case "score":
              aVal = isNumber(a.score) ? a.score : -1;
              bVal = isNumber(b.score) ? b.score : -1;
              break;
            case "FScore":
              aVal = isNumber(a.FScore) ? a.FScore : -1;
              bVal = isNumber(b.FScore) ? b.FScore : -1;
              break;
            case "cruxLoadingPerformance":
              aVal = getCruxSortValue(a, "loadingPerformance");
              bVal = getCruxSortValue(b, "loadingPerformance");
              break;
            case "cruxInteractivity":
              aVal = getCruxSortValue(a, "interactivity");
              bVal = getCruxSortValue(b, "interactivity");
              break;
            case "cruxVisualStability":
              aVal = getCruxSortValue(a, "visualStability");
              bVal = getCruxSortValue(b, "visualStability");
              break;
            case "pa11yErrorsA":
              aVal = isNumber(a.pa11yErrorsA) ? a.pa11yErrorsA : 999;
              bVal = isNumber(b.pa11yErrorsA) ? b.pa11yErrorsA : 999;
              break;
            case "pa11yErrorsAA":
              aVal = isNumber(a.pa11yErrorsAA) ? a.pa11yErrorsAA : 999;
              bVal = isNumber(b.pa11yErrorsAA) ? b.pa11yErrorsAA : 999;
              break;
            case "fleschKincaid":
              aVal = isNumber(a.fleschKincaid) ? a.fleschKincaid : -1;
              bVal = isNumber(b.fleschKincaid) ? b.fleschKincaid : -1;
              break;
            case "gunningFog":
              aVal = isNumber(a.gunningFog) ? a.gunningFog : 999;
              bVal = isNumber(b.gunningFog) ? b.gunningFog : 999;
              break;
            case "spellingError":
              aVal = isNumber(a.spellingError) ? a.spellingError : 999;
              bVal = isNumber(b.spellingError) ? b.spellingError : 999;
              break;
            case "wordCount":
              aVal = isNumber(a.wordCount) ? a.wordCount : -1;
              bVal = isNumber(b.wordCount) ? b.wordCount : -1;
              break;
            case "readScore":
              aVal = isNumber(a.readScore) ? a.readScore : -1;
              bVal = isNumber(b.readScore) ? b.readScore : -1;
              break;
            case "tlh_run_date":
              aVal = a.tlh_run_date || "";
              bVal = b.tlh_run_date || "";
              break;
            case "crux_run_date":
              aVal = a.crux_run_date || "";
              bVal = b.crux_run_date || "";
              break;
            case "pa11y_run_date":
              aVal = a.pa11y_run_date || "";
              bVal = b.pa11y_run_date || "";
              break;
            case "readability_run_date":
              aVal = a.readability_run_date || "";
              bVal = b.readability_run_date || "";
              break;
            case "totBenes2023":
              aVal = isNumber(a.beneficiaries) ? a.beneficiaries : -1;
              bVal = isNumber(b.beneficiaries) ? b.beneficiaries : -1;
              break;
            default:
              return 0;
          }

          if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
          if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
          return 0;
        })
      : [];
</script>

<!-- Lighthouse Reports Table -->
{#if isLoading}
  <section class="relative gap-6 scroll-mt-[72px] pt-0 items-start">
    <h1 class="">
      Prescription Medication Brand Websites: Performance and Accessibility
      Analysis
    </h1>
    <ArticleContext />
    <div class="text-center py-12">
      <p class="text-lg">Loading benchmark data...</p>
    </div>
  </section>
{:else if enrichedData && enrichedData.length > 0}
  <section class="relative scroll-mt-[72px] pt-0 items-start">
    <h1 class="">
      Prescription Medication Brand Websites: Performance and Accessibility
      Analysis
    </h1>
    <ArticleContext />
    <div class="w-full mb-12">
      <table
        class="text-xs w-full min-w-max border-collapse border leading-1.1 border-gray-300 [&_th]:border [&_th]:border-gray-300 [&_th]:px-1 [&_th]:py-0.5 [&_th]:font-semibold [&_thead_tr]:bg-gray-100 [&_td]:border [&_td]:border-gray-300 [&_td]:px-1 [&_td]:py-0.5 text-center [&_tbody_tr:hover]:bg-gray-50"
      >
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <thead
          onclick={handleHeaderClick}
          onkeydown={handleHeaderKeydown}
          class="sticky top-0 z-11 bg-white"
        >
          <tr>
            <th rowspan="2" class="text-center"> # </th>
            <th
              rowspan="2"
              class="sticky text-left left-0 cursor-pointer bg-white"
              data-sort-key="brand"
              tabindex="0"
            >
              Brand
              {#if sortBy === "brand"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              rowspan="2"
              class="cursor-pointer text-left"
              data-sort-key="website"
              tabindex="0"
            >
              Tested URL
              {#if sortBy === "website"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th rowspan="2" class="">Reports<sup><a href="#reports-note" aria-label="Read about report dates and the Vis link">1</a></sup></th>
            <th
              rowspan="2"
              class="cursor-pointer"
              data-sort-key="score"
              tabindex="0"
              title="Score"
            >
              Score
              {#if sortBy === "score"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              rowspan="2"
              class="cursor-pointer"
              data-sort-key="FScore"
              tabindex="0"
              title="FScore"
            >
              FScore
              {#if sortBy === "FScore"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th colspan="5" class="bg-blue-50">LH Performance & Core Metrics</th
            >
            <th colspan="4" class="bg-emerald-50">CrUX</th>
            <th colspan="2" class="bg-purple-50">Pa11y</th>
            <th colspan="5" class="bg-amber-50">Content</th>
            {#if dev}
              <th colspan="5" class="bg-gray-50">Run Dates</th>
            {/if}
          </tr>
          <tr>
            <th
              class="cursor-pointer"
              title="Performance"
              data-sort-key="performance"
              tabindex="0"
            >
              Prf
              {#if sortBy === "performance"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="accessibility"
              tabindex="0"
              title="Accessibility"
            >
              Acc
              {#if sortBy === "accessibility"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="bestPractices"
              tabindex="0"
              title="Best Practices"
            >
              BP
              {#if sortBy === "bestPractices"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th class="cursor-pointer" data-sort-key="seo" tabindex="0">
              SEO
              {#if sortBy === "seo"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="lhAverage"
              tabindex="0"
              title="Average of Lighthouse scores"
            >
              Avg
              {#if sortBy === "lhAverage"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="cruxLoadingPerformance"
              tabindex="0"
              title="Loading Performance"
            >
              LCP
              {#if sortBy === "cruxLoadingPerformance"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="cruxInteractivity"
              tabindex="0"
              title="Interactivity"
            >
              INP
              {#if sortBy === "cruxInteractivity"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="cruxVisualStability"
              tabindex="0"
              title="Visual Stability"
            >
              CLS
              {#if sortBy === "cruxVisualStability"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th title="Devices - Percentage of Phone/Tablet/Desktop traffic"
              >Devices %</th
            >
            <th
              class="cursor-pointer"
              data-sort-key="pa11yErrorsA"
              tabindex="0"
              title="Pa11y errors - A standard"
            >
              A
              {#if sortBy === "pa11yErrorsA"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="pa11yErrorsAA"
              tabindex="0"
              title="Pa11y errors - AA standard"
            >
              AA
              {#if sortBy === "pa11yErrorsAA"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="fleschKincaid"
              tabindex="0"
              title="Flesch-Kincaid Reading Ease"
            >
              FRE
              {#if sortBy === "fleschKincaid"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="gunningFog"
              tabindex="0"
              title="Gunning Fog Index"
            >
              GF Index
              {#if sortBy === "gunningFog"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="spellingError"
              tabindex="0"
              title="Spelling Error Percentage"
            >
              Spell %
              {#if sortBy === "spellingError"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="wordCount"
              tabindex="0"
              title="Word Count"
            >
              Words
              {#if sortBy === "wordCount"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="readScore"
              tabindex="0"
              title="Confidence-adjusted readability (0–100) - title tag"
            >
              READ_S<sup><a href="#readability-note" aria-label="Read about the READ_S calculation">2</a></sup>
              {#if sortBy === "readScore"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            {#if dev}
              <th
                class="cursor-pointer"
                data-sort-key="tlh_run_date"
                tabindex="0"
                title="Lighthouse Run Date"
              >
                TLH Date
                {#if sortBy === "tlh_run_date"}
                  <span class="-ml-1"
                    >{sortDirection === "asc" ? "↑" : "↓"}</span
                  >
                {/if}
              </th>
              <th
                class="cursor-pointer"
                data-sort-key="crux_run_date"
                tabindex="0"
                title="CrUX Run Date"
              >
                CrUX Date
                {#if sortBy === "crux_run_date"}
                  <span class="-ml-1"
                    >{sortDirection === "asc" ? "↑" : "↓"}</span
                  >
                {/if}
              </th>
              <th
                class="cursor-pointer"
                data-sort-key="pa11y_run_date"
                tabindex="0"
                title="Pa11y Run Date"
              >
                Pa11y Date
                {#if sortBy === "pa11y_run_date"}
                  <span class="-ml-1"
                    >{sortDirection === "asc" ? "↑" : "↓"}</span
                  >
                {/if}
              </th>
              <th
                class="cursor-pointer"
                data-sort-key="readability_run_date"
                tabindex="0"
                title="Readability Run Date"
              >
                Read Date
                {#if sortBy === "readability_run_date"}
                  <span class="-ml-1"
                    >{sortDirection === "asc" ? "↑" : "↓"}</span
                  >
                {/if}
              </th>
              <th
                class="cursor-pointer"
                data-sort-key="totBenes2023"
                tabindex="0"
                title="Total Beneficiaries 2023"
              >
                Tot_Benes_2023
                {#if sortBy === "totBenes2023"}
                  <span class="-ml-1"
                    >{sortDirection === "asc" ? "↑" : "↓"}</span
                  >
                {/if}
              </th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each sortedData as site, index (site.slug)}
            <tr>
              <td class="sticky font-medium">
                {index + 1}
              </td>
              <td
                class="sticky left-0 text-left font-medium text-gray-500 z-10 bg-white"
              >
                {site.brand}
              </td>
              <td class=" text-left width-[250px] max-w-[250px]">
                <a
                  href={site.redirect}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-blue-600 hover:underline focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {site.redirect.replace(/^https?:\/\//, "")}
                </a>
              </td>
              <td class="text-center">
                <div class="flex items-center justify-center gap-1">
                  {#if site.lhReportPath}
                    <a
                      href={site.lhReportPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-block hover:opacity-80 transition-opacity"
                      title="View Lighthouse Report"
                    >
                      <img
                        src="/assets/img/lighthouse-icon.svg"
                        alt="Lighthouse"
                        width="20"
                        height="20"
                      />
                    </a>
                  {:else}
                    <span class="text-gray-400" title="No report available"
                      >N/A</span
                    >
                  {/if}
                  {#if site.pa11yAAReportPath}
                    <a
                      href={site.pa11yAAReportPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-block hover:opacity-80 transition-opacity"
                      title="View Pa11y Report"
                    >
                      <img
                        src="/assets/img/pa11y-icon.svg"
                        alt="Pa11y"
                        width="14"
                        height="14"
                      />
                    </a>
                  {:else}
                    <span class="text-gray-400" title="No report available"
                      >N/A</span
                    >
                  {/if}
                  <a
                    href={`https://cruxvis.withgoogle.com/#/?view=cwvsummary&url=${encodeURIComponent(site.redirect)}&identifier=url&device=ALL&periodStart=0&periodEnd=38&display=p75s`}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-block text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors pl-1 pt-1"
                    title="View current CrUX data (not the study snapshot)"
                  >
                    <span style="color: #0ccf6b">V</span><span
                      style="color: #ffa401">i</span
                    ><span style="color:red">s</span>
                  </a>
                </div>
              </td>
              <!-- Score Column - Empty for now -->
              <td>
                {isNumber(site.score)
                  ? Math.round(site.score * 10) / 10
                  : "N/A"}
              </td>
              <td>
                {isNumber(site.FScore)
                  ? Math.round(site.FScore * 10) / 10
                  : "N/A"}
              </td>
              <!-- LH Performance & Core Metrics -->
              <td>
                {isNumber(site.performance)
                  ? Math.round(site.performance * 100)
                  : "N/A"}
              </td>
              <td>
                {isNumber(site.accessibility)
                  ? Math.round(site.accessibility * 100)
                  : "N/A"}
              </td>
              <td>
                {isNumber(site.bestPractices)
                  ? Math.round(site.bestPractices * 100)
                  : "N/A"}
              </td>
              <td>
                {isNumber(site.seo) ? Math.round(site.seo * 100) : "N/A"}
              </td>
              <td>
                {isNumber(site.lhAverage)
                  ? Math.round(site.lhAverage * 100)
                  : "N/A"}
              </td>
              <td
                class={isCruxMetricFromFull(site, "loadingPerformance")
                  ? "crux-full-data"
                  : ""}
                title={isCruxMetricFromFull(site, "loadingPerformance")
                  ? "CrUX metric calculated from (full data range) latest available 28-day field window"
                  : undefined}
              >
                {getCruxMetricValue(site, "loadingPerformance") ?? "N/A"}
              </td>
              <td
                class={isCruxMetricFromFull(site, "interactivity")
                  ? "crux-full-data"
                  : ""}
                title={isCruxMetricFromFull(site, "interactivity")
                  ? "CrUX metric calculated from (full data range) latest available 28-day field window"
                  : undefined}
              >
                {getCruxMetricValue(site, "interactivity") ?? "N/A"}
              </td>
              <td
                class={isCruxMetricFromFull(site, "visualStability")
                  ? "crux-full-data"
                  : ""}
                title={isCruxMetricFromFull(site, "visualStability")
                  ? "CrUX metric calculated from (full data range) latest available 28-day field window"
                  : undefined}
              >
                {getCruxMetricValue(site, "visualStability") ?? "N/A"}
              </td>
              <td title="Phone/Tablet/Desktop">
                {formatCruxDevices(site) ?? "N/A"}
              </td>
              <!-- Pa11y -->
              <td
                class={site.pa11yErrorsA === 0
                  ? "text-green-600 font-semibold"
                  : site.pa11yErrorsA == null
                    ? ""
                    : "bg-red-50 font-semibold"}
              >
                {isNumber(site.pa11yErrorsA) ? site.pa11yErrorsA : "N/A"}
              </td>
              <td
                class={site.pa11yErrorsAA === 0
                  ? "text-green-600 font-semibold"
                  : site.pa11yErrorsAA == null
                    ? ""
                    : "bg-red-50 font-semibold"}
              >
                {isNumber(site.pa11yErrorsAA) ? site.pa11yErrorsAA : "N/A"}
              </td>
              <!-- Content -->
              <td
                class={site.readableManualTest ? "content-manual-data" : ""}
                title={site.readableManualTest
                  ? "Content results were obtained with a manual test"
                  : undefined}
              >
                {isNumber(site.fleschKincaid)
                  ? Math.round(site.fleschKincaid * 10) / 10
                  : "N/A"}
              </td>
              <td
                class={site.readableManualTest ? "content-manual-data" : ""}
                title={site.readableManualTest
                  ? "Content results were obtained with a manual test"
                  : undefined}
              >
                {isNumber(site.gunningFog)
                  ? Math.round(site.gunningFog * 10) / 10
                  : "N/A"}
              </td>
              <td
                class={site.readableManualTest ? "content-manual-data" : ""}
                title={site.readableManualTest
                  ? "Content results were obtained with a manual test"
                  : undefined}
              >
                {isNumber(site.spellingError)
                  ? Math.round(site.spellingError * 10) / 10
                  : "N/A"}
              </td>
              <td
                class={site.readableManualTest ? "content-manual-data" : ""}
                title={site.readableManualTest
                  ? "Content results were obtained with a manual test"
                  : undefined}
              >
                {isNumber(site.wordCount) ? site.wordCount : "N/A"}
              </td>
              <td
                class={site.readableManualTest ? "content-manual-data" : ""}
                title={site.readableManualTest
                  ? "Content results were obtained with a manual test"
                  : undefined}
              >
                {isNumber(site.readScore)
                  ? Math.round(site.readScore * 10) / 10
                  : "N/A"}
              </td>
              {#if dev}
                <td>
                  {site.tlh_run_date
                    ? new Date(site.tlh_run_date).toLocaleDateString()
                    : "N/A"}
                </td>
                <td>
                  {site.crux_run_date
                    ? new Date(site.crux_run_date).toLocaleDateString()
                    : "N/A"}
                </td>
                <td>
                  {site.pa11y_run_date
                    ? new Date(site.pa11y_run_date).toLocaleDateString()
                    : "N/A"}
                </td>
                <td>
                  {site.readability_run_date
                    ? new Date(site.readability_run_date).toLocaleDateString()
                    : "N/A"}
                </td>
                <td>
                  {isNumber(site.beneficiaries)
                    ? site.beneficiaries.toLocaleString()
                    : "N/A"}
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="w-full flex flex-col gap-4" aria-label="Table notes">
      <p id="reports-note" class="text-xs text-gray-600 scroll-mt-8">
        <sup>1</sup> In the Reports column, <strong>Vis</strong> opens the live
        Chrome User Experience Report (CrUX) visualization. It shows the data
        currently available in that service, which may change over time; it does
        not reproduce the snapshot used for this study. A visualization fixed to
        the study's collection date is not provided. This link is included for
        convenience and exploratory browsing. The linked Lighthouse and Pa11y
        reports are saved outputs from the study audits and reflect the pages
        as assessed on their respective audit dates. The CrUX values in this
        table come from the study's saved dataset, not the live visualization.
      </p>
    <div id="readability-note" class="scroll-mt-8">
    <p class="text-xs text-gray-600">
      <sup>2</sup> READ_S (confidence-adjusted readability, 0-100) combines
      bounded Flesch Reading Ease and an inverted, normalized Gunning Fog score
      (READ_S = 0.8 · FRE0-100 + 0.2 · FOG0-100). Because readability estimates
      can be unstable when extracted text is sparse, we apply a word-count
      confidence weight c(W) (0 at W ≤ 100, 1 at W ≥ 300) and shrink
      low-confidence values toward READ_ref, defined as the median READ_S among
      pages with W ≥ 300: READ_S = c(W) · READ_S + (1 - c(W)) · READ_ref.
    </p>
    </div>
    </div>
  </section>
{/if}
