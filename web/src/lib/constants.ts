// TODO(rebrand): still to confirm before go-live —
//   PRODUCTION_SITE_URL         — your real domain (replaces web.example.com)
//   SUPPORT_EMAIL               — your real support inbox
//   PLAY_STORE_PACKAGE_ID       — your Android application id
//   WHATSAPP_* / *_PAYEE_*      — your real contact + payout details
export const APP_NAME = "Calafdoon";
/** Full brand / business name — used for Google site name & Organization schema. */
export const SITE_BRAND_NAME = "Calafdoon";
export const PRODUCTION_SITE_URL = "https://web.example.com";
export const APP_TAGLINE = "Find the one meant for you";
export const APP_DESCRIPTION =
  "Calafdoon is a Somali marriage platform where you are matched by compatibility — faith, family plans and life goals — not by swiping. Every profile is reviewed by a real person.";
export const BRAND_PINK = "#8E2438";
export const BRAND_NAVY = "#1A1214";
export const WHATSAPP_GREEN = "#25D366";
export const WHATSAPP_NUMBER = "254793692710";
export const WHATSAPP_DISPLAY = "+254 793 692710";
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;
/** Brand-domain install page (still useful for APK sideload notes). */
export const ANDROID_INSTALL_PATH = "/download";
export const ANDROID_INSTALL_URL = `${PRODUCTION_SITE_URL}${ANDROID_INSTALL_PATH}`;
/** Google Play listing — primary install CTA on the homepage. */
export const PLAY_STORE_PACKAGE_ID = "com.example.web";
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE_ID}`;
/** Legacy direct APK (optional sideload); prefer Play Store. */
export const ANDROID_APK_URL = "/download/web.apk";
export const SUPPORT_EMAIL = "support@web.example.com";
/** Manual EVC / Hormuud mobile-money payee (Somalia). */
export const EVC_PAYEE_NAME = "Axmed Xaaji";
export const EVC_PAYEE_PHONE = "+252617975403";
export const EVC_PAYEE_PHONE_DISPLAY = "+252 617 975 403";
/** Manual M-PESA payee (Kenya). */
export const MPESA_PAYEE_NAME = "Abdulkadir Mohamed Farah";
export const MPESA_PAYEE_PHONE = "+254793692710";
export const MPESA_PAYEE_PHONE_DISPLAY = "+254 793 692 710";
/** Homepage demo — how to create an account and use the site. */
export const HOW_TO_USE_YOUTUBE_ID = "ID4GXE8UFBo";
export const HOW_TO_USE_YOUTUBE_EMBED_URL = `https://www.youtube-nocookie.com/embed/${HOW_TO_USE_YOUTUBE_ID}`;
export const HOW_TO_USE_YOUTUBE_WATCH_URL = `https://www.youtube.com/watch?v=${HOW_TO_USE_YOUTUBE_ID}`;
/** Basic registration — first payment, then $1/month. */
export const REGISTRATION_PRICE = 4.99;
/** @deprecated Same as REGISTRATION_PRICE — kept for older UI imports. */
export const WOMEN_BASIC_PRICE = 4.99;
/** Monthly membership after the first payment. */
export const MONTHLY_PRICE = 1;
/** New-user Premium signup (WhatsApp + match search help). */
export const PERSONAL_SUPPORT_PRICE = 20;
/** @deprecated Free trial removed — men must pay before access. Kept for legacy UI/admin labels. */
export const TRIAL_DAYS = 7;
/** Upgrade to Premium from Basic (existing members or new Basic payers). */
export const PREMIUM_UPGRADE_PRICE = 15;

/** Display helper — $2 stays "2", $4.99 stays "4.99". */
export function formatMoney(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2);
}

/** Plan display prices for checkout copy (women Premium is always $15). */
export function planPricesForGender(gender?: string | null) {
  const isWoman = gender === "female";
  return {
    basic: REGISTRATION_PRICE,
    monthly: MONTHLY_PRICE,
    premium: isWoman ? PREMIUM_UPGRADE_PRICE : PERSONAL_SUPPORT_PRICE,
  };
}
export const MAX_PROFILE_PHOTOS = 5;
/** @deprecated Use PERSONAL_SUPPORT_PRICE */
export const WHATSAPP_CALL_PRICE = PERSONAL_SUPPORT_PRICE;
export const MIN_COMPATIBILITY_SCORE = 40;
/** Max profiles loaded on Discover (performance at scale). */
export const MATCH_DISCOVER_LIMIT = 50;
/** Max profiles per Likes list tab. */
export const MATCH_LIST_LIMIT = 100;

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

export const HEIGHTS = [
  150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200,
] as const;

export const WEIGHTS = [
  45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
] as const;

