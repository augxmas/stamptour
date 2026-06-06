export type QuoteOptions = {
  reservation_use?: boolean;
  reservation_start_at?: string | null;
  entry_use?: boolean;
  field_agent_use?: boolean;             // 현장요원관리 사용(프로젝트당 정액)
};

export type QuoteResult = {
  days: number;
  usageFee: number;
  mobileDesignFee: number;
  faviconFee: number;
  initialSetupFee: number;
  reservationDays: number;
  reservationFee: number;
  entryDays: number;
  entryFee: number;
  fieldAgentFee: number;                 // 현장요원관리 비용 (사용 시 정액, 미사용=0)
  total: number;
};

export function calculateQuote(fromDate: string, toDate: string, options?: QuoteOptions): QuoteResult {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  const ms = to.getTime() - from.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;

  const daily = Number(process.env.DAILY_USAGE_FEE ?? 100000000);
  const mobileCount = Number(process.env.MOBILE_DESIGN_COUNT ?? 2);
  const mobileUnit = Number(process.env.MOBILE_DESIGN_UNIT_FEE ?? 100000);
  const favicon = Number(process.env.FAVICON_FEE ?? 30000);
  const initial = Number(process.env.INITIAL_SETUP_FEE ?? 500000);
  const reservationDaily = Number(process.env.RESERVATION_DAILY_FEE ?? 10000);
  const entryDaily       = Number(process.env.ENTRY_DAILY_FEE       ?? 10000);
  const fieldAgentFlat   = Number(process.env.FIELD_AGENT_FEE       ?? 50000);

  const usageFee = days * daily;
  const mobileDesignFee = mobileCount * mobileUnit;

  // 사전등록 사용일수: start_at 가 있으면 (from - start_at) 일수, 없으면 기본 10일
  let reservationDays = 0;
  if (options?.reservation_use) {
    if (options.reservation_start_at) {
      const startAt = new Date(String(options.reservation_start_at).replace(" ", "T"));
      if (!isNaN(startAt.getTime())) {
        const diffMs = from.getTime() - startAt.getTime();
        reservationDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      } else {
        reservationDays = 10;
      }
    } else {
      reservationDays = 10;
    }
  }
  const reservationFee = reservationDays * reservationDaily;

  // 현장등록 사용일수: 프로젝트 기간 동일
  const entryDays = options?.entry_use ? days : 0;
  const entryFee  = entryDays * entryDaily;

  // 현장요원관리: 프로젝트당 정액
  const fieldAgentFee = options?.field_agent_use ? fieldAgentFlat : 0;

  const total = usageFee + mobileDesignFee + favicon + initial + reservationFee + entryFee + fieldAgentFee;

  return {
    days,
    usageFee,
    mobileDesignFee,
    faviconFee: favicon,
    initialSetupFee: initial,
    reservationDays,
    reservationFee,
    entryDays,
    entryFee,
    fieldAgentFee,
    total,
  };
}
