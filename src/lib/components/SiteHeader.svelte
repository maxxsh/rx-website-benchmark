<script>
  import { page } from "$app/state";
</script>

<header
  id="header"
  class="bg-[#f2f6ff] container-pad w-full py-2 md:py-3 z-50 flex flex-col items-center top-0 shadow-md transition-all transform ease-in-out duration-500"
>
  <a class="sr-only focus:not-sr-only" href="#main">Skip to content</a>
  <div
    class="flex flex-col-reverse md:flex-row items-center content-width justify-between gap-y-2 gap-x-8"
  >
    <nav class="items-center justify-end">
      <ul
        class="flex items-center flex-wrap gap-4 md:gap-6 text-base text-[#606060]"
      >
        <li>
          <a
            class={page.url.pathname === "/" ? "underline" : ""}
            href="/"
            aria-current={page.url.pathname === "/" ? "page" : undefined}
          >
            Dataset
          </a>
        </li>
        <li>
          <a
            class={page.url.pathname === "/results" ? "underline" : ""}
            href="/results"
            aria-current={page.url.pathname === "/results" ? "page" : undefined}
          >
            Findings
          </a>
        </li>
      </ul>
    </nav>

    <h1
      class="flex flex-1 items-center justify-end text-sm sm:text-base md:text-lg text-center leading-[1.1] md:text-right"
    >
      The U.S. Prescription Medication Brand Websites: Performance and
      Accessibility Analysis
    </h1>
  </div>
</header>
