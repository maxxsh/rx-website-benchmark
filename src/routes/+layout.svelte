<script>
  import "../app.css";
  import SiteHeader from "$lib/components/SiteHeader.svelte";
  import SiteFooter from "$lib/components/SiteFooter.svelte";

  let { children } = $props();
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Prescription Drug Brand Websites</title>
  <meta name="title" content="" />
  <meta name="description" content="" />
  <meta property="og:title" content="" />
  <meta property="og:description" content="" />
  <meta property="og:site_name" content="" />
  <meta property="og:locale" content="en-US" />
  <meta property="og:type" content="website" />
  <link
    href="/assets/fonts/HostGrotesk-VariableFont_wght.woff2"
    as="font"
    type="font/woff2"
    crossorigin
    rel="preload"
  />
  <link rel="canonical" href="/" />
  <link rel="icon" href="/assets/img/favicon.svg" sizes="32x32" />
</svelte:head>

<SiteHeader />

<main id="main" class="site-width flex flex-col mt-10 lg:mt-16 grow">
  {@render children()}
</main>

<SiteFooter />