export const AGE_OPTIONS = Array.from({ length: 43 }, (_, i) => String(18 + i));
export const HEIGHT_OPTIONS = [...HEIGHTS.map((h) => String(h)), "200+"];
export const WEIGHT_OPTIONS = [...WEIGHTS.map((w) => String(w)), "100+"];

export const RELIGIOUS_LEVELS = [
  "Very Practicing",
  "Practicing",
  "Moderate",
  "Less Practicing",
] as const;

export const PRAYER_FREQUENCY = [
  "Always",
  "Most of the time",
  "Sometimes",
  "Rarely",
] as const;

export const SPOUSE_PRAYER_IMPORTANCE = [
  "Very important",
  "Preferred",
  "No preference",
] as const;

export const CHILDREN_COUNT = ["1", "2", "3", "4", "5+"] as const;

export const EDUCATION_LEVELS = [
  "High School",
  "Diploma",
  "Bachelor",
  "Master",
  "PhD",
  "Other",
] as const;

export const OCCUPATIONS = [
  "Full Time",
  "Part Time",
  "Business Owner",
] as const;

export const MARITAL_STATUS = [
  "Never married",
  "Divorced",
  "Widowed",
] as const;

export const YES_NO_DEPENDS = ["Yes", "No", "Depends"] as const;
export const YES_NO_MAYBE = ["Yes", "No", "Maybe"] as const;
export const YES_NO = ["Yes", "No"] as const;

export const FREQUENCY = ["Never", "Sometimes", "Yes"] as const;
export const EXERCISE = ["Daily", "Weekly", "Rarely", "Never"] as const;

export const MARRIAGE_TIMELINE = [
  "Within 3 months",
  "Within 6 months",
  "Within 1 year",
  "No timeline",
] as const;

export const LOVE_LANGUAGES = [
  "Words of Affirmation",
  "Acts of Service",
  "Receiving Gifts",
  "Quality Time",
] as const;

export const WANT_CHILDREN = [
  "Yes",
  "No",
  "Maybe",
  "Already have and open to more",
] as const;

/** Household arrangement after marriage. */
export const LIVING_ARRANGEMENT_MALE = [
  "Own home with my wife",
  "With my parents or family",
  "Separate home near my family",
  "Open to discuss",
] as const;

export const LIVING_ARRANGEMENT_FEMALE = [
  "Own home with my husband",
  "With my husband's family",
  "Separate home near his family",
  "Open to discuss",
] as const;

/** @deprecated Legacy values — kept for matching old profiles. */
export const LIVING_SITUATION = [
  "Same city",
  "Same country",
  "Open to abroad",
  "With family",
  "Own home",
] as const;

export const BEARD_PREFERENCE = [
  "No preference",
  "Beard preferred",
  "Beard required",
  "No beard preferred",
] as const;

export const HIJAB_LEVEL_PREFERENCE = [
  "No preference",
  "Hijab preferred",
  "Niqab preferred",
  "Hijab or niqab preferred",
] as const;

export const POLYGYNY_OPENNESS = ["Yes", "No", "Maybe"] as const;

export const LANGUAGES_SPOKEN = [
  "Somali",
  "English",
  "Arabic",
  "Swahili",
  "French",
  "Dutch",
  "Swedish",
  "Norwegian",
  "German",
  "Other",
] as const;

/** Countries where citizenship/visa status is usually not relevant. */
export const CITIZENSHIP_NOT_REQUIRED_COUNTRIES = [
  "Somalia",
  "Djibouti",
  "Ethiopia",
  "Kenya",
] as const;

export const CITIZENSHIP_STATUS = [
  "Citizen of country I live in",
  "Permanent resident",
  "Temporary visa / student / work",
  "Seeking visa / sponsorship needed",
  "Prefer not to say",
] as const;

export const FINANCIAL_READINESS = [
  "Ready to support a family",
  "We should both work",
  "Still building financially",
  "Prefer not to say",
] as const;

/** Women's work / home preference after marriage (employment step). */
export const MARRIAGE_WORK_PREFERENCE = [
  "Prefer to focus on home and family",
  "Want to continue working after marriage",
  "Open to either — depends on agreement",
  "Prefer not to say",
] as const;

export const QUALITIES = [
  "Religious",
  "Honest",
  "Kind",
  "Patient",
  "Funny",
  "Calm",
  "Romantic",
  "Loyal",
  "Hardworking",
  "Family Oriented",
  "Financially Responsible",
  "Educated",
  "Good Communication",
  "Respectful",
  "Supportive",
  "Confident",
  "Ambitious",
  "Generous",
] as const;

export const HOBBIES = [
  "Reading",
  "Cooking",
  "Travel",
  "Gym",
  "Football",
  "Technology",
  "Business",
  "Nature",
  "Gaming",
  "Photography",
  "Islamic Studies",
  "Volunteering",
  "Other",
] as const;

export { ALL_COUNTRIES as COUNTRIES } from "./countries";

