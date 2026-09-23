<script>
  import { onMount } from "svelte";

  let data = null;
  let error = null;

  onMount(async () => {
    try {
      const [listRes, aRes, aaRes] = await Promise.all([
        fetch("/script-data/validated-working-list-final.json"),
        fetch("/pa11y/A/results.json"),
        fetch("/pa11y/AA/results.json"),
      ]);
      const listData = await listRes.json();
      const aData = await aRes.json();
      const aaData = await aaRes.json();

      // Process data
      const processed = processData(listData, aData, aaData);
      data = processed;
    } catch (err) {
      error = err.message;
    }
  });

  function processData(listData, aData, aaData) {
    const allowedUrls = new Set(
      listData.map((item) => item.redirect || item.website),
    );
    const totalUrls = allowedUrls.size;

    // Get filtered results
    const aUrls = Object.keys(aData.results).filter((url) =>
      allowedUrls.has(url),
    );
    const aaUrls = Object.keys(aaData.results).filter((url) =>
      allowedUrls.has(url),
    );
    const aFilteredResults = Object.fromEntries(
      aUrls.map((url) => [url, aData.results[url]]),
    );
    const aaFilteredResults = Object.fromEntries(
      aaUrls.map((url) => [url, aaData.results[url]]),
    );

    const aProcessed = getUniqueIssues(aFilteredResults);
    const aaProcessed = getUniqueIssues(aaFilteredResults);

    // Compute prevalences
    const aPrevalences = {};
    const aaPrevalences = {};
    Object.keys(aProcessed.issueCounts).forEach((key) => {
      aPrevalences[key] = (aProcessed.issueCounts[key] / totalUrls) * 100;
    });
    Object.keys(aaProcessed.issueCounts).forEach((key) => {
      aaPrevalences[key] = (aaProcessed.issueCounts[key] / totalUrls) * 100;
    });

    // All issues by AA prevalence
    const allKeys = Object.keys(aaPrevalences).sort(
      (a, b) => aaPrevalences[b] - aaPrevalences[a],
    );

    const top10 = allKeys.map((key) => ({
      key,
      aCount: aProcessed.issueCounts[key] || 0,
      aaCount: aaProcessed.issueCounts[key],
      aPercent: ((aProcessed.issueCounts[key] || 0) / totalUrls) * 100,
      aaPercent: (aaProcessed.issueCounts[key] / totalUrls) * 100,
    }));

    // Count sites passing all A and all AA (zero issues)
    let aPassCount = 0;
    let aaPassCount = 0;
    allowedUrls.forEach((url) => {
      if (!aFilteredResults[url] || aFilteredResults[url].length === 0)
        aPassCount++;
      if (!aaFilteredResults[url] || aaFilteredResults[url].length === 0)
        aaPassCount++;
    });

    return { top10, totalUrls, aPassCount, aaPassCount };
  }

  function getIssueKey(issue) {
    const match = issue.code.match(
      /Principle(\d+)\.Guideline(\d+)_(\d+)\.(\d+)_(\d+)_(\d+)/,
    );
    if (match) {
      return `${match[4]}.${match[5]}.${match[6]}`;
    }
    return issue.message.toLowerCase().trim().replace(/\s+/g, " ");
  }

  function getUniqueIssues(results) {
    const issueCounts = {};
    Object.entries(results).forEach(([url, issues]) => {
      const unique = new Set();
      issues.forEach((issue) => {
        const key = getIssueKey(issue);
        unique.add(key);
      });
      unique.forEach((key) => {
        issueCounts[key] = (issueCounts[key] || 0) + 1;
      });
    });
    return { issueCounts };
  }

  function computeMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    return n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];
  }

  function computeIQR(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    return `${q1.toFixed(1)}-${q3.toFixed(1)}`;
  }

  function getReadableLabel(key) {
    const labels = {
      "1.1.1": "Non-text Content",
      "1.2.1": "Audio-only and Video-only (Prerecorded)",
      "1.2.2": "Captions (Prerecorded)",
      "1.2.3": "Audio Description or Media Alternative (Prerecorded)",
      "1.3.1": "Info and Relationships",
      "1.3.2": "Meaningful Sequence",
      "1.3.3": "Sensory Characteristics",
      "1.4.1": "Use of Color",
      "1.4.2": "Audio Control",
      "1.4.3": "Contrast (Minimum)",
      "1.4.4": "Resize text",
      "1.4.5": "Images of Text",
      "2.1.1": "Keyboard",
      "2.1.2": "No Keyboard Trap",
      "2.2.1": "Timing Adjustable",
      "2.2.2": "Pause, Stop, Hide",
      "2.3.1": "Three Flashes or Below Threshold",
      "2.4.1": "Bypass Blocks",
      "2.4.2": "Page Titled",
      "2.4.3": "Focus Order",
      "2.4.4": "Link Purpose (In Context)",
      "2.4.5": "Multiple Ways",
      "2.4.6": "Headings and Labels",
      "2.4.7": "Focus Visible",
      "3.1.1": "Language of Page",
      "3.1.2": "Language of Parts",
      "3.2.1": "On Focus",
      "3.2.2": "On Input",
      "3.2.3": "Consistent Navigation",
      "3.2.4": "Consistent Identification",
      "3.3.1": "Error Identification",
      "3.3.2": "Labels or Instructions",
      "3.3.3": "Error Suggestion",
      "3.3.4": "Error Prevention (Legal, Financial, Data)",
      "4.1.1": "Parsing",
      "4.1.2": "Name, Role, Value",
    };
    return labels[key] || key;
  }
