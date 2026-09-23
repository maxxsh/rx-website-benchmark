<script>
  import "./SiteModal.css";
  import { browser } from "$app/environment";
  import { onMount } from "svelte";

  let { id, header, children, footer, closedby = "any" } = $props();

  let dialog = $state();

  // Global flag to ensure we only add event listeners once
  const MODAL_MANAGER_KEY = "__siteModal_initialized";

  onMount(() => {
    if (!browser) return;

    if (!window[MODAL_MANAGER_KEY]) {
      initializeModalManager();
      window[MODAL_MANAGER_KEY] = true;
    }

    registerModal(id, dialog);

    return () => {
      unregisterModal(id);
    };
  });

  function initializeModalManager() {
    if (!window.modalInstances) {
      window.modalInstances = new Map();
    }

    // Global click handler for modal triggers
    document.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-modal-trigger]");
      if (trigger) {
        e.preventDefault();
        const modalId = trigger.dataset.modalTrigger;
        openModal(modalId);
      }

      // Handle close buttons
      const closeBtn = e.target.closest("[data-close]");
      if (closeBtn) {
        const modal = closeBtn.closest("dialog");
        if (modal) {
          closeModal(modal.id);
        }
      }
    });
  }

  function registerModal(modalId, dialogElement) {
    if (window.modalInstances) {
      window.modalInstances.set(modalId, dialogElement);
    }
  }

  function unregisterModal(modalId) {
    if (window.modalInstances) {
      window.modalInstances.delete(modalId);
    }
  }

  function openModal(modalId) {
    const modal = window.modalInstances?.get(modalId);
    if (modal && !modal.open) {
      modal.showModal();
      document.body.classList.add("modal-open");
    }
  }

  function closeModal(modalId) {
    const modal = window.modalInstances?.get(modalId);
    if (modal && modal.open) {
      modal.close();
      document.body.classList.remove("modal-open");
    }
  }
</script>

<dialog
  bind:this={dialog}
  {id}
  class="site-modal max-w-2xl inset-0 m-auto"
  {closedby}
>
  {#if header}
    <div class="modal-header flex items-center justify-between p-4 border-b">
      <div>
        {@render header()}
      </div>
      <button
        class="text-2xl py-1 px-2 leading-none text-gray-500 transition-colors hover:text-gray-900 focus:outline-2 focus:outline-blue-500 focus:outline-offset-2 focus:rounded"
        aria-label="Close modal"
        data-close>&times;</button
      >
    </div>
  {/if}

  <div class="modal-body p-4">
    {@render children?.()}
  </div>

  {#if footer}
    <div class="modal-footer flex justify-end border-t gap-1 p-4">
      {@render footer()}
    </div>
  {/if}
</dialog>
