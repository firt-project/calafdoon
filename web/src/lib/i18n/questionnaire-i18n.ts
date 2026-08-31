"use client";

import { useCallback } from "react";
import { useTranslation } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/translations";

type Bilingual = { en: string; so: string };

/** Step titles and descriptions keyed by StepConfig.id. */
const STEP_TEXT: Record<number, { title: Bilingual; description: Bilingual }> = {
  0: {
    title: { en: "About you", so: "Wax kugu saabsan" },
    description: {
      en: "Who is looking for a spouse?",
      so: "Yaa lamaanahaaga raadinaya?",
    },
  },
  1: {
    title: { en: "Basic Information", so: "Macluumaadka Aasaasiga ah" },
    description: { en: "Tell us about yourself", so: "Noo sheeg wax kugu saabsan" },
  },
  2: {
    title: { en: "Your Religious Practice", so: "Dhaqankaaga Diineed" },
    description: { en: "Your own religious habits", so: "Caadooyinkaaga diineed" },
  },
  3: {
    title: { en: "Education", so: "Waxbarasho" },
    description: { en: "Your educational background", so: "Asalkaaga waxbarasho" },
  },
  4: {
    title: { en: "Employment", so: "Shaqo" },
    description: { en: "Your work situation", so: "Xaaladdaada shaqo" },
  },
  5: {
    title: { en: "Marriage & Family", so: "Guur & Qoys" },
    description: {
      en: "Your marriage history and family",
      so: "Taariikhdaada guur iyo qoyska",
    },
  },
  6: {
    title: { en: "Lifestyle", so: "Qaab-nololeed" },
    description: { en: "Your daily habits", so: "Caadooyinkaaga maalinlaha ah" },
  },
  7: {
    title: { en: "About You", so: "Wax Kugu Saabsan" },
    description: {
      en: "Your plans, personality, and interests",
      so: "Qorshayaashaada, shakhsiyaddaada, iyo xiisayaashaada",
    },
  },
  8: {
    title: { en: "Partner Preferences", so: "Doorbidyada Lammaanaha" },
    description: {
      en: "What you are looking for in a spouse",
      so: "Waxa aad ka doonayso lamaanahaaga",
    },
  },
  9: {
    title: { en: "Profile Photo", so: "Sawirka Profile-ka" },
    description: {
      en: "Upload a clear photo — matches will see this on your profile",
      so: "Soo geli sawir cad — kuwa ku habboon ayaa ku arki doona profile-kaaga",
    },
  },
};

/** Why each answer helps matching — keyed by FieldConfig.name. */
const FIELD_WHY: Record<string, Bilingual> = {
  age: {
    en: "Helps us suggest partners in a realistic age range for marriage.",
    so: "Waxay naga caawisaa inaannu soo jeedinno lammaane da'doodu ku habboon tahay guurka.",
  },
  country: {
    en: "Location matters for meeting families and planning a shared life.",
    so: "Goobtu waa muhiim marka qoysaska la kulmayo iyo qorsheynta nolosha wadaagga.",
  },
  city: {
    en: "City helps members understand proximity and lifestyle context.",
    so: "Magaaladu waxay ka caawisaa xubnaha inay fahmaan u dhawaanshaha iyo qaab-nololeedka.",
  },
  prayerFrequency: {
    en: "Faith practice is one of the strongest signals for a compatible marriage.",
    so: "Cibaadadu waa mid ka mid ah calaamadaha ugu xooggan ee guur iswaafajin leh.",
  },
  wearsHijab: {
    en: "Helps match expectations around religious practice and modesty.",
    so: "Waxay caawisaa iswaafajinta rajooyinka ku saabsan cibaadada iyo xishoodka.",
  },
  hasBeard: {
    en: "A simple preference signal some members care about in a spouse.",
    so: "Calaamad doorbid ah oo xubnaha qaar ay ka daneynayaan lammaanaha.",
  },
  education: {
    en: "Education often shapes values, conversation, and life goals.",
    so: "Waxbarashadu waxay inta badan qaabaysaa qiyamka, wadahadalka, iyo himilooyinka nolosha.",
  },
  occupation: {
    en: "Shows readiness and lifestyle for building a household together.",
    so: "Waxay muujinaysaa diyaargarowga iyo qaab-nololeedka dhisidda qoys.",
  },
  maritalStatus: {
    en: "Honesty here protects everyone and sets clear expectations.",
    so: "Daacadnimadu halkan waxay ilaalinaysaa qof kasta oo waxay dejinaysaa rajooyin cad.",
  },
  marriageTimeline: {
    en: "Aligning on when you want to marry reduces mismatched expectations.",
    so: "Iswaafajinta goorta aad rabto inaad guursato waxay yareynaysaa rajooyin khaldan.",
  },
  wantChildren: {
    en: "Family plans are central to a lasting marriage conversation.",
    so: "Qorshayaasha qoysku waa udub-dhexaadka wadahadalka guurka waara.",
  },
  minAge: {
    en: "Choose the preferred age you are looking for.",
    so: "Dooro da'da aad rabtid.",
  },
  maxAge: {
    en: "Sets the age window you are open to considering.",
    so: "Waxay dejinaysaa da'da aad diyaar u tahay inaad tixgeliso.",
  },
  minHeight: {
    en: "Choose the preferred height you are looking for.",
    so: "Dooro dhererka aad rabtid.",
  },
  minWeight: {
    en: "Choose the preferred weight you are looking for.",
    so: "Dooro miisaanka aad rabtid.",
  },
  preferredCountries: {
    en: "Narrows discover to places you are willing to connect with.",
    so: "Waxay ku xaddidaysaa raadinta meelaha aad diyaar u tahay inaad kula xiriirto.",
  },
  partnerHijabLevel: {
    en: "Matches your preference for a spouse’s religious presentation.",
    so: "Waxay iswaafajinaysaa doorbidkaaga muuqaalka diineed ee lammaanaha.",
  },
  bio: {
    en: "A short introduction helps serious members start a respectful conversation.",
    so: "Hordhac gaaban ayaa ka caawiya xubnaha dhabta ah inay bilaabaan wadahadal ixtiraam leh.",
  },
};

