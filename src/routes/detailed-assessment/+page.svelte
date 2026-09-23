<script>
  import SiteModalCaseStudy from "$lib/components/SiteModalCaseStudy.svelte";
  import { browser, dev } from "$app/environment";
  import { onMount } from "svelte";
  import { slugify } from "$lib/utils.js";
  import {
    processLighthouseReport,
    createFallbackData,
  } from "$lib/auditProcessors.js";

  export let data;

  let sortBy = "brand";
  let sortDirection = "asc";

  // Use pre-generated data if available (production), otherwise load client-side (development)
  const usePrerenderedData = data.isPrerendered && data.enrichedData;

  let enrichedData = usePrerenderedData ? data.enrichedData : [];
  let isLoading = !usePrerenderedData;

  onMount(async () => {
    if (!browser || !dev) return;

    // Otherwise, load client-side (development)
    console.log("Loading data client-side (development mode)");

    try {
      // Load Pa11y grouped results
      const [pa11yAAResponse, pa11yAResponse] = await Promise.all([
        fetch("/pa11y/AA/grouped-results.json"),
        fetch("/pa11y/A/grouped-results.json"),
      ]);

      let pa11yAAData = {};
      let pa11yAData = {};

      if (pa11yAAResponse.ok) {
        const data = await pa11yAAResponse.json();
        pa11yAAData = data.results || {};
      }

      if (pa11yAResponse.ok) {
        const data = await pa11yAResponse.json();
        pa11yAData = data.results || {};
      }

      const results = await Promise.all(
        data.brands.map(async (brand) => {
          const slug = slugify(brand.redirect);

          if (!slug) {
            return createFallbackData(brand, null, {
              pa11yAErrors: "N/A",
              pa11yAAErrors: "N/A",
            });
          }

          try {
            const reportJsonPath = `/lighthouse/${slug.replace(/%/g, "%25")}.report.json`;
            const reportResponse = await fetch(reportJsonPath);

            if (!reportResponse.ok) {
              console.error(
                `Lighthouse report can't be reached - /lighthouse/${slug}.report.json`,
              );
              throw new Error(`Report not found: ${reportJsonPath}`);
            }

            const report = await reportResponse.json();

            // Get Pa11y error counts and check if reports exist
            const pa11yAErrors =
              pa11yAData[brand.redirect]?.totalErrorInstances || 0;
            const pa11yAAErrors =
              pa11yAAData[brand.redirect]?.totalErrorInstances || 0;

            // Check if Pa11y reports exist
            const pa11ySlug = slugify(brand.redirect, "pa11y");
            const pa11yAAPath = `/pa11y/AA/${pa11ySlug}.html`;
            const pa11yAPath = `/pa11y/A/${pa11ySlug}.html`;

            const [pa11yAACheck, pa11yACheck] = await Promise.all([
              fetch(pa11yAAPath, { method: "HEAD" }).catch(() => ({
                ok: false,
              })),
              fetch(pa11yAPath, { method: "HEAD" }).catch(() => ({
                ok: false,
              })),
            ]);

            if (!pa11yAACheck.ok) {
              console.error(`Pa11y report can't be reached - ${pa11yAAPath}`);
            }
            if (!pa11yACheck.ok) {
              console.error(`Pa11y report can't be reached - ${pa11yAPath}`);
            }

            return processLighthouseReport(
              brand,
              report,
              { pa11yAErrors, pa11yAAErrors },
              slug,
              {
                pa11yAAExists: pa11yAACheck.ok,
                pa11yAExists: pa11yACheck.ok,
                pa11ySlug,
              },
            );
          } catch (error) {
            console.error(`Failed to load report for ${brand.brand}:`, error);

            // Get Pa11y error counts even if Lighthouse report failed
            const pa11yAErrors =
              pa11yAData[brand.redirect]?.totalErrorInstances || 0;
            const pa11yAAErrors =
              pa11yAAData[brand.redirect]?.totalErrorInstances || 0;

            return createFallbackData(brand, slug, {
              pa11yAErrors,
              pa11yAAErrors,
            });
          }
        }),
      );

      enrichedData = results;
      isLoading = false;
    } catch (error) {
      console.error("Failed to load lighthouse reports:", error);
      isLoading = false;
    }
  });

  function handleHeaderClick(event) {
    const th = event.target.closest("th");
    if (!th || !th.dataset.sortKey) return;

    const key = th.dataset.sortKey;

    // Toggle direction if clicking same column
    if (sortBy === key) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortBy = key;
      sortDirection = "asc";
    }
  }

  function handleHeaderKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleHeaderClick(event);
    }
  }

  $: sortedData =
    enrichedData.length > 0
      ? [...enrichedData].sort((a, b) => {
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
            case "score":
              aVal = a.score || 0;
              bVal = b.score || 0;
              break;
            case "performance":
              aVal = a.performance || 0;
              bVal = b.performance || 0;
              break;
            case "accessibility":
              aVal = a.accessibility || 0;
              bVal = b.accessibility || 0;
              break;
            case "bestPractices":
              aVal = a.bestPractices || 0;
              bVal = b.bestPractices || 0;
              break;
            case "seo":
              aVal = a.seo || 0;
              bVal = b.seo || 0;
              break;
            case "colorContrast":
              aVal =
                a.colorContrast === "✓" ? 0 : Number(a.colorContrast) || 999;
              bVal =
                b.colorContrast === "✓" ? 0 : Number(b.colorContrast) || 999;
              break;
            case "headingOrder":
              aVal = a.headingOrder === "✓" ? 0 : Number(a.headingOrder) || 999;
              bVal = b.headingOrder === "✓" ? 0 : Number(b.headingOrder) || 999;
              break;
            case "linkButtonTotal":
              aVal =
                a.linkButtonTotal === "✓" || a.linkButtonTotal === 0
                  ? 0
                  : Number(a.linkButtonTotal) || 999;
              bVal =
                b.linkButtonTotal === "✓" || b.linkButtonTotal === 0
                  ? 0
                  : Number(b.linkButtonTotal) || 999;
              break;
            case "imageAlt":
              aVal = a.imageAlt === "✓" ? 0 : Number(a.imageAlt) || 999;
              bVal = b.imageAlt === "✓" ? 0 : Number(b.imageAlt) || 999;
              break;
            case "vulnerableLibraries":
              aVal = a.vulnerableLibraries === "✓" ? 0 : 1;
              bVal = b.vulnerableLibraries === "✓" ? 0 : 1;
              break;
            case "consoleErrors":
              aVal =
                a.consoleErrors === "✓" ? 0 : Number(a.consoleErrors) || 999;
              bVal =
                b.consoleErrors === "✓" ? 0 : Number(b.consoleErrors) || 999;
              break;
            case "https":
              aVal = a.https === "✓" ? 0 : 1;
              bVal = b.https === "✓" ? 0 : 1;
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

<SiteModalCaseStudy />

<!-- Lighthouse Reports Table -->
{#if isLoading}
  <section class="relative scroll-mt-[72px] py-0">
    <h1 class="">
      Prescription Drug Brand Websites: Performance and Accessibility Analysis
    </h1>
    <h2 class="text-2xl font-bold mb-8">Detailed Web Quality Assessment</h2>
    <div class="text-center py-12">
      <p class="text-lg">Loading detailed reports...</p>
    </div>
  </section>
{:else if enrichedData && enrichedData.length > 0}
  <section class="relative scroll-mt-[72px] py-0">
    <h1 class="">
      Prescription Drug Brand Websites: Performance and Accessibility Analysis
    </h1>
    <h2 class="text-2xl font-bold mb-8">Detailed Web Quality Assessment</h2>
    <div class="w-full border border-gray-200">
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
              Website
              {#if sortBy === "website"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th rowspan="2" class="">Reports</th>
            <th colspan="4" class="bg-blue-50">Performance & Core Metrics</th>
            <th colspan="5" class="bg-purple-50">Accessibility Issues</th>
            <th colspan="4" class="bg-amber-50">Best Practices</th>
            <th colspan="4" class="bg-green-50">SEO</th>
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
              data-sort-key="colorContrast"
              tabindex="0"
              title="Color Contrast"
            >
              Contrast
              {#if sortBy === "colorContrast"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="headingOrder"
              tabindex="0"
              title="Heading elements sequentially-descending order"
            >
              Heading
              {#if sortBy === "headingOrder"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="linkButtonTotal"
              tabindex="0"
              title="Link/Button Name"
            >
              Link Name
              {#if sortBy === "linkButtonTotal"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="imageAlt"
              tabindex="0"
              title="Image elements do not have [alt] attributes"
            >
              Alt
              {#if sortBy === "imageAlt"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="pa11yErrorsAA"
              tabindex="0"
              title="Total Pa11y errors A vs AA standards"
            >
              A/AA
              {#if sortBy === "pa11yErrorsAA"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="vulnerableLibraries"
              tabindex="0"
            >
              Libraries
              {#if sortBy === "vulnerableLibraries"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="consoleErrors"
              tabindex="0"
              title="Console Errors"
            >
              Cons Err
              {#if sortBy === "consoleErrors"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th
              class="cursor-pointer"
              data-sort-key="https"
              tabindex="0"
              title="isOnHttps / redirectsHttp"
            >
              HTTPS
              {#if sortBy === "https"}
                <span class="-ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              {/if}
            </th>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each sortedData as site, index (site.slug)}
            <tr>
              <td class="sticky text-left font-medium">
                {index + 1}
              </td>
              <td
                class="sticky left-0 text-center font-medium text-gray-500 z-10 bg-white"
              >
                {site.brand}
              </td>
              <td class=" text-left width-[250px] max-w-[250px]">
                <a
                  href={site.redirect}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-blue-600 hover:underline"
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
                      >-</span
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
                      >-</span
                    >
                  {/if}
                </div>
              </td>
              <!-- Performance & Core Metrics -->
              <td>
                {site.performance === "N/A"
                  ? "N/A"
                  : Math.round(site.performance * 100)}
              </td>
              <td>
                {site.accessibility === "N/A"
                  ? "N/A"
                  : Math.round(site.accessibility * 100)}
              </td>
              <td>
                {site.bestPractices === "N/A"
                  ? "N/A"
                  : Math.round(site.bestPractices * 100)}
              </td>
              <td>
                {site.seo === "N/A" ? "N/A" : Math.round(site.seo * 100)}
              </td>
              <!-- Accessibility Issues -->
              <td
                class={site.colorContrast === "✓"
                  ? "text-green-600 font-semibold"
                  : "bg-red-50 font-semibold"}
              >
                {site.colorContrast}
              </td>
              <td
                class={site.headingOrder === "✓"
                  ? "text-green-600 font-semibold"
                  : "bg-red-50 font-semibold"}
              >
                {site.headingOrder}
              </td>
              <td
                class={site.linkButtonTotal === 0
                  ? "text-green-600 font-semibold"
                  : "bg-red-50 font-semibold"}
              >
                {site.linkButtonTotal === "N/A"
                  ? "N/A"
                  : site.linkButtonTotal === 0
                    ? "✓"
                    : site.linkButtonTotal}
              </td>
              <td
                class={site.imageAlt === "✓"
                  ? "text-green-600 font-semibold"
                  : "bg-red-50 font-semibold"}
              >
                {site.imageAlt}
              </td>
              <td
                class={site.pa11yErrorsA === 0 && site.pa11yErrorsAA === 0
                  ? "text-green-600 font-semibold"
                  : "bg-red-50 font-semibold"}
              >
                {site.pa11yErrorsA === "N/A" || site.pa11yErrorsAA === "N/A"
                  ? "N/A"
                  : `${site.pa11yErrorsA}/${site.pa11yErrorsAA}`}
              </td>
              <!-- Best Practices -->
              <td
                class={site.vulnerableLibraries === "✓"
                  ? "text-green-600 font-semibold"
                  : "bg-red-50 font-semibold"}
              >
                {site.vulnerableLibraries}
              </td>
              <td
                class={site.consoleErrors === "✓"
                  ? "text-green-600 font-semibold"
                  : "bg-red-50 font-semibold"}
              >
                {site.consoleErrors}
              </td>
              <td
                class={site.https === "✓"
                  ? "text-green-600 font-semibold"
                  : "bg-red-50 font-semibold"}
              >
                {site.https}
              </td>
              <td>-</td>
              <!-- SEO -->
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}
