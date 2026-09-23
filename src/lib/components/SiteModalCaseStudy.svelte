<script>
  import SiteModal from "$lib/components/SiteModal";
</script>

{#snippet header()}
  <h2 class="text-2xl font-bold text-primary">Case Study</h2>
{/snippet}

{#snippet footer()}
  <button class="btn bg-gray-200 text-gray-800" data-close>Close</button>
  <button class="btn bg-primary text-white">Learn More</button>
{/snippet}

<SiteModal id="case-study" {header} {footer}></SiteModal>