/** Question labels keyed by FieldConfig.name. */
const FIELD_LABELS: Record<string, Bilingual> = {
  gender: { en: "I am a", so: "Waxaan ahay" },
  name: { en: "Full name", so: "Magaca oo buuxa" },
  phone: { en: "Phone number", so: "Lambarka taleefanka" },
  age: { en: "Age", so: "Da'da" },
  country: { en: "Country", so: "Dalka" },
  city: { en: "City", so: "Magaalada" },
  height: { en: "Height (cm)", so: "Dhererka (sm)" },
  weight: { en: "Weight (kg)", so: "Miisaanka (kg)" },
  prayerFrequency: {
    en: "Do you perform the five daily prayers?",
    so: "Ma tukataa shanta salaadood ee maalinlaha ah?",
  },
  wearsHijab: { en: "Do you wear hijab?", so: "Ma xijaabataa?" },
  hasBeard: { en: "Do you have a beard?", so: "Ma leedahay gad?" },
  education: { en: "Education Level", so: "Heerka Waxbarasho" },
  occupation: { en: "Employment Status", so: "Xaaladda Shaqo" },
  maritalStatus: { en: "What is your marital status?", so: "Xaaladdaada guurku maxay tahay?" },
  hasChildren: {
    en: "Do you have children from a previous marriage?",
    so: "Ma leedahay carruur guur hore ka timid?",
  },
  substanceUse: {
    en: "Do you use any substances (smoking, drugs, etc.)?",
    so: "Ma isticmaashaa waxyaabo (sigaar, daroogo, iwm.)?",
  },
  substanceDetails: {
    en: "Please describe what you use",
    so: "Fadlan sheeg waxa aad isticmaasho",
  },
  exercise: {
    en: "How often do you exercise?",
    so: "Immisa jeer ayaad jimicsi samaysaa?",
  },
  marriageTimeline: { en: "Marriage Timeline", so: "Wakhtiga Guurka" },
  loveLanguage: {
    en: "What is your love language?",
    so: "Waa maxay luuqadda jacaylkaaga?",
  },
  bio: {
    en: "Tell us about yourself (max 500 characters)",
    so: "Noo sheeg wax kugu saabsan (ugu badnaan 500 xaraf)",
  },
  qualities: {
    en: "Choose up to 10 qualities that describe you",
    so: "Dooro ilaa 10 sifo oo ku qeexaya",
  },
  hobbies: { en: "Choose your hobbies", so: "Dooro hiwaayadahaaga" },
  wantChildren: {
    en: "Do you want children?",
    so: "Ma doonaysaa carruur?",
  },
  livingSituation: {
    en: "Preferred living situation after marriage?",
    so: "Habka nololeed ee aad doorbidayso guurka ka dib?",
  },
  livingSituation_male: {
    en: "After marriage, where do you plan for your wife to live?",
    so: "Guurka ka dib, xaggee ayaad qorshaynaysaa in lamaanahaagu ku noolaado?",
  },
  livingSituation_female: {
    en: "After marriage, where would you prefer to live?",
    so: "Guurka ka dib, xaggee ayaad doorbidaysaa inaad ku noolaato?",
  },
  polygynyOpenness: {
    en: "Are you open to polygyny / a second marriage?",
    so: "Ma u furan tahay guur labaad / laba lamaanahaaga?",
  },
  hasCurrentWife: {
    en: "Do you currently have a wife?",
    so: "Hadda ma leedahay lamaanahaaga?",
  },
  openToSecondWife: {
    en: "Do you plan to marry another wife in the future?",
    so: "Mustaqbalka ma qorshaynaysaa inaad guursato lamaanahaaga kale?",
  },
  acceptManWithWife: {
    en: "Would you marry a man who already has a wife?",
    so: "Ma guursan lahayd nin horay guur usoo maray?",
  },
  acceptPreviouslyMarriedMan: {
    en: "Would you accept a man who was previously married?",
    so: "Ma aqbalaysaa nin horay guur usoo maray?",
  },
  acceptFutureCoWife: {
    en: "Would you accept if your husband marries another wife later?",
    so: "Ma aqbalaysaa in ninkaagu mustaqbalka guursado lamaanahaaga kale?",
  },
  languagesSpoken: {
    en: "Languages you speak",
    so: "Luuqadaha aad ku hadasho",
  },
  citizenshipStatus: {
    en: "Citizenship / visa situation",
    so: "Xaaladda jinsiyadda / fiisaha",
  },
  financialReadiness: {
    en: "Financial readiness for marriage",
    so: "Diyaargarowga dhaqaale ee guurka",
  },
  marriageWorkPreference: {
    en: "After marriage, what is your preference?",
    so: "Guurka kadib, maxaad door bidaysaa?",
  },
  pref_partnerBeard: {
    en: "Beard preference for your spouse",
    so: "Doorbidka gadka ee lamaanahaaga",
  },
  pref_partnerHijabLevel: {
    en: "Hijab / niqab preference for your spouse",
    so: "Doorbidka xijaab / niqaab ee lamaanahaaga",
  },
  spousePrayerImportance: {
    en: "How important is it that your spouse prays regularly?",
    so: "Intee ayay muhiim u tahay in lamaanahaagu si joogto ah u tukado?",
  },
  marrySomeoneWithChildren: {
    en: "Would you marry someone with children?",
    so: "Ma guursan lahayd qof carruur leh?",
  },
  pref_minAge: { en: "Preferred Age", so: "Da'da aad rabtid" },
  pref_maxAge: { en: "Preferred Max Age", so: "Da'da ugu Badan ee aad rabtid" },
  pref_minHeight: {
    en: "Preferred Height",
    so: "Dhererka aad rabtid",
  },
  pref_minWeight: {
    en: "Preferred Weight (kg)",
    so: "Miisaanka aad rabtid (kg)",
  },
  pref_maxHeight: {
    en: "Preferred Max Height",
    so: "Dhererka ugu Dheer ee aad rabtid",
  },
  pref_preferredCountries: {
    en: "Preferred Countries",
    so: "Dalalka aad rabtid",
  },
  pref_educationLevel: {
    en: "Preferred Education",
    so: "Waxbarashada aad rabtid",
  },
  pref_acceptDivorcee: {
    en: "Accept someone who is divorced?",
    so: "Ma aqbali lahayd qof la furay?",
  },
  pref_acceptWidow: {
    en: "Accept someone who is widowed?",
    so: "Ma aqbali lahayd qof carmal ah?",
  },
  pref_acceptChildren: {
    en: "Accept someone with children?",
    so: "Ma aqbali lahayd qof carruur leh?",
  },
};

