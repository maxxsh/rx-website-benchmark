<script>
  import { page } from "$app/state";
</script>

<header
  id="header"
  class="bg-[#f2f6ff] container-pad w-full py-2 md:py-3 z-50 flex flex-col items-center top-0 shadow-md transition-all transform ease-in-out duration-500"
>
  <a class="sr-only focus:not-sr-only" href="#main">Skip to content</a>
  <div class="flex items-center content-width justify-between gap-2">
    <nav class="items-center justify-end grow w-full">
      <ul
        class="flex items-center flex-wrap gap-4 md:gap-6 text-base text-[#606060]"
      >
        <li>
          <a
            class={page.url.pathname === "/" ? "underline" : ""}
            href="/"
            aria-current={page.url.pathname === "/" ? "page" : undefined}
          >
            Home
          </a>
        </li>
        <li>
          <a
            class={page.url.pathname === "/results" ? "underline" : ""}
            href="/results"
            aria-current={page.url.pathname === "/results" ? "page" : undefined}
          >
            Results
          </a>
        </li>
      </ul>
    </nav>
    <nav
      id="menu"
      aria-label="Main"
      class="flex items-center justify-end shrink-0"
    >
      <ul class="flex items-center gap-4">
        <li>
          <a class="btn bg-[#B114BF] text-white" href="https://link.springer.com/journal/10209" title="Journal page; the direct article link will be added when available">Article / Journal</a>
        </li>
      </ul>
    </nav>


  </div>
</header>
