export type Currency = 'EUR' | 'GBP';
export type DealType = 'cpa' | 'rev_share' | 'hybrid';
export type EventType = 'registration' | 'ftd' | 'deposit';

export type Affiliate = {
  id: string;
  dealType: DealType;
};

export type AffiliateReport = {
  affiliateId: string;
  from: string;
  to: string;
  clicks: number;
  registrations: number;
  ftds: number;
  conversionRate: number;
  commission: {
    cpa: number;
    revShare: number;
    total: number;
    currency: 'EUR';
  };
};

export type Campaign = {
  id: string;
  name: string;
  url: string;
};

export type Click = {
  click_id: string;
  affiliate_id: string;
  campaign_id: string;
  sub_id: string;
  ip: string;
  user_agent: string;
  created_at: string;
};

export type PlayerEvent = {
  transaction_id: string;
  click_id: string;
  event_type: EventType;
  player_id: string;
  amount: number | null; // null for registrations
  currency: Currency | null; // null for registrations
  created_at: string;
};

export type DailyPlayerActivity = {
  player_id: string;
  date: string;
  bets: number;
  wins: number;
  bonuses: number;
  currency: Currency;
};
