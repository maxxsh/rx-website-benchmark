<script>
  import ArticleContext from "$lib/components/ArticleContext.svelte";
  import SummarySection from "$lib/components/SummarySection.svelte";
  import ComponentSummarySection from "$lib/components/ComponentSummarySection.svelte";
  import CruxVisual from "$lib/components/visuals/CruxVisual.svelte";
  import Pa11yVisual from "$lib/components/visuals/Pa11yVisual.svelte";

  export let data;
</script>

<svelte:head>
  <title>Results | Prescription Drug Brand Websites</title>
  <meta name="description" content="Study summary and figures accompanying a cross-sectional evaluation of 338 official U.S. prescription drug brand homepages." />
</svelte:head>

<div class="results-page self-center content-width flex flex-col gap-12 pb-16">
  <section class="py-0 items-start gap-4">
    <h1>Results</h1>
    <ArticleContext />
    <p class="text-base text-gray-600">
      Explore performance, accessibility, and readability across {data.summary.totalRows}
      official U.S. prescription drug brand homepages. Per-homepage measurements
      are available in the <a class="underline" href="/">benchmark table</a>.
    </p>
    <nav aria-label="Results sections" class="flex flex-wrap gap-x-6 gap-y-2 text-base">
      <a class="underline" href="#summary">Summary</a>
      <a class="underline" href="#components">Component summary</a>
      <a class="underline" href="#figures">Figures</a>
    </nav>
  </section>

  <section id="summary" class="py-0 items-start scroll-mt-8">
    <SummarySection summary={data.summary} />
  </section>

  <section id="components" class="py-0 items-start gap-6 scroll-mt-8">
    <ComponentSummarySection componentSummary={data.componentSummary} />

  </section>

  <div id="figures" class="flex flex-col gap-12 scroll-mt-8">
    <h2 class="text-3xl px-4 md:px-6">Figures</h2>
    <CruxVisual />
    <Pa11yVisual />
  </div>
</div>

<style>
  .results-page :global(h2) { font-size: 1.5rem; font-weight: 600; }
  .results-page :global(h3) { font-size: 1.125rem; font-weight: 500; }
  .results-page > section + section,
  #figures { border-top: 1px solid #d1d5db; padding-top: 2rem; }
</style>
