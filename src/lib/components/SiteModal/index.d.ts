import type { SvelteComponent } from "svelte";

interface $$Props {
  id: string;
  header?: any;
  children?: any;
  footer?: any;
  closedby?: "any" | "none" | "closerequest";
}

export default class SiteModal extends SvelteComponent<$$Props> {}