/** Option value translations keyed by the stored English value. */
const OPTION_LABELS: Record<string, Bilingual> = {
  // Religious levels
  "Very Practicing": { en: "Very Practicing", so: "Aad u Diinsan" },
  Practicing: { en: "Practicing", so: "Diinsan" },
  Moderate: { en: "Moderate", so: "Dhexdhexaad" },
  "Less Practicing": { en: "Less Practicing", so: "Wax yar Diinsan" },
  // Prayer frequency
  Always: { en: "Always", so: "Had iyo jeer" },
  "Most of the time": { en: "Most of the time", so: "Inta badan" },
  Sometimes: { en: "Sometimes", so: "Marmar" },
  Rarely: { en: "Rarely", so: "Dhif iyo naadir" },
  // Spouse prayer importance
  "Very important": { en: "Very important", so: "Aad muhiim u ah" },
  Preferred: { en: "Preferred", so: "Aad rabtid" },
  "No preference": { en: "No preference", so: "Doorbid ma jiro" },
  // Education levels
  "High School": { en: "High School", so: "Dugsi Sare" },
  Diploma: { en: "Diploma", so: "Diploma" },
  Bachelor: { en: "Bachelor", so: "Shahaadada Koowaad" },
  Master: { en: "Master", so: "Master" },
  PhD: { en: "PhD", so: "PhD (Dhakhtarnimo)" },
  Other: { en: "Other", so: "Kale" },
  // Occupation
  "Full Time": { en: "Full Time", so: "Wakhti Buuxa" },
  "Part Time": { en: "Part Time", so: "Wakhti Qayb ah" },
  "Business Owner": { en: "Business Owner", so: "Milkiile Ganacsi" },
  Student: { en: "Student", so: "Arday" },
  Unemployed: { en: "Unemployed", so: "Shaqo la'aan" },
  Retired: { en: "Retired", so: "Hawlgab" },
  // Marital status
  "Never married": { en: "Single (never married)", so: "Aan guursan (weligay)" },
  Divorced: { en: "Divorced", so: "La furay" },
  Widowed: { en: "Widowed", so: "Carmal" },
  // Yes/No family
  Yes: { en: "Yes", so: "Haa" },
  No: { en: "No", so: "Maya" },
  Male: { en: "Male", so: "Nin" },
  Female: { en: "Female", so: "Naag" },
  Depends: { en: "Depends", so: "Way ku xiran tahay" },
  Maybe: { en: "Maybe", so: "Waa suurtogal" },
  // Frequency
  Never: { en: "Never", so: "Marnaba" },
  // Exercise
  Daily: { en: "Daily", so: "Maalin kasta" },
  Weekly: { en: "Weekly", so: "Toddobaadle" },
  // Marriage timeline
  Immediately: { en: "Immediately", so: "Isla markiiba" },
  "Within 3 months": { en: "Within 3 months", so: "Muddo 3 bilood gudahood" },
  "Within 6 months": { en: "Within 6 months", so: "Muddo 6 bilood gudahood" },
  "Within 1 year": { en: "Within 1 year", so: "Muddo 1 sano gudaheed" },
  "No timeline": { en: "No timeline", so: "Wakhti go'an ma jiro" },
  // Love languages
  "Words of Affirmation": {
    en: "Words of Affirmation",
    so: "Erayo dhiiri galin iyo amaan",
  },
  "Acts of Service": { en: "Acts of Service", so: "Ficil naxariis ah" },
  "Receiving Gifts": { en: "Receiving Gifts", so: "Hadiyadaha" },
  "Quality Time": { en: "Quality Time", so: "Waqtiga" },
  // Want children
  "Already have and open to more": {
    en: "Already have and open to more",
    so: "Horaan u leeyahay oo waan u furanahay in badan",
  },
  // Family involvement
  Somewhat: { en: "Somewhat", so: "Wax yar" },
  // Living situation
  "Same city": { en: "Same city", so: "Isla magaalada" },
  "Same country": { en: "Same country", so: "Isla dalka" },
  "Open to abroad": { en: "Open to abroad", so: "U furan dibadda" },
  "With family": { en: "With family", so: "Lala noolaado qoyska" },
  "Own home": { en: "Own home", so: "Gurigeyga gaarka ah" },
  "Own home with my wife": {
    en: "Own home with my wife (separate from family)",
    so: "Guri gaar ah aniga iyo lamaanahayga (ka go'an qoyska)",
  },
  "Own home with my husband": {
    en: "Own home with my husband (separate from in-laws)",
    so: "Guri gaar ah aniga iyo ninkayga (ka go'an qoyska)",
  },
  "With my parents or family": {
    en: "With my parents or family",
    so: "Waalidkayga ama qoyskeyga la joogo",
  },
  "With my husband's family": {
    en: "With my husband's family",
    so: "Qoyska ninkayga la joogo",
  },
  "Separate home near my family": {
    en: "Separate home, but near my family",
    so: "Guri gooni ah, laakiin u dhow qoyskeyga",
  },
  "Separate home near his family": {
    en: "Separate home, but near his family",
    so: "Guri gooni ah, laakiin u dhow qoyskiisa",
  },
  "Open to discuss": {
    en: "Open to discuss together",
    so: "Waan ka wada hadli karnaa",
  },
  "Prefer not to say": { en: "Prefer not to say", so: "Ma doonayo inaan sheego" },
  // Beard / hijab preferences
  "Beard preferred": { en: "Beard preferred", so: "Gad aad rabtid" },
  "Beard required": { en: "Beard required", so: "Gad waa loo baahan yahay" },
  "No beard preferred": { en: "No beard preferred", so: "Gad la'aan aad rabtid" },
  "Hijab preferred": { en: "Hijab preferred", so: "Xijaab aad rabtid" },
  "Niqab preferred": { en: "Niqab preferred", so: "Niqaab aad rabtid" },
  "Hijab or niqab preferred": {
    en: "Hijab or niqab preferred",
    so: "Xijaab ama niqaab aad rabtid",
  },
  // Languages
  Somali: { en: "Somali", so: "Soomaali" },
  English: { en: "English", so: "Ingiriisi" },
  Arabic: { en: "Arabic", so: "Carabi" },
  Swahili: { en: "Swahili", so: "Sawaaxiili" },
  French: { en: "French", so: "Faransiis" },
  Dutch: { en: "Dutch", so: "Holandiis" },
  Swedish: { en: "Swedish", so: "Iswiidhan" },
  Norwegian: { en: "Norwegian", so: "Noorweej" },
  German: { en: "German", so: "Jarmal" },
  // Citizenship
  "Citizen of country I live in": {
    en: "Citizen of country I live in",
    so: "Muwaadin dalka aan ku noolahay",
  },
  "Permanent resident": { en: "Permanent resident", so: "Degganaan joogto ah" },
  "Temporary visa / student / work": {
    en: "Temporary visa / student / work",
    so: "Fiiso ku meel gaar ah / arday / shaqo",
  },
  "Seeking visa / sponsorship needed": {
    en: "Seeking visa / sponsorship needed",
    so: "Fiiso raadinta / taageero ayaa loo baahan yahay",
  },
  // Financial
  "Ready to support a family": {
    en: "Ready to support a family",
    so: "Diyaar u ah inaan qoys quudiyo",
  },
  "We should both work": {
    en: "We should both work",
    so: "Labadeenaba waa inaan shaqaynaa",
  },
  "Still building financially": {
    en: "Still building financially",
    so: "Weli dhaqaale ahaan waan dhismayaa",
  },
  "Prefer to focus on home and family": {
    en: "Prefer to focus on home and family",
    so: "Waxaan door bidayaa inaan guriga iyo qoyska diiradda saaro",
  },
  "Want to continue working after marriage": {
    en: "Want to continue working after marriage",
    so: "In aan shaqaysto",
  },
  "Open to either — depends on agreement": {
    en: "Open to either — depends on agreement",
    so: "Waxay ku xirantahay heshiis",
  },
  // Qualities
  Religious: { en: "Religious", so: "Diinsan" },
  Honest: { en: "Honest", so: "Daacad" },
  Kind: { en: "Kind", so: "Naxariis leh" },
  Patient: { en: "Patient", so: "Dulqaad leh" },
  Funny: { en: "Funny", so: "Kaftan leh" },
  Calm: { en: "Calm", so: "Deggan" },
  Romantic: { en: "Romantic", so: "Jacayl leh" },
  Loyal: { en: "Loyal", so: "Aamin" },
  Hardworking: { en: "Hardworking", so: "Shaqayste" },
  "Family Oriented": { en: "Family Oriented", so: "Qoys jecel" },
  "Financially Responsible": {
    en: "Financially Responsible",
    so: "Mas'uul dhaqaale ahaan",
  },
  Educated: { en: "Educated", so: "Wax barte" },
  "Good Communication": { en: "Good Communication", so: "Isgaarsiin wanaagsan" },
  Respectful: { en: "Respectful", so: "Ixtiraam leh" },
  Supportive: { en: "Supportive", so: "Taageero badan" },
  Confident: { en: "Confident", so: "Kalsooni leh" },
  Ambitious: { en: "Ambitious", so: "Hammi leh" },
  Generous: { en: "Generous", so: "Deeqsi" },
  // Hobbies
  Reading: { en: "Reading", so: "Akhris" },
  Cooking: { en: "Cooking", so: "Karin" },
  Travel: { en: "Travel", so: "Safar" },
  Gym: { en: "Gym", so: "Jimicsi" },
  Football: { en: "Football", so: "Kubadda Cagta" },
  Technology: { en: "Technology", so: "Tignoolajiyada" },
  Business: { en: "Business", so: "Ganacsi" },
  Nature: { en: "Nature", so: "Dabeecadda" },
  Gaming: { en: "Gaming", so: "Ciyaaraha" },
  Photography: { en: "Photography", so: "Sawir qaadis" },
  "Islamic Studies": { en: "Islamic Studies", so: "Cilmiga Islaamka" },
  Volunteering: { en: "Volunteering", so: "Iskaa wax u qabso" },
};