</script>

<svelte:head>
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<section class="py-0 items-start" aria-labelledby="pa11y-visual-title">
  {#if error}
    <p>Error: {error}</p>
  {:else if data}
    <h2 id="pa11y-visual-title" class="text-4xl mt-0">
      Pa11y accessibility issue prevalence (WCAG 2.0 AA)
    </h2>
    <p class="text-xl">
      AA audit includes checks up to Level AA. Prevalence = # homepages with ≥1
      instance per SC. N={data.totalUrls}.
    </p>

    <div
      class="w-full grid mt-20 gap-[1%] items-center gap-y-2 grid-cols-[auto_1fr]"
    >
      {#each data.top10 as item}
        <div class="text-xs sm:text-sm font-bold text-right">
          SC {item.key} — {getReadableLabel(item.key)}
        </div>
        <div class="flex flex-col">
          <div class="flex items-center gap-1">
            <div
              class="h-6 box-border {item.key === '3.1.2' ||
              item.key === '1.4.3'
                ? 'bg-red-500'
                : 'bg-blue-500'}"
              style="width: {item.aaPercent}%; border-radius: 0 5px 5px 0;"
            ></div>
            <span class="text-xs font-bold"
              >{item.aaCount} ({item.aaPercent.toFixed(1)}%)</span
            >
          </div>
        </div>
      {/each}
      <div></div>
      <div
        class="relative w-full h-4 border-t text-[.5rem] sm:text-[.65rem] border-gray-300 mt-4 text-gray-500"
      >
        {#each [0, 0.25, 0.5, 0.75, 1] as fraction}
          <span class="absolute bottom-0" style="left: {fraction * 100}%; transform: translateX(-50%);">
            {Math.round(data.totalUrls * fraction)}
          </span>
        {/each}
        <div class="text-xs text-center text-gray-500 mt-4 col-span-2">
          Homepages with ≥1 issue (N={data.totalUrls})
        </div>
      </div>
    </div>

    <footer class="mt-12 text-xs text-gray-600">
      <div class="flex gap-4 my-5">
        <div class="flex gap-1">
          <div class="inline-block w-4 h-4 bg-blue-500"></div>
          WCAG 2.0 Level A SC
        </div>
        <div class="flex gap-1">
          <div class="inline-block w-4 h-4 bg-red-500"></div>
          WCAG 2.0 Level AA SC
        </div>
      </div>
    </footer>
  {:else}
    <p>Loading...</p>
  {/if}
</section>
