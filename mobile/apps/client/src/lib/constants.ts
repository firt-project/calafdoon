export const APP_NAME = "HelCalaf";
/** Full brand / business name shown in the app. */
export const SITE_BRAND_NAME = "HelCalaf";
export const APP_ID = "com.helcalaf.app";
export const PRODUCTION_SITE_URL = "https://www.helcalafkaaga.com";
export const APP_TAGLINE = "Find Your Perfect Match";
export const APP_DESCRIPTION =
  "We connect serious men and women for marriage based on Islamic values, trust, and respect.";
export const BRAND_PINK = "#A61B2B";
export const BRAND_NAVY = "#1A1214";
/** Support contact — in-app email only (no promotional WhatsApp / social CTAs). */
export const SUPPORT_EMAIL = "support@helcalafkaaga.com";
/** Manual EVC / Hormuud mobile-money payee (Somalia). */
export const EVC_PAYEE_NAME = "Axmed Xaaji";
export const EVC_PAYEE_PHONE = "+252617975403";
export const EVC_PAYEE_PHONE_DISPLAY = "+252 617 975 403";
/** Manual M-PESA payee (Kenya). */
export const MPESA_PAYEE_NAME = "Abdulkadir Mohamed Farah";
export const MPESA_PAYEE_PHONE = "+254793692710";
export const MPESA_PAYEE_PHONE_DISPLAY = "+254 793 692 710";
/** Basic registration — first payment, then $1/month (Stripe). */
export const REGISTRATION_PRICE = 4.99;
/** @deprecated Same as REGISTRATION_PRICE — kept for older UI imports. */
export const WOMEN_BASIC_PRICE = 4.99;
/** Monthly membership after the first Stripe payment. */
export const MONTHLY_PRICE = 1;
/** New-user Premium signup (personal match support). */
export const PERSONAL_SUPPORT_PRICE = 20;
/** @deprecated Free trial removed — men must pay before access. Kept for legacy UI/admin labels. */
export const TRIAL_DAYS = 7;
/** Upgrade to Premium from Basic (existing members or new Basic payers). */
export const PREMIUM_UPGRADE_PRICE = 15;
/** Waafi/EVC membership length before $4.99 renewal is required. */
export const WAAFI_ACCESS_DAYS = 30;

/** Display helper — $2 stays "2", $4.99 stays "4.99". */
export function formatMoney(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2);
}

/** Plan display prices for checkout copy (women Premium is always $15). */
export function planPricesForGender(gender?: string | null) {
  const isWoman = gender === "female";
  return {
    basic: REGISTRATION_PRICE,
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

