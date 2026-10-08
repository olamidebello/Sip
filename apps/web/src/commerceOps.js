export function setupCommerceOps({get,request}){
  const payment=document.querySelector('#payment-admin'),cluster=document.querySelector('#cluster-admin');
  const gatewayForm=payment.querySelector('#stripe-settings');
  const gatewayStatus=payment.querySelector('#stripe-status');
  const stripeAttempts=payment.querySelector('#stripe-attempts');
  async function refreshPayment(){
    try{
      const [config,history]=await Promise.all([get('/api/admin/payments/gateway'),get('/api/admin/payments/attempts')]);
      gatewayForm.elements.enabled.checked=config.gateway.enabled;
      payment.querySelector('#stripe-webhook-url').textContent=config.webhookUrl;
      gatewayStatus.textContent=`Stripe ${config.gateway.configured?config.gateway.mode+' configured':'not configured'}; ${config.gateway.enabled?'enabled':'disabled'}. ${config.encryptionReady?'':'Server payment encryption key required.'}`;
      stripeAttempts.replaceChildren(...history.attempts.map(entry=>{const li=document.createElement('li');li.textContent=`${entry.email}: ${entry.currency} ${(entry.amount_cents/100).toFixed(2)} · ${entry.status} · ${new Date(entry.created_at).toLocaleString()}`;return li;}));
    }catch(error){gatewayStatus.textContent=error.message;}
  }
  gatewayForm.onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget;
    const data={enabled:form.elements.enabled.checked,confirmLive:form.elements.confirmLive.checked};
    if(form.elements.secretKey.value)data.secretKey=form.elements.secretKey.value.trim();
    if(form.elements.webhookSecret.value)data.webhookSecret=form.elements.webhookSecret.value.trim();
    try{await request('/api/admin/payments/gateway',data,'PUT');form.elements.secretKey.value='';form.elements.webhookSecret.value='';await refreshPayment();}
    catch(error){gatewayStatus.textContent=error.message;}
  };
  payment.querySelector('#stripe-refresh').onclick=refreshPayment;
  const clusterStatus=cluster.querySelector('#cluster-status');
  async function refreshCluster(){try{
    const response=await get('/api/admin/cluster'),state=response.state;
    cluster.querySelector('#cluster-scale').hidden=!response.editable;
    cluster.querySelector('#cluster-summary').textContent=`Desired API replicas: ${state.desired_api_replicas}; last applied: ${state.observed_api_replicas??'not reported'}; revision ${state.revision}. ${response.scope}`;
    clusterStatus.textContent=state.last_error||`Last applied: ${state.last_applied_at?new Date(state.last_applied_at).toLocaleString():'not yet'}`;
    cluster.querySelector('#cluster-history').replaceChildren(...response.actions.map(action=>{const li=document.createElement('li');li.textContent=`${action.replicas} API replicas · ${action.status} · ${action.actor||'system'} · ${new Date(action.created_at).toLocaleString()}`;return li;}));
    cluster.querySelector('#cluster-scale').elements.apiReplicas.value=String(state.desired_api_replicas);
  }catch(error){clusterStatus.textContent=error.message;}}
  cluster.querySelector('#cluster-refresh').onclick=refreshCluster;
  cluster.querySelector('#cluster-scale').onsubmit=async event=>{
    event.preventDefault();try{const count=Number(event.currentTarget.elements.apiReplicas.value);
      await request('/api/admin/cluster/scale',{apiReplicas:count});await refreshCluster();clusterStatus.textContent='Scaling request queued for the local host service.';
    }catch(error){clusterStatus.textContent=error.message;}
  };
  return {refreshPayment,refreshCluster};
}
