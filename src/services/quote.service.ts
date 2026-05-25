export type QuoteResult = {
  days: number;
  usageFee: number;
  mobileDesignFee: number;
  faviconFee: number;
  initialSetupFee: number;
  total: number;
};

export function calculateQuote(fromDate: string, toDate: string): QuoteResult {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  const ms = to.getTime() - from.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;

  const daily = Number(process.env.DAILY_USAGE_FEE ?? 100000000);
  const mobileCount = Number(process.env.MOBILE_DESIGN_COUNT ?? 2);
  const mobileUnit = Number(process.env.MOBILE_DESIGN_UNIT_FEE ?? 100000);
  const favicon = Number(process.env.FAVICON_FEE ?? 30000);
  const initial = Number(process.env.INITIAL_SETUP_FEE ?? 500000);

  const usageFee = days * daily;
  const mobileDesignFee = mobileCount * mobileUnit;
  const total = usageFee + mobileDesignFee + favicon + initial;

  return {
    days,
    usageFee,
    mobileDesignFee,
    faviconFee: favicon,
    initialSetupFee: initial,
    total,
  };
}