export const CITIES: Record<string, string[]> = {
  Somalia: ["Mogadishu", "Hargeisa", "Kismayo", "Bosaso", "Baidoa", "Garowe"],
  Kenya: ["Nairobi", "Mombasa", "Eldoret", "Kisumu", "Nakuru"],
  Ethiopia: ["Addis Ababa", "Dire Dawa", "Hawassa", "Mekelle", "Jimma"],
  Djibouti: ["Djibouti City", "Ali Sabieh", "Tadjoura"],
  "United States": [
    "New York",
    "Los Angeles",
    "Chicago",
    "Houston",
    "Dallas",
    "Miami",
    "Seattle",
    "Boston",
    "Minneapolis",
    "Columbus",
    "San Diego",
    "Phoenix",
  ],
  "United Kingdom": [
    "London",
    "Manchester",
    "Birmingham",
    "Leeds",
    "Glasgow",
    "Edinburgh",
    "Bristol",
    "Leicester",
    "Sheffield",
    "Cardiff",
  ],
  Canada: ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa", "Edmonton", "Winnipeg"],
  Australia: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Canberra"],
  Germany: ["Berlin", "Munich", "Frankfurt", "Hamburg", "Cologne", "Stuttgart"],
  France: ["Paris", "Lyon", "Marseille", "Toulouse", "Nice", "Bordeaux"],
  Netherlands: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Eindhoven"],
  Sweden: ["Stockholm", "Gothenburg", "Malmö", "Uppsala"],
  Norway: ["Oslo", "Bergen", "Stavanger", "Trondheim"],
  Denmark: ["Copenhagen", "Aarhus", "Odense"],
  Ireland: ["Dublin", "Cork", "Galway", "Limerick"],
  "United Arab Emirates": ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Al Ain"],
  "Saudi Arabia": ["Riyadh", "Jeddah", "Mecca", "Medina", "Dammam", "Khobar"],
  Malaysia: ["Kuala Lumpur", "Penang", "Johor Bahru", "Ipoh", "Shah Alam"],
  Turkey: ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya"],
  Pakistan: ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad"],
  Egypt: ["Cairo", "Alexandria", "Giza", "Luxor"],
  Morocco: ["Casablanca", "Rabat", "Marrakech", "Fes", "Tangier"],
  Italy: ["Rome", "Milan", "Turin", "Naples", "Bologna"],
  Spain: ["Madrid", "Barcelona", "Valencia", "Seville"],
  Belgium: ["Brussels", "Antwerp", "Ghent", "Liège"],
  Finland: ["Helsinki", "Espoo", "Tampere", "Vantaa"],
  "South Africa": ["Johannesburg", "Cape Town", "Durban", "Pretoria"],
  Qatar: ["Doha", "Al Wakrah", "Al Khor"],
  Kuwait: ["Kuwait City", "Hawalli", "Salmiya"],
  Oman: ["Muscat", "Salalah", "Sohar"],
  Bahrain: ["Manama", "Riffa", "Muharraq"],
};

/** Cities available for pick-list after a country is chosen (empty = free-text city). */
export function getCitiesForCountry(country: string | undefined): string[] {
  if (!country?.trim()) return [];
  return CITIES[country] ?? [];
}

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/#success-stories", label: "Success Stories" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const;

/** Single footer menu — all site links in one list (shared source of truth). */
export const FOOTER_MENU_LINKS = [
  ...NAV_LINKS,
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
] as const;

export type AppNavIcon =
  | "LayoutDashboard"
  | "ClipboardList"
  | "Heart"
  | "MessageCircle"
  | "Sparkles"
  | "Bell";

export const FAQ_ITEMS = [
  {
    question: "Is Web halal?",
    answer:
      "Yes. Web is designed for Muslims seeking marriage in a respectful, halal manner. We prioritize privacy, family values, and Islamic principles.",
  },
  {
    question: "How does matching work?",
    answer:
      "Our compatibility algorithm analyzes religion, age, location, education, lifestyle, and personality traits to find your best matches.",
  },
  {
    question: "How much does Web cost?",
    answer:
      "New members: Basic $2 or Premium ($20 men / $15 women). Existing members keep free Basic and can upgrade to Premium for $15.",
  },
  {
    question: "How is my data protected?",
    answer:
      "We use industry-standard encryption and never share your personal data with third parties. Your privacy is our priority.",
  },
  {
    question: "Can I delete my account?",
    answer:
      "Yes, you can delete your account at any time from your profile settings. All your data will be permanently removed.",
  },
  {
    question: "What is personal support?",
    answer:
      "Premium includes confidential one-on-one guidance from trained advisors, plus help searching for your match ($20 for new Premium signup, or $15 to upgrade from Basic). After payment, message us on WhatsApp to get started.",
  },
] as const;
