<script lang="ts">
  import CustomerPage from "./parts/customer/CustomerPage.svelte";

  type Props = { params?: { id?: string } };
  let { params }: Props = $props();
</script>

{#key params?.id}
  <CustomerPage rawId={params?.id} />
{/key}