/** Review-screen section titles and row labels. */
const REVIEW_LABELS: Record<string, Bilingual> = {
  // Section titles
  "Basic Information": { en: "Basic Information", so: "Macluumaadka Aasaasiga ah" },
  Gender: { en: "Gender", so: "Jinsiga" },
  "Your Religious Practice": { en: "Your Religious Practice", so: "Dhaqankaaga Diineed" },
  "Education & Work": { en: "Education & Work", so: "Waxbarasho & Shaqo" },
  Employment: { en: "Employment", so: "Shaqo" },
  "Your contact details": { en: "Contact details", so: "Macluumaadka xiriirka" },
  "Marriage & Family": { en: "Marriage & Family", so: "Guur & Qoys" },
  Lifestyle: { en: "Lifestyle", so: "Qaab-nololeed" },
  "About You": { en: "About You", so: "Wax Kugu Saabsan" },
  "Partner Preferences": { en: "Partner Preferences", so: "Doorbidyada Lammaanaha" },
  "Profile Photo": { en: "Profile Photo", so: "Sawirka Profile-ka" },
  // Row labels
  Age: { en: "Age", so: "Da'da" },
  Country: { en: "Country", so: "Dalka" },
  City: { en: "City", so: "Magaalada" },
  Height: { en: "Height", so: "Dhererka" },
  Weight: { en: "Weight", so: "Miisaanka" },
  "Full name": { en: "Full name", so: "Magaca oo buuxa" },
  "Phone number": { en: "Phone number", so: "Lambarka telefoonka" },
  "Prayer Frequency": { en: "Prayer Frequency", so: "Salaadda" },
  "Wears Hijab": { en: "Wears Hijab", so: "Xijaab" },
  "Has Beard": { en: "Has Beard", so: "Gad" },
  Education: { en: "Education", so: "Waxbarasho" },
  Occupation: { en: "Occupation", so: "Shaqo" },
  "Marital Status": { en: "Marital Status", so: "Xaaladda Guur" },
  Children: { en: "Children", so: "Carruur" },
  Smokes: { en: "Smokes", so: "Sigaar" },
  Exercise: { en: "Exercise", so: "Jimicsi" },
  "Marriage Timeline": { en: "Marriage Timeline", so: "Wakhtiga Guurka" },
  "Love Language": { en: "Love Language", so: "Luuqadda Jacaylka" },
  "Want Children": { en: "Want Children", so: "Rabitaanka Carruur" },
  "Living Situation": { en: "Living Situation", so: "Xaaladda Nololeed" },
  Madhhab: { en: "Madhhab", so: "Madhhab" },
  "Polygyny Openness": { en: "Polygyny Openness", so: "Furfurnaanta Guur Labaad" },
  "Co-Wife Acceptance": { en: "Co-Wife Acceptance", so: "Aqbalaadda Garoobnimada" },
  "Current Wife": { en: "Currently Has a Wife", so: "Hadda Lamaanahaaga leh" },
  "Open to Second Wife": { en: "Plans Another Wife", so: "Qorshaha Lamaanahaaga kale" },
  "Accept Man With Wife": { en: "Accepts Married Man", so: "Aqbala Ninka Lamaanahaaga leh" },
  "Accept Future Co-Wife": { en: "Accepts Future Co-Wife", so: "Aqbala Garoob Mustaqbal" },
  "Work Preference After Marriage": {
    en: "Work Preference After Marriage",
    so: "Doorbidka Shaqada Guurka Kadib",
  },
  Languages: { en: "Languages", so: "Luuqadaha" },
  "Citizenship / Visa": { en: "Citizenship / Visa", so: "Jinsiyad / Fiiso" },
  "Financial Readiness": { en: "Financial Readiness", so: "Diyaargarowga Dhaqaale" },
  "Deal-breakers": { en: "Deal-breakers", so: "Waxyaabaha Diidmada" },
  "Partner Beard": { en: "Partner Beard", so: "Gadka Lammaanaha" },
  "Partner Hijab / Niqab": { en: "Partner Hijab / Niqab", so: "Xijaab / Niqaab Lammaanaha" },
  Bio: { en: "Bio", so: "Faahfaahin" },
  Qualities: { en: "Qualities", so: "Sifooyin" },
  Hobbies: { en: "Hobbies", so: "Hiwaayado" },
  "Spouse Prayer Importance": {
    en: "Spouse Prayer Importance",
    so: "Muhiimadda Salaadda Lamaanahaaga",
  },
  "Marry Someone With Children": {
    en: "Marry Someone With Children",
    so: "Guur Qof Carruur Leh",
  },
  "Preferred Age": { en: "Preferred Age", so: "Da'da aad rabtid" },
  "Preferred Height": { en: "Preferred Height", so: "Dhererka aad rabtid" },
  "Preferred Countries": { en: "Preferred Countries", so: "Dalalka aad rabtid" },
  "Preferred Education": { en: "Preferred Education", so: "Waxbarashada aad rabtid" },
  "Accept Divorcee": { en: "Accept Divorcee", so: "Aqbal Qof La Furay" },
  "Accept Widow": { en: "Accept Widow", so: "Aqbal Qof Carmal ah" },
  "Accept Children": { en: "Accept Children", so: "Aqbal Carruur" },
  Photo: { en: "Photo", so: "Sawir" },
};

