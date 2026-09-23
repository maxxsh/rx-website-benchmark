<script>
  export let summary;

  function isNumber(value) {
    return typeof value === "number" && !Number.isNaN(value);
  }

  function formatValue(value) {
    return isNumber(value) ? Math.round(value * 10) / 10 : "N/A";
  }
</script>

<div class="w-full">
  <h2 class=" mb-2">Summary</h2>
  <div class="grid gap-2 md:grid-cols-2 lg:grid-cols-3 text-sm text-gray-700">
    <div>N total rows: {summary.totalRows}</div>
    <div>N with FScore: {summary.withFScore}</div>
    <div>N with NO_CRUX: {summary.noCrux}</div>
    <div>N with NO_CONTENT: {summary.noContent}</div>
    <div>N with NO_LH: {summary.noLh}</div>
    <div>N with AUDIT_FAIL: {summary.auditFail}</div>
    <div>Median Score: {formatValue(summary.scoreMedian)}</div>
    <div>
      Score IQR (Q1–Q3): {formatValue(summary.scoreQ1)} –
      {formatValue(summary.scoreQ3)}
    </div>
    <div>Median FScore: {formatValue(summary.fScoreMedian)}</div>
    <div>
      FScore IQR (Q1–Q3): {formatValue(summary.fScoreQ1)} –
      {formatValue(summary.fScoreQ3)}
    </div>
  </div>
  <div class="mt-3 text-xs text-gray-600">
    <div>
      NO_CRUX = Loading Performance, Interactivity, Visual Stability all N/A.
    </div>
    <div>NO_CONTENT = READ_S is N/A.</div>
    <div>NO_LH = LH Performance, LH Best Practices, LH SEO all N/A.</div>
    <div>
      AUDIT_FAIL = NO_CRUX + NO_CONTENT + NO_LH (all missing for a row).
    </div>
    <div>Median/IQR computed on available numeric values only.</div>
    <div>Score and FScore summaries use per-homepage values rounded to one decimal, matching the benchmark table and Supplementary Table S1.</div>
  </div>
</div>
