export interface Profile {
  _id: string;
  userId: string;
  name: string;
  gender: "male" | "female";
  age: number;
  height: number;
  weight: number;
  country: string;
  city: string;
  education: string;
  occupation: string;
  religiousLevel: string;
  maritalStatus: string;
  children: number;
  bio: string;
  profileImageId?: string;
  prayerFrequency?: string;
  spousePrayerImportance?: string;
  wearsHijab?: boolean;
  hasBeard?: boolean;
  smokes?: string;
  substanceDetails?: string;
  drinksAlcohol?: string;
  exercise?: string;
  wantChildren?: string;
  familyInvolvement?: string;
  livingSituation?: string;
  polygynyOpenness?: string;
  hasCurrentWife?: string;
  openToSecondWife?: string;
  acceptManWithWife?: string;
  acceptPreviouslyMarriedMan?: string;
  acceptFutureCoWife?: string;
  languagesSpoken?: string[];
  citizenshipStatus?: string;
  financialReadiness?: string;
  marriageWorkPreference?: string;
  marriageTimeline?: string;
  loveLanguage?: string;
  marrySomeoneWithChildren?: string;
  verified: boolean;
  role: "user" | "admin" | "owner";
  phone?: string;
  qualities: string[];
  hobbies: string[];
  questionnaireComplete: boolean;
  questionnaireStep?: number;
  lastSavedAt?: number;
  registrationComplete?: boolean;
  hasPaid: boolean;
  /** Waafi/EVC period end (ISO). When set and past, member must re-pay $4.99. */
  paidUntil?: string | null;
  genderLocked?: boolean;
  trialEndsAt?: number;
  isInTrial?: boolean;
  hasPersonalSupport?: boolean;
  advisorReviewed?: boolean;
  additionalImageIds?: string[];
  additionalImageUrls?: string[];
  waliName?: string;
  waliPhone?: string;
  isPremium?: boolean;
  banned: boolean;
  approved: boolean;
  reviewStatus?:
    | "incomplete"
    | "pending_review"
    | "approved"
    | "rejected"
    | "suspended";
  photoVisibility?: "everyone" | "matches" | "private";
  privateImageIds?: string[];
  locationLat?: number;
  locationLng?: number;
  locationAccuracyM?: number;
  locationVerifiedAt?: number;
  imageUrl?: string | null;
  paidCents?: number;
  email?: string | null;
}

export interface MatchResult {
  userId: string;
  name: string;
  age: number;
  country: string;
  city?: string;
  height?: number;
  education: string;
  occupation: string;
  religiousLevel: string;
  prayerFrequency?: string;
  imageUrl: string | null;
  additionalImageUrls?: string[];
  photoMediaId?: string | null;
  photoHidden?: boolean;
  photoVisibility?: "everyone" | "matches" | "private";
  score: number;
  liked?: boolean;
  shortlisted?: boolean;
  verified?: boolean;
  hasPaid?: boolean;
  hasPersonalSupport?: boolean;
  advisorReviewed?: boolean;
  questionnaireComplete?: boolean;
  bio?: string;
  maritalStatus?: string;
  marriageTimeline?: string;
  wantChildren?: string;
  highlightKeys?: string[];
  isOnline?: boolean;
  qualities?: string[];
  hobbies?: string[];
  languagesSpoken?: string[];
}

export interface ConversationPartnerProfile {
  userId: string;
  name: string;
  age?: number | null;
  gender?: "male" | "female" | string | null;
  country?: string | null;
  city?: string | null;
  height?: number | null;
  education?: string | null;
  occupation?: string | null;
  religiousLevel?: string | null;
  prayerFrequency?: string | null;
  bio?: string | null;
  maritalStatus?: string | null;
  marriageTimeline?: string | null;
  wantChildren?: string | null;
  languagesSpoken?: string[];
  qualities?: string[];
  hobbies?: string[];
  imageUrl: string | null;
  additionalImageUrls?: string[];
  photoMediaId?: string | null;
  photoHidden?: boolean;
  verified?: boolean;
  hasPaid?: boolean;
  hasPersonalSupport?: boolean;
  questionnaireComplete?: boolean;
  photoVisibility?: string | null;
  approved?: boolean;
  reviewStatus?: string;
  isOnline?: boolean;
}

