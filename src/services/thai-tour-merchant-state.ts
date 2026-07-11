export type TourMerchantApprovalStatus = "requested" | "approval_sent" | "approved" | "rejected";

export type TourMerchantRequestState = {
  merchant_id: number;
  commission_rate: number | null;
  approval_status: TourMerchantApprovalStatus;
  token?: string;
  requested_at: string;
  approval_sent_at?: string;
  approved_at?: string;
  rejected_at?: string;
};

const thaiTourMerchantRequests = new Map<number, Map<number, TourMerchantRequestState>>();
const thaiTourMerchantApprovalTokens = new Map<string, { projectId: number; merchantId: number }>();

export function getThaiTourMerchantState(projectId: number): Map<number, TourMerchantRequestState> {
  let map = thaiTourMerchantRequests.get(projectId);
  if (!map) {
    map = new Map<number, TourMerchantRequestState>();
    thaiTourMerchantRequests.set(projectId, map);
  }
  return map;
}

export function getThaiTourMerchantProjectsFor(merchantId: number): Array<{ projectId: number; state: TourMerchantRequestState }> {
  const rows: Array<{ projectId: number; state: TourMerchantRequestState }> = [];
  for (const [projectId, map] of thaiTourMerchantRequests.entries()) {
    const state = map.get(merchantId);
    if (state && ["requested", "approval_sent", "approved", "rejected"].includes(state.approval_status)) {
      rows.push({ projectId, state });
    }
  }
  return rows;
}

export function setThaiTourMerchantApprovalToken(token: string, ref: { projectId: number; merchantId: number }): void {
  thaiTourMerchantApprovalTokens.set(token, ref);
}

export function getThaiTourMerchantApprovalToken(token: string): { projectId: number; merchantId: number } | undefined {
  return thaiTourMerchantApprovalTokens.get(token);
}
