<script lang="ts">
  type Props = { title: string; text: string };
  let { title, text }: Props = $props();
</script>

<section class="mb-4">
  <h3 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-1">{title}</h3>
  <p class="text-sm whitespace-pre-line">{text}</p>
</section>
