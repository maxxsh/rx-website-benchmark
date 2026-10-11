<script>
  import ArticleContext from "$lib/components/ArticleContext.svelte";
  import SummarySection from "$lib/components/SummarySection.svelte";
  import ComponentSummarySection from "$lib/components/ComponentSummarySection.svelte";
  import CruxVisual from "$lib/components/visuals/CruxVisual.svelte";
  import Pa11yVisual from "$lib/components/visuals/Pa11yVisual.svelte";

  export let data;
</script>

<svelte:head>
  <title>Findings | Prescription Drug Brand Websites</title>
  <meta
    name="description"
    content="Study summary and figures accompanying a cross-sectional evaluation of 338 official U.S. prescription drug brand homepages."
  />
</svelte:head>

<section class="py-0 items-start gap-4">
  <ArticleContext />
  <h2 class="text-5xl">Findings</h2>
  <p class="text-base text-gray-700 mb-4">
    This page summarizes the measurements collected across 338 prescription drug
    brand homepages, including web performance, accessibility, and readability.
    Results reflect the study's data collection period and should not be
    interpreted as current website assessments.
  </p>

  <nav
    aria-label="Results sections"
    class="flex flex-wrap gap-x-6 gap-y-2 text-base"
  >
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

<div id="figures" class="flex flex-col gap-12 scroll-mt-8 pb-16">
  <h2>Figures</h2>
  <CruxVisual />
  <Pa11yVisual />
</div>

<style>
  .results-page :global(h2) {
    font-size: 1.5rem;
    font-weight: 600;
  }
  .results-page :global(h3) {
    font-size: 1.125rem;
    font-weight: 500;
  }
  .results-page > section + section,
  #figures {
    border-top: 1px solid #d1d5db;
    padding-top: 2rem;
  }
</style>
