<script lang="ts">
  type Props = { title: string; text: string };
  let { title, text }: Props = $props();
</script>

<section>
  <h3 class="mb-1 text-sm font-extrabold">{title}</h3>
  <p class="text-sm whitespace-pre-line">{text}</p>
</section>
