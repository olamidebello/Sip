// USD per minute, rounded to the six decimal places supported by billing.
export function flowrouteCustomerRate(rate){
 const m=/^(0|[1-9]\d{0,5})(?:\.(\d{1,6}))?$/.exec(String(rate));
 if(!m)throw Error('Valid Flowroute carrier cost required');
 const micros=BigInt(m[1])*1000000n+BigInt((m[2]||'').padEnd(6,'0'));
 const customer=(micros*130n+50n)/100n;
 if(customer>999999999999n)throw Error('Flowroute customer rate exceeds billing precision');
 return `${customer/1000000n}.${String(customer%1000000n).padStart(6,'0')}`;
}
export function applyFlowrouteCustomerRate(rate){
 if(!rate)throw Error('Active Flowroute rate required for destination');
 return {...rate,price_usd_per_minute:flowrouteCustomerRate(rate.cost_usd_per_minute)};
}
