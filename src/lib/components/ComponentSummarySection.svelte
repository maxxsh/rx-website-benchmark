<script>
  export let componentSummary;

  function isNumber(value) {
    return typeof value === "number" && !Number.isNaN(value);
  }

  function formatNumber(value, decimals = 1) {
    return isNumber(value)
      ? Math.round(value * 10 ** decimals) / 10 ** decimals
      : "N/A";
  }

  function formatPercent(value) {
    return isNumber(value) ? `${formatNumber(value)}%` : "N/A";
  }

  function formatCount(value) {
    return Number.isFinite(value) ? value : "N/A";
  }
</script>

<div class="w-full">
  <h2 class="mb-2">Component Summary</h2>

  <div class="grid gap-4 text-sm text-gray-700">
    <div class="w-full">
      <h3 class="mb-1">CrUX category distribution among non-missing values</h3>
      <div class="grid gap-6 [grid-template-columns:repeat(auto-fit,_250px)]">
        {#each Object.entries(componentSummary.crux) as [metricKey, metric]}
          <div>
            <div class="font-medium">{metric.label}</div>
            <div>Good: {formatPercent(metric.goodPct)}</div>
            <div>Needs Improvement: {formatPercent(metric.niPct)}</div>
            <div>Poor: {formatPercent(metric.poorPct)}</div>
            <div>Missing: {formatPercent(metric.missingPct)}</div>
          </div>
        {/each}
      </div>
    </div>

    <div>
      <h3 class="mb-1">Pa11y burden</h3>
      <div class="grid gap-6 [grid-template-columns:repeat(auto-fit,_250px)]">
        <div>
          <div class="font-medium">Pa11y A</div>
          <div>Median: {formatNumber(componentSummary.pa11y.aMedian)}</div>
          <div>
            IQR (Q1–Q3): {formatNumber(componentSummary.pa11y.aQ1)} –
            {formatNumber(componentSummary.pa11y.aQ3)}
          </div>
          <div>
            % with A = 0: {formatPercent(componentSummary.pa11y.aZeroPct)}
          </div>
        </div>
        <div>
          <div class="font-medium">Pa11y AA</div>
          <div>Median: {formatNumber(componentSummary.pa11y.aaMedian)}</div>
          <div>
            IQR (Q1–Q3): {formatNumber(componentSummary.pa11y.aaQ1)} –
            {formatNumber(componentSummary.pa11y.aaQ3)}
          </div>
          <div>
            % with AA = 0: {formatPercent(componentSummary.pa11y.aaZeroPct)}
          </div>
        </div>
      </div>
    </div>

    <div>
      <h3 class="mb-1">Lighthouse</h3>
      <div class="grid gap-6 [grid-template-columns:repeat(auto-fit,_250px)]">
        {#each Object.entries(componentSummary.lighthouse) as [metricKey, metric]}
          <div>
            <div class="font-medium">{metric.label}</div>
            <div>Median: {formatNumber(metric.median)}</div>
            <div>
              IQR (Q1–Q3): {formatNumber(metric.q1)} – {formatNumber(metric.q3)}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div>
      <h3 class="mb-1">
        CrUX device mix among rows with available device data (missing % out of
        N={componentSummary.totalRows})
      </h3>
      <div class="grid gap-6 [grid-template-columns:repeat(auto-fit,_250px)]">
        {#each [["Phone", "phone"], ["Tablet", "tablet"], ["Desktop", "desktop"]] as [label, key]}
          <div>
            <div class="font-medium">{label}</div>
            <div>
              Dominant rows (most-used {label.toLowerCase()}): {formatCount(
                componentSummary.devices?.summary?.[key]?.count,
              )}
              ({formatPercent(
                componentSummary.devices?.summary?.[key]?.percentOfTotal,
              )})
            </div>
            <div>
              Average usage: {formatPercent(
                componentSummary.devices?.summary?.[key]?.avgUsage,
              )}
            </div>
            <div>
              Avg FScore: {formatNumber(
                componentSummary.devices?.summary?.[key]?.avgFScore,
              )}
            </div>
          </div>
        {/each}
        <div>
          <div class="font-medium">Missing reports</div>
          <div>
            {formatCount(componentSummary.devices?.missingCount)}
            ({formatPercent(componentSummary.devices?.missingPct)})
          </div>
        </div>
      </div>
    </div>
    <div>
      <h3 class="mb-1">Readability</h3>
      <div class="grid gap-6 [grid-template-columns:repeat(auto-fit,_250px)]">
        {#each Object.entries(componentSummary.readability) as [metricKey, metric]}
          <div>
            <div class="font-medium">{metric.label}</div>
            <div>Median: {formatNumber(metric.median)}</div>
            <div>
              IQR (Q1–Q3): {formatNumber(metric.q1)} – {formatNumber(metric.q3)}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
  <p class="text-xs pt-4 text-gray-600">
    Footnote: Medians and IQRs were computed using available numeric values
    (missing/N/A excluded). Percentages are reported with denominators as
    specified (eg, CrUX category percentages among non-missing values;
    missingness out of N={componentSummary.totalRows}).
  </p>
</div>
