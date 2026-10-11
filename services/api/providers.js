import {providerCredentials} from './providerCredentials.js';
import { parseUsdCents } from "./billing.js";

const uuid = /^[0-9a-f-]{36}$/i;
async function providerJson(url, headers) {
  const response = await fetch(url, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("Provider inventory unavailable");
  return response.json();
}

export function inventorySearch(input={}) {
  const prefix=String(input.prefix||"").trim().replace(/^\+/,"");
  const offset=Number(input.offset||0);
  if (prefix && !/^[0-9]{1,15}$/.test(prefix) || !Number.isSafeInteger(offset) || offset<0 || offset>10000)
    throw new RangeError("Use a numeric number search and an offset between 0 and 10000");
  if (input.inventoryId && (typeof input.inventoryId!=="string" || !/^[a-zA-Z0-9-]{1,128}$/.test(input.inventoryId)))
    throw new RangeError("Invalid inventory selection");
  return {prefix,offset,inventoryId:input.inventoryId};
}
export async function availableNumbers(provider, options={}) {
  const {prefix,offset,inventoryId}=inventorySearch(options);
  const stored=await providerCredentials(options.pool,options.tenant,provider);
  if(stored?.disabled)throw new Error("Provider credentials disabled");
  if (provider === "flowroute") {
    const key = stored?.accessKey||process.env.FLOWROUTE_ACCESS_KEY;
    const secret = stored?.secretKey||process.env.FLOWROUTE_SECRET_KEY;
    if (!key || !secret) throw new Error("Flowroute is not configured");
    const query=new URLSearchParams({limit:"20",offset:String(offset)});
    if (prefix) query.set("starts_with",prefix);
    const payload = await providerJson("https://api.flowroute.com/v2.1/numbers/available?"+query, {
      Authorization: "Basic " + Buffer.from(key + ":" + secret).toString("base64"),
      Accept: "application/vnd.api+json"
    });
    return (payload.data || []).map((item) => ({
      provider, number: item.attributes.value, inventoryId: item.id,
      monthlyCostCents: parseUsdCents(item.attributes.monthly_cost),
      setupCostCents: parseUsdCents(item.attributes.setup_cost)
    }));
  }
  if (provider === "didww") {
    const environment=stored?.environment||process.env.DIDWW_API_ENV;
    const key = stored?.apiKey||process.env.DIDWW_API_KEY;
    if (!key || process.env.DIDWW_ACCOUNT_CURRENCY !== "USD")
      throw new Error("DIDWW USD inventory is not configured");
    if (!["sandbox","production"].includes(environment))
      throw new Error("DIDWW environment is not configured");
    const query=new URLSearchParams({include:"did_group.stock_keeping_units","filter[did_group.needs_registration]":"false"});
    if (inventoryId) query.set("filter[id]",inventoryId);
    else if (prefix) query.set("filter[number_contains]",prefix);
    const payload = await providerJson(
      `${environment === "sandbox" ? "https://sandbox-api.didww.com" : "https://api.didww.com"}/v3/available_dids?${query}`,
      { "Api-Key": key, Accept: "application/vnd.api+json", "X-DIDWW-Api-Version":"2026-04-16" }
    );
    const included = new Map((payload.included || []).map((item) => [item.type+":"+item.id, item]));
    return (payload.data || []).flatMap((item) => {
      const groupId = item.relationships?.did_group?.data?.id;
      const group = included.get("did_groups:"+groupId);
      if (!group || (group.meta?.needs_registration || group.attributes?.needs_registration)) return [];
      const skus = group.relationships?.stock_keeping_units?.data || [];
      return skus.filter((sku) => uuid.test(sku.id)).map((sku) => {
        const price = included.get("stock_keeping_units:"+sku.id)?.attributes;
        if (!price) return null;
        return {
          provider, number: item.attributes.number, inventoryId: item.id,
          skuId: sku.id, channels: price.channels_included_count,
          monthlyCostCents: parseUsdCents(price.monthly_price),
          setupCostCents: parseUsdCents(price.setup_price)
        };
      }).filter(Boolean);
    });
  }
  throw new Error("Unknown provider");
}
