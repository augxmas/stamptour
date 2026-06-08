export type QuoteOptions = {
  reservation_use?: boolean;
  reservation_start_at?: string | Date | null;
  entry_use?: boolean;
  field_agent_use?: boolean;             // 현장요원관리 사용(프로젝트당 정액)
  survey_use?: boolean;                  // 설문조사 사용 (프로젝트당 정액)
  survey_reward_use?: boolean;           // 설문 응답자 경품 지급 — 별도 비용 없음 (플래그 전달용)
  tour_use?: boolean;                    // Tour 관리 사용 (일 단위)
  quiz_use?: boolean;                    // Quiz 관리 사용 (일 단위)
  mobile_design_use?: boolean;           // 랜딩페이지 디자인 N안 사용 (구축)
  favicon_use?: boolean;                 // 모바일앱 아이콘 사용 (구축)
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
  surveyFee: number;                     // 설문조사 비용 (사용 시 정액, 미사용=0)
  tourFee: number;                       // Tour 관리 비용 (일 단위)
  quizFee: number;                       // Quiz 관리 비용 (일 단위)
  total: number;
};

export function calculateQuote(fromDate: string, toDate: string, options?: QuoteOptions): QuoteResult {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new Error(`invalid date in calculateQuote: from=${fromDate}, to=${toDate}`);
  }
  const ms = to.getTime() - from.getTime();
  const days = Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);

  const daily = Number(process.env.DAILY_USAGE_FEE ?? 100000000);
  const tourDaily = Number(process.env.TOUR_DAILY_FEE ?? Math.floor(daily * 0.6));
  const quizDaily = Number(process.env.QUIZ_DAILY_FEE ?? Math.floor(daily * 0.4));
  const mobileCount = Number(process.env.MOBILE_DESIGN_COUNT ?? 2);
  const mobileUnit = Number(process.env.MOBILE_DESIGN_UNIT_FEE ?? 100000);
  const favicon = Number(process.env.FAVICON_FEE ?? 30000);
  const initial = Number(process.env.INITIAL_SETUP_FEE ?? 500000);
  const reservationDaily = Number(process.env.RESERVATION_DAILY_FEE ?? 10000);
  const entryDaily       = Number(process.env.ENTRY_DAILY_FEE       ?? 10000);
  const fieldAgentFlat   = Number(process.env.FIELD_AGENT_FEE       ?? 50000);
  const surveyFlat       = Number(process.env.SURVEY_FEE            ?? 50000);

  // Tour/Quiz 사용 시 각자의 일 단위 요금이 발생. 미사용 시 0
  const tourFee = options?.tour_use ? days * tourDaily : 0;
  const quizFee = options?.quiz_use ? days * quizDaily : 0;
  const usageFee = tourFee + quizFee;
  // 구축 옵션 — 미선택 시 0
  const mobileDesignFee = options?.mobile_design_use === false ? 0 : mobileCount * mobileUnit;
  const faviconFee      = options?.favicon_use === false      ? 0 : favicon;

  // 사전등록 사용일수: start_at 가 있으면 (from - start_at) 일수, 없으면 기본 10일
  let reservationDays = 0;
  if (options?.reservation_use) {
    const raw = options.reservation_start_at;
    let startAt: Date | null = null;
    if (raw instanceof Date) {
      startAt = raw;
    } else if (typeof raw === "string" && raw) {
      // MySQL DATETIME ("YYYY-MM-DD HH:MM:SS") 또는 ISO 문자열 모두 처리
      const s = raw.replace(" ", "T");
      const d = new Date(s);
      if (!isNaN(d.getTime())) startAt = d;
    }
    if (startAt && !isNaN(startAt.getTime())) {
      const diffMs = from.getTime() - startAt.getTime();
      reservationDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
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
  // 설문조사: 프로젝트당 정액
  const surveyFee     = options?.survey_use      ? surveyFlat     : 0;

  const total = usageFee + mobileDesignFee + faviconFee + initial + reservationFee + entryFee + fieldAgentFee + surveyFee;

  return {
    days,
    usageFee,
    mobileDesignFee,
    faviconFee,
    initialSetupFee: initial,
    reservationDays,
    reservationFee,
    entryDays,
    entryFee,
    fieldAgentFee,
    surveyFee,
    tourFee,
    quizFee,
    total,
  };
}