/** Static UI strings used across the questionnaire flow. */
const UI_TEXT = {
  edit: { en: "Edit", so: "Wax ka beddel" },
  finalReview: { en: "Final Review", so: "Dib u eegis Kama dambays ah" },
  editProfileDetails: {
    en: "Edit Profile Details",
    so: "Wax ka beddel Faahfaahinta Profile-ka",
  },
  reviewBeforeSubmitting: {
    en: "Review before submitting",
    so: "Dib u eeg ka hor gudbinta",
  },
  editModeDesc: {
    en: "Update any section below. Changes save when you finish editing a step.",
    so: "Cusboonaysii qayb kasta oo hoose. Isbeddelladu waxay kaydsanayaan marka aad dhammaysato tallaabada.",
  },
  reviewDesc: {
    en: "Review everything you've entered. You can edit any section before submitting.",
    so: "Dib u eeg dhammaan waxa aad gelisay. Waad wax ka beddeli kartaa qayb kasta ka hor gudbinta.",
  },
  saveChanges: { en: "Save Changes", so: "Kaydi Isbeddellada" },
  submitting: { en: "Submitting...", so: "Waa la gudbinayaa..." },
  submitProfile: { en: "Submit Profile", so: "Gudbi Profile-ka" },
  uploaded: { en: "Uploaded", so: "La soo geliyay" },
  anyValue: { en: "Any", so: "Mid kasta" },
  photoRequired: {
    en: "Please upload a profile photo before submitting.",
    so: "Fadlan soo geli sawir profile ah ka hor gudbinta.",
  },
  profileComplete: {
    en: "Profile complete! Finding your matches...",
    so: "Profile-ku waa dhammaystiran yahay! Waxaa la raadinayaa kuwa ku habboon...",
  },
  submitFailed: {
    en: "Failed to submit. Please try again.",
    so: "Gudbintu waa fashilantay. Fadlan mar kale isku day.",
  },
  // Phase-complete interstitial
  part1Complete: { en: "Part 1 complete", so: "QAYBTA 1AAD WAA DHAMMAATAY" },
  part2Complete: { en: "Part 2 complete", so: "Qaybta 2aad waa dhammaatay" },
  infoSaved: {
    en: "Your information is saved",
    so: "Macluumaadkaaga waa la kaydiyay",
  },
  prefsSaved: {
    en: "Partner preferences saved",
    so: "Xulushada lamaanaha waa la kaydiyay",
  },
  part1Desc: {
    en: "Great work — you've finished telling us about yourself. Next, share what you're looking for in a spouse.",
    so: "Waad ku mahadsan tahay — waxaad dhammaysay inaad noo sheegto wax kugu saabsan. Marka xigta, noo sheeg waxa aad ka doonayso lamaanahaaga.",
  },
  part2Desc: {
    en: "You've finished both parts of your profile. Review your answers one last time, then submit.",
    so: "Waxaad dhammaysay labada qaybood ee profile-kaaga. Dib u eeg jawaabahaaga marka ugu dambeyso ka dibna gudbi.",
  },
  aboutYouChip: { en: "About you", so: "Wax kugu saabsan" },
  partnerPrefsChip: { en: "Partner preferences", so: "Doorbidyada lammaanaha" },
  continueToPartner: {
    en: "Continue to Partner Preferences",
    so: "U gudub Doorbidyada Lammaanaha",
  },
  reviewAndSubmit: {
    en: "Review & Submit Profile",
    so: "Dib u eeg & Gudbi Profile-ka",
  },
  continueToPhoto: {
    en: "Add Your Photo",
    so: "Ku dar Sawirkaaga",
  },
  // Photo step
  photoTitle: { en: "Profile Photo", so: "Sawirka Profile-ka" },
  photoStepDesc: {
    en: "A photo is optional, but recommended. Other members will see it when browsing matches.",
    so: "Sawirku waa ikhtiyaari, laakiin waa la soo jeedinayaa. Xubnaha kale ayaa arki doona markay eegayaan kuwa ku habboon.",
  },
  chooseImageError: {
    en: "Please choose an image file.",
    so: "Fadlan dooro fayl sawir ah.",
  },
  photoUploaded: {
    en: "Profile photo uploaded!",
    so: "Sawirka profile-ka waa la soo geliyay!",
  },
  uploadFailed: {
    en: "Failed to upload image. Please try again.",
    so: "Sawirka lama soo gelin. Fadlan mar kale isku day.",
  },
  photoRequiredContinue: {
    en: "Please upload a profile photo before continuing.",
    so: "Fadlan soo geli sawir profile ah ka hor intaadan sii wadin.",
  },
  continueWithoutPhoto: {
    en: "Continue without photo",
    so: "Sii wad sawir la'aan",
  },
  uploadYourPhoto: {
    en: "Add a profile picture (optional)",
    so: "Ku dar sawir profile (ikhtiyaari)",
  },
  photoHelp: {
    en: "A clear, recent photo of yourself helps serious matches recognize you. You can skip and add one later.",
    so: "Sawir cad oo dhow oo adiga ah wuxuu ka caawiyaa kuwa dhab ah inay ku aqoonsadaan. Waad ka boodi kartaa oo aad ku dari kartaa hadhow.",
  },
  uploading: { en: "Uploading...", so: "Waa la soo gelinayaa..." },
  changePhoto: { en: "Change Photo", so: "Beddel Sawirka" },
  choosePhoto: { en: "Choose Photo", so: "Dooro Sawir" },
  uploadPhotoAria: {
    en: "Upload profile photo",
    so: "Soo geli sawir profile ah",
  },
  saveAndContinue: { en: "Save & Continue", so: "Kaydi & Sii wad" },
  submitAndContinue: { en: "Submit & Continue", so: "Gudbi & Sii wad" },
  saveAndContinueToPhoto: {
    en: "Save & Continue to Photo",
    so: "Kaydi & U gudub Sawirka",
  },
  submitAndReview: {
    en: "Submit & Review Profile",
    so: "Gudbi & Dib u eeg Profile-ka",
  },
  autoSaveOn: { en: "Auto-save on", so: "Kaydinta tooska ah" },
  questionOf: { en: "Question {current} of {total}", so: "Su'aal {current} / {total}" },
  selectUpTo: {
    en: "Choose up to {count}",
    so: "Dooro ilaa {count}",
  },
  nextQuestion: { en: "Next question", so: "Su'aasha xigta" },
  continueFlow: { en: "Continue", so: "Sii wad" },
  previousQuestion: { en: "Previous", so: "Dib u noqo" },
  saving: { en: "Saving...", so: "Waa la kaydinayaa..." },
  saved: { en: "Saved", so: "La kaydiyay" },
  saveFailed: { en: "Save failed", so: "Kaydintu waa fashilantay" },
  selectOption: { en: "Please select an option", so: "Fadlan dooro hal xulasho" },
  requiredField: { en: "This field is required", so: "Meeshan waa loo baahan yahay" },
  selectAtLeastOne: {
    en: "Please select at least one option",
    so: "Fadlan dooro ugu yaraan hal xulasho",
  },
  phoneInvalid: {
    en: "Please enter a valid phone number",
    so: "Geli lambar taleefan sax ah",
  },
  answerAllRequired: {
    en: "Please answer all required questions before continuing.",
    so: "Fadlan ka jawaab dhammaan su'aalaha loo baahan yahay ka hor intaadan sii wadin.",
  },
  bioPlaceholder: {
    en: "Tell us about yourself...",
    so: "Noo sheeg wax kugu saabsan...",
  },
  substanceDetailsPlaceholder: {
    en: "e.g. smoking, cannabis, other — please be honest",
    so: "tusaale: sigaar, cannabis, kale — fadlan si daacad ah u sheeg",
  },
  selectPlaceholder: { en: "Select", so: "Dooro" },
  selectCity: { en: "Select city", so: "Dooro magaalada" },
  enterCity: { en: "Enter your city", so: "Geli magaaladaada" },
  useMyLocation: { en: "Use my location", so: "Isticmaal goobtayda" },
  allowLocationRequired: {
    en: "Use my location (recommended)",
    so: "Isticmaal goobtayda (la taliyay)",
  },
  detectingLocation: { en: "Detecting location…", so: "Goobta waa la raadinayaa…" },
  locationDetected: {
    en: "Location found from your device",
    so: "Goobta aaladdaada waa la helay",
  },
  locationFailed: {
    en: "Could not detect location. Please choose country and city below.",
    so: "Goobta lama ogaan karin. Fadlan hoos ka dooro dalka iyo magaalada.",
  },
  locationPermissionDenied: {
    en: "Location permission denied. Please choose country and city below.",
    so: "Ogolaanshaha goobta waa la diiday. Fadlan hoos ka dooro dalka iyo magaalada.",
  },
  locationUnsupported: {
    en: "This device cannot share location. Please choose country and city below.",
    so: "Qalabkani ma wadaagi karo goobta. Fadlan hoos ka dooro dalka iyo magaalada.",
  },
  locationTimeout: {
    en: "Location timed out. Please try again outdoors, or choose country and city below.",
    so: "Goobta way daahday. Isku day bannaanka, ama hoos ka dooro dalka iyo magaalada.",
  },
  locationCountryUnsupported: {
    en: "We could not match your country from GPS. Please choose it below.",
    so: "Dalkaaga lagama jaan qaadin GPS. Fadlan hoos ka dooro.",
  },
  locationDetectedHint: {
    en: "Detected: {{city}}, {{country}}",
    so: "La ogaaday: {{city}}, {{country}}",
  },
  locationRequiredHint: {
    en: "Tap “Use my location” for the most accurate place. If it fails, choose country and city manually.",
    so: "Riix “Isticmaal goobtayda” si aad u hesho goob sax ah. Haddii ay fashilanto, gacanta ku dooro dalka iyo magaalada.",
  },
  locationRequiredError: {
    en: "Please choose your country and city",
    so: "Fadlan dooro dalkaaga iyo magaaladaada",
  },
  locationVerifiedBadge: {
    en: "From your device",
    so: "Laga helay aaladdaada",
  },
  chooseManually: {
    en: "Or choose manually",
    so: "Ama gacanta ku dooro",
  },
  updateLocation: {
    en: "Update with current location",
    so: "Cusbooneysii goobta hadda",
  },
  // Questionnaire page header / flow
  profileQuestionnaire: { en: "Profile Questionnaire", so: "Su'aalaha Profile-ka" },
  part1CompleteSub: {
    en: "Part 1 complete — ready for partner preferences",
    so: "Qaybta 1aad waa dhammaatay — diyaar u ah doorbidyada lammaanaha",
  },
  reviewUpdateSub: {
    en: "Review and update your profile",
    so: "Dib u eeg oo cusboonaysii profile-kaaga",
  },
  reviewAnswersSub: {
    en: "Review your answers before submitting",
    so: "Dib u eeg jawaabahaaga ka hor gudbinta",
  },
  finalStepPhotoSub: {
    en: "Final step — upload your profile photo",
    so: "Tallaabada u dambaysa — soo geli sawirkaaga profile-ka",
  },
  part2Sub: {
    en: "Part 2 — What you're looking for in a spouse",
    so: "Qaybta 2aad — Waxa aad ka doonayso lamaanahaaga",
  },
  profileCompleteFooter: {
    en: "{p}% complete · Auto-saves as you go",
    so: "{p}% dhammaystiran · Si toos ah ayuu u kaydsanayaa",
  },
  progressStepOf: {
    en: "Step {step} of {total}",
    so: "Tallaabada {step} ee {total}",
  },
  progressMinutesLeft: {
    en: "About {m} min remaining",
    so: "Qiyaastii {m} daqiiqo ayaa hadhay",
  },
  progressAlmostDone: {
    en: "Almost done",
    so: "Ku dhow inaad dhammayso",
  },
  fieldWhyPrefix: {
    en: "Why we ask",
    so: "Maxaan u weydiinaynaa",
  },
  badgeReview: { en: "Review", so: "Dib u eegis" },
  badgePhoto: { en: "Photo", so: "Sawir" },
  badgePart2: { en: "Part 2", so: "Qaybta 2aad" },
  badgeQuestionnaire: { en: "Questionnaire", so: "Su'aalo" },
  stepWord: { en: "Step", so: "Tallaabo" },
  part1AboutPrefix: {
    en: "Part 1 — About you",
    so: "Qaybta 1aad — Wax kugu saabsan",
  },
  part2CalloutTitle: {
    en: "Part 2: What you want in a spouse",
    so: "Qaybta 2aad: Waxa aad ka rabto lamaanahaaga",
  },
  part2CalloutDesc: {
    en: "You finished your own details. Now answer the questions below about your ideal partner.",
    so: "Waxaad dhammaysay faahfaahintaada. Hadda ka jawaab su'aalaha hoose ee ku saabsan lammaanahaaga ku habboon.",
  },
  back: { en: "Back", so: "Dib u noqo" },
  changesSaved: { en: "Changes saved", so: "Isbeddellada waa la kaydiyay" },
  part1SavedToast: {
    en: "Part 1 saved! Now tell us what you want in a partner.",
    so: "Qaybta 1aad waa la kaydiyay! Hadda noo sheeg waxa aad ka rabto lammaane.",
  },
  partnerToast: {
    en: "Great! Now tell us what you're looking for in a partner.",
    so: "Aad baad u fiican tahay! Hadda noo sheeg waxa aad ka raadinayso lammaane.",
  },
  almostDoneToast: {
    en: "Almost done! Upload your profile photo.",
    so: "Ku dhow inaad dhammayso! Soo geli sawirkaaga profile-ka.",
  },
  saveFailedToast: {
    en: "Failed to save. Please try again.",
    so: "Lama kaydin. Fadlan mar kale isku day.",
  },
  photoSavedToast: {
    en: "Photo saved! Review your profile before submitting.",
    so: "Sawirka waa la kaydiyay! Dib u eeg profile-kaaga ka hor gudbinta.",
  },
  photoUpdatedToast: {
    en: "Photo updated.",
    so: "Sawirka waa la cusboonaysiiyay.",
  },
  profileCompleteTitle: {
    en: "Profile submitted",
    so: "Profile-ka waa la gudbiyay",
  },
  profileReadySub: {
    en: "Your questionnaire is complete. An admin will review your profile shortly — you will be notified when you can browse matches.",
    so: "Su'aalaha waa dhammeeyeen. Admin ayaa dhawaan dib u eegi doona profile-kaaga — waa lagu ogeysiin doonaa markaad eegi karto isbarbardhigga.",
  },
  profileReadyPaySub: {
    en: "Your questionnaire is complete. Choose Basic or Premium to unlock matches.",
    so: "Su'aalaha waa dhammeeyeen. Dooro Basic ama Premium si aad u furto isbarbardhigga.",
  },
  welcomeQuestionnaireTitle: {
    en: "Welcome! Let's build your marriage profile",
    so: "Ku soo dhawoow! Aan dhisno profile-kaaga guurka",
  },
  welcomeQuestionnaireSub: {
    en: "Answer one question at a time. Progress saves automatically — leave and return anytime. This usually takes about 8–12 minutes.",
    so: "Hal su'aal marba ka jawaab. Horumarka si toos ah ayaa loo kaydiyaa — waad ka bixi kartaa oo dib ugu soo noqon kartaa. Badanaa waxay qaadataa 8–12 daqiiqo.",
  },
  viewMatches: { en: "View Matches", so: "Eeg Kuwa Ku Habboon" },
  myProfile: { en: "My Profile", so: "Profile-kayga" },
  profileNotFound: {
    en: "Profile not found. Please try refreshing.",
    so: "Profile lama helin. Fadlan dib u cusboonaysii.",
  },
  goToDashboard: { en: "Go to Dashboard", so: "Tag dashboard-ka" },
  completePaymentFirst: {
    en: "Complete payment first",
    so: "Marka hore dhammaystir lacag bixinta",
  },
  payToUnlock: {
    en: "Complete your profile questionnaire to continue.",
    so: "Dhammaystir su'aalaha profile-kaaga si aad u sii wadato.",
  },
} as const;

