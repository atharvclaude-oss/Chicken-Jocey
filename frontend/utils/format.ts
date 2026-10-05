const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const formatPrice = (cents: number) => usd.format(cents / 100);

/** Rounded price for room totals and "from" labels, e.g. "$427". */
export const formatPriceWhole = (cents: number) => usdWhole.format(Math.round(cents / 100));

export const pluralize = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
