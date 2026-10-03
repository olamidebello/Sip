import { parseUsdCents } from "./billing.js";

const uuid = /^[0-9a-f-]{36}$/i;
async function providerJson(url, headers) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("Provider inventory unavailable");
  return response.json();
}

export async function availableNumbers(provider) {
  if (provider === "flowroute") {
    const key = process.env.FLOWROUTE_ACCESS_KEY;
    const secret = process.env.FLOWROUTE_SECRET_KEY;
    if (!key || !secret) throw new Error("Flowroute is not configured");
    const payload = await providerJson("https://api.flowroute.com/v2.1/numbers/available?limit=20", {
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
    const key = process.env.DIDWW_API_KEY;
    if (!key || process.env.DIDWW_ACCOUNT_CURRENCY !== "USD")
      throw new Error("DIDWW USD inventory is not configured");
    const payload = await providerJson(
      "https://api.didww.com/v3/available_dids?include=did_group.stock_keeping_units&page[size]=20",
      { "Api-Key": key, Accept: "application/vnd.api+json" }
    );
    const included = new Map((payload.included || []).map((item) => [item.id, item]));
    return (payload.data || []).flatMap((item) => {
      const groupId = item.relationships?.did_group?.data?.id;
      const group = included.get(groupId);
      if (!group || group.meta?.needs_registration) return [];
      const skus = group.relationships?.stock_keeping_units?.data || [];
      return skus.filter((sku) => uuid.test(sku.id)).map((sku) => {
        const price = included.get(sku.id)?.attributes;
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
