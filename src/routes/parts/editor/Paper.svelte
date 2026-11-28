<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    /** Accessible name of the sheet. */
    label: string;
    children: Snippet;
  };
  let { label, children }: Props = $props();
</script>

<!--
  The sheet is white in both themes, like the rendered document. The tokens are declared again here
  because the derived ones (--input, --muted, --popover ...) are already resolved on the root element.
  No overflow or transform on this element: the date picker opens its calendar inside it.
-->
<article aria-label={label} class="paper">
  {@render children()}
</article>

<style>
  .paper {
    --foreground: #30272c;
    --card-foreground: #30272c;
    --popover-foreground: #30272c;
    --accent-foreground: #30272c;
    --secondary-foreground: #30272c;
    --muted-foreground: #7b646c;
    --paper: #ffffff;
    --popover: #ffffff;
    --card: #f8eee9;
    --surface: #f8eee9;
    --surface-strong: #f1e4de;
    --muted: #f1e4de;
    --secondary: #f1e4de;
    --accent: #f8eee9;
    --border: #ecdfd9;
    --line-strong: #d9c8c1;
    --input: #d9c8c1;
    --ring: #f06b53;
    --primary: #b84332;
    --primary-hover: #a23a2a;
    --primary-foreground: #fff9f5;
    --destructive: #b3261e;
    --warning: #8a5a0e;
    --success: #2c684e;
    color-scheme: light;
    min-width: 0;
    padding: 2rem 1.75rem 2.25rem;
    border-radius: 4px;
    background: #ffffff;
    color: #30272c;
    box-shadow:
      0 1px 0 rgb(48 39 44 / 4%),
      0 12px 32px -12px rgb(48 39 44 / 18%);
  }

  :global([data-theme="dark"]) .paper {
    box-shadow:
      0 0 0 1px rgb(255 230 224 / 7%),
      0 18px 40px -16px rgb(0 0 0 / 70%);
  }

  @media (min-width: 1181px) {
    .paper {
      padding: 2.75rem 3rem 2.5rem;
    }
  }
</style>