export type QuestionnaireUiKey = keyof typeof UI_TEXT;

export function useQuestionnaireI18n() {
  const { locale } = useTranslation();

  const stepTitle = useCallback(
    (id: number, fallback: string) =>
      STEP_TEXT[id]?.title[locale as Locale] ?? fallback,
    [locale]
  );

  const stepDescription = useCallback(
    (id: number, fallback: string) =>
      STEP_TEXT[id]?.description[locale as Locale] ?? fallback,
    [locale]
  );

  const fieldLabel = useCallback(
    (name: string, fallback: string) =>
      FIELD_LABELS[name]?.[locale as Locale] ?? fallback,
    [locale]
  );

  const fieldWhy = useCallback(
    (name: string) => FIELD_WHY[name]?.[locale as Locale] ?? null,
    [locale]
  );

  const optionLabel = useCallback(
    (value: string) => OPTION_LABELS[value]?.[locale as Locale] ?? value,
    [locale]
  );

  const reviewLabel = useCallback(
    (label: string) => REVIEW_LABELS[label]?.[locale as Locale] ?? label,
    [locale]
  );

  const ui = useCallback(
    (key: QuestionnaireUiKey) => UI_TEXT[key][locale as Locale],
    [locale]
  );

  return {
    locale,
    stepTitle,
    stepDescription,
    fieldLabel,
    fieldWhy,
    optionLabel,
    reviewLabel,
    ui,
  };
}