export interface Conversation {
  matchId: string;
  conversationId?: string;
  chatUnlocked: boolean;
  status?: "active" | "archived" | "unmatched";
  isNew?: boolean;
  score?: number;
  profile: ConversationPartnerProfile | null;
  lastMessage: string | null;
  lastMessageAt: number;
  unreadCount: number;
}

export interface ChatMessage {
  _id: string;
  conversationId: string;
  senderId: string;
  message: string;
  imageUrl?: string | null;
  read: boolean;
  createdAt: number;
}

export interface Notification {
  _id: string;
  type: "like" | "match" | "message" | "announcement" | "approval" | "payment";
  title: string;
  body: string;
  read: boolean;
  relatedUserId?: string;
  relatedImageUrl?: string | null;
  createdAt: number;
}

export type MemberReminderId =
  | "complete-profile"
  | "complete-payment"
  | "free-trial-active"
  | "pending-approval"
  | "browse-matches";

export interface MemberReminder {
  id: MemberReminderId;
  href: string;
}

export interface AdminMoneyStats {
  basicPaidCount: number;
  basicRevenueCents: number;
  basicPriceCents: number;
  premiumSignupCount: number;
  premiumSignupRevenueCents: number;
  premiumSignupPriceCents: number;
  premiumUpgradeCount: number;
  premiumUpgradeRevenueCents: number;
  premiumUpgradePriceCents: number;
  premiumPaidCount: number;
  premiumRevenueCents: number;
  otherRevenueCents: number;
  totalPaidCount: number;
  totalRevenueCents: number;
}

export interface AdminStats {
  totalUsers: number;
  maleUsers: number;
  femaleUsers: number;
  approvedMale?: number;
  approvedFemale?: number;
  approvedTotal?: number;
  totalMatches: number;
  totalMessages: number;
  revenue: number;
  paidBasicCount: number;
  paidPremiumCount: number;
  unpaidCount: number;
  trialCount?: number;
  freeBasicWomen?: number;
  paidBasicMembers?: number;
  pendingApproval: number;
  bannedUsers: number;
  isOwner: boolean;
  money?: AdminMoneyStats;
}

export interface AdminPayment {
  _id: string;
  userId: string;
  stripeSessionId: string;
  amount: number;
  paymentType?: "registration" | "registration_premium" | "premium_upgrade" | "chat";
  registrationTier?: "basic" | "premium";
  status: "pending" | "completed" | "failed";
  gateway?: "stripe" | "waafi" | "manual";
  createdAt: number;
  userName: string;
  userEmail: string | null;
  userPhone?: string | null;
}

export interface AdminAnalytics {
  countryBreakdown: Record<string, number>;
  monthlySignups: Record<string, number>;
  genderBreakdown?: Record<string, number>;
  reviewBreakdown?: Record<string, number>;
  trialMembers?: number;
  paidMembers?: number;
  memberCount?: number;
  matchRate: number;
  conversionRate: number;
}

export interface CurrentUser {
  userId: string;
  email: string | null;
  profile: Profile | null;
}

export interface MutualMatch {
  matchId: string;
  conversationId?: string;
  score: number;
  chatUnlocked: boolean;
  status?: "active" | "archived" | "unmatched";
  isNew?: boolean;
  lastMessageAt?: number;
  profile: {
    name: string;
    age?: number;
    country?: string;
    city?: string;
    imageUrl: string | null;
    photoHidden?: boolean;
    userId: string;
    reviewStatus?: string;
    approved?: boolean;
  } | null;
}
