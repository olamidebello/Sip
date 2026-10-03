export function markupCents(cost, basisPoints) {
  if (!Number.isSafeInteger(cost) || cost < 0 ||
      !Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 100000)
    throw new Error("Invalid price or markup");
  return Math.ceil(cost * (10000 + basisPoints) / 10000);
}

export function parseUsdCents(value) {
  const text = String(value);
  if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(text))
    throw new Error("Invalid provider price");
  const [dollars, cents = ""] = text.split(".");
  return Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
}
