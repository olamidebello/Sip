// Always show the persisted profile rather than the first available tenant trunk.
export function syncCarrierProfileForm(form, profiles) {
  const profile=profiles.find(item=>item.provider===form.elements.provider.value);
  form.elements.trunkId.value=profile?.trunk_id||'';
  form.elements.maxConcurrentCalls.value=profile?.max_concurrent_calls||10;
  form.elements.routingMode.value=profile?.routing_mode==='disabled'?'manual':profile?.routing_mode||'manual';
}
