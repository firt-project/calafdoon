export type Gender = "male" | "female";
export type Plan = "basic" | "premium" | "none";
export type LikeAction = "like" | "pass" | "shortlist";

export interface UserAccount {
  id: string;
  email: string;
  /** PBKDF2 hash (base64) — never store plaintext passwords */
  passwordHash: string;
  salt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileAnswers {
  gender?: Gender;
  age?: string;
  country?: string;
  city?: string;
  height?: string;
  weight?: string;
  languagesSpoken?: string[];
  prayerFrequency?: string;
  wearsHijab?: string;
  education?: string;
  occupation?: string;
  financialReadiness?: string;
  marriageWorkPreference?: string;
  maritalStatus?: string;
  hasChildren?: string;
  wantChildren?: string;
  hasCurrentWife?: string;
  openToSecondWife?: string;
  acceptPreviouslyMarriedMan?: string;
  acceptFutureCoWife?: string;
  substanceUse?: string;
  substanceDetails?: string;
  exercise?: string;
  marriageTimeline?: string;
  loveLanguage?: string;
  qualities?: string[];
  hobbies?: string[];
  spousePrayerImportance?: string;
  pref_partnerHijabLevel?: string;
  marrySomeoneWithChildren?: string;
  pref_minAge?: string;
  pref_maxAge?: string;
  pref_minHeight?: string;
  pref_maxHeight?: string;
  pref_minWeight?: string;
  pref_maxWeight?: string;
  pref_preferredCountries?: string[];
  pref_educationLevel?: string;
  pref_acceptChildren?: string;
  name?: string;
  phone?: string;
  about?: string;
  [key: string]: unknown;
}

export interface MemberProfile {
  userId: string;
  answers: ProfileAnswers;
  photoDataUrl?: string | null;
  questionnaireComplete: boolean;
  registrationComplete: boolean;
  plan: Plan;
  accessUnlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Seed / peer profiles used for discover & chat (not tied to local accounts). */
export interface PeerProfile {
  id: string;
  displayName: string;
  answers: ProfileAnswers;
  photoEmoji: string;
  bio: string;
}

export interface Reaction {
  fromUserId: string;
  toPeerId: string;
  action: LikeAction;
  createdAt: string;
}

export interface MatchRecord {
  id: string;
  userId: string;
  peerId: string;
  createdAt: string;
  seen: boolean;
}

export interface ChatMessage {
  id: string;
  matchId: string;
  sender: "me" | "peer";
  body: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  href?: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}

export interface SessionState {
  userId: string;
  email: string;
  createdAt: string;
}

export interface AppDataStore {
  version: 1;
  accounts: UserAccount[];
  profiles: Record<string, MemberProfile>;
  reactions: Reaction[];
  matches: MatchRecord[];
  messages: ChatMessage[];
  notifications: AppNotification[];
  contacts: ContactMessage[];
  session: SessionState | null;
}

export interface CompatibilityBreakdown {
  overall: number;
  religion: number;
  lifestyle: number;
  values: number;
  preferences: number;
}

export interface ScoredPeer {
  peer: PeerProfile;
  score: CompatibilityBreakdown;
}
