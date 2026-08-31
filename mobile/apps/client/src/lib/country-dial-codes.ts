/** Dialing codes keyed by the same country names as `ALL_COUNTRIES`. */

export type DialCountry = {
  name: string;
  dial: string; // digits only, no "+"
  iso2: string;
};

/** Prefer these at the top of the search list (product market). */
const PRIORITY = [
  "Somalia",
  "Kenya",
  "Ethiopia",
  "Djibouti",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Canada",
  "Saudi Arabia",
  "Yemen",
  "Sudan",
  "Uganda",
  "Tanzania",
  "Egypt",
  "Turkey",
] as const;

export const DIAL_COUNTRIES: DialCountry[] = [
  { name: "Afghanistan", dial: "93", iso2: "AF" },
  { name: "Albania", dial: "355", iso2: "AL" },
  { name: "Algeria", dial: "213", iso2: "DZ" },
  { name: "Andorra", dial: "376", iso2: "AD" },
  { name: "Angola", dial: "244", iso2: "AO" },
  { name: "Antigua and Barbuda", dial: "1268", iso2: "AG" },
  { name: "Argentina", dial: "54", iso2: "AR" },
  { name: "Armenia", dial: "374", iso2: "AM" },
  { name: "Australia", dial: "61", iso2: "AU" },
  { name: "Austria", dial: "43", iso2: "AT" },
  { name: "Azerbaijan", dial: "994", iso2: "AZ" },
  { name: "Bahamas", dial: "1242", iso2: "BS" },
  { name: "Bahrain", dial: "973", iso2: "BH" },
  { name: "Bangladesh", dial: "880", iso2: "BD" },
  { name: "Barbados", dial: "1246", iso2: "BB" },
  { name: "Belarus", dial: "375", iso2: "BY" },
  { name: "Belgium", dial: "32", iso2: "BE" },
  { name: "Belize", dial: "501", iso2: "BZ" },
  { name: "Benin", dial: "229", iso2: "BJ" },
  { name: "Bhutan", dial: "975", iso2: "BT" },
  { name: "Bolivia", dial: "591", iso2: "BO" },
  { name: "Bosnia and Herzegovina", dial: "387", iso2: "BA" },
  { name: "Botswana", dial: "267", iso2: "BW" },
  { name: "Brazil", dial: "55", iso2: "BR" },
  { name: "Brunei", dial: "673", iso2: "BN" },
  { name: "Bulgaria", dial: "359", iso2: "BG" },
  { name: "Burkina Faso", dial: "226", iso2: "BF" },
  { name: "Burundi", dial: "257", iso2: "BI" },
  { name: "Cambodia", dial: "855", iso2: "KH" },
  { name: "Cameroon", dial: "237", iso2: "CM" },
  { name: "Canada", dial: "1", iso2: "CA" },
  { name: "Cape Verde", dial: "238", iso2: "CV" },
  { name: "Central African Republic", dial: "236", iso2: "CF" },
  { name: "Chad", dial: "235", iso2: "TD" },
  { name: "Chile", dial: "56", iso2: "CL" },
  { name: "China", dial: "86", iso2: "CN" },
  { name: "Colombia", dial: "57", iso2: "CO" },
  { name: "Comoros", dial: "269", iso2: "KM" },
  { name: "Congo", dial: "242", iso2: "CG" },
  { name: "Costa Rica", dial: "506", iso2: "CR" },
  { name: "Croatia", dial: "385", iso2: "HR" },
  { name: "Cuba", dial: "53", iso2: "CU" },
  { name: "Cyprus", dial: "357", iso2: "CY" },
  { name: "Czech Republic", dial: "420", iso2: "CZ" },
  { name: "Denmark", dial: "45", iso2: "DK" },
  { name: "Djibouti", dial: "253", iso2: "DJ" },
  { name: "Dominica", dial: "1767", iso2: "DM" },
  { name: "Dominican Republic", dial: "1809", iso2: "DO" },
  { name: "East Timor", dial: "670", iso2: "TL" },
  { name: "Ecuador", dial: "593", iso2: "EC" },
  { name: "Egypt", dial: "20", iso2: "EG" },
  { name: "El Salvador", dial: "503", iso2: "SV" },
  { name: "Equatorial Guinea", dial: "240", iso2: "GQ" },
  { name: "Eritrea", dial: "291", iso2: "ER" },
  { name: "Estonia", dial: "372", iso2: "EE" },
  { name: "Eswatini", dial: "268", iso2: "SZ" },
  { name: "Ethiopia", dial: "251", iso2: "ET" },
  { name: "Fiji", dial: "679", iso2: "FJ" },
  { name: "Finland", dial: "358", iso2: "FI" },
  { name: "France", dial: "33", iso2: "FR" },
  { name: "Gabon", dial: "241", iso2: "GA" },
  { name: "Gambia", dial: "220", iso2: "GM" },
  { name: "Georgia", dial: "995", iso2: "GE" },
  { name: "Germany", dial: "49", iso2: "DE" },
  { name: "Ghana", dial: "233", iso2: "GH" },
  { name: "Greece", dial: "30", iso2: "GR" },
  { name: "Grenada", dial: "1473", iso2: "GD" },
  { name: "Guatemala", dial: "502", iso2: "GT" },
  { name: "Guinea", dial: "224", iso2: "GN" },
  { name: "Guinea-Bissau", dial: "245", iso2: "GW" },
  { name: "Guyana", dial: "592", iso2: "GY" },
  { name: "Haiti", dial: "509", iso2: "HT" },
  { name: "Honduras", dial: "504", iso2: "HN" },
  { name: "Hungary", dial: "36", iso2: "HU" },
  { name: "Iceland", dial: "354", iso2: "IS" },
  { name: "India", dial: "91", iso2: "IN" },
  { name: "Indonesia", dial: "62", iso2: "ID" },
  { name: "Iran", dial: "98", iso2: "IR" },
  { name: "Iraq", dial: "964", iso2: "IQ" },
  { name: "Ireland", dial: "353", iso2: "IE" },
  { name: "Israel", dial: "972", iso2: "IL" },
  { name: "Italy", dial: "39", iso2: "IT" },
  { name: "Ivory Coast", dial: "225", iso2: "CI" },
  { name: "Jamaica", dial: "1876", iso2: "JM" },
  { name: "Japan", dial: "81", iso2: "JP" },
  { name: "Jordan", dial: "962", iso2: "JO" },
  { name: "Kazakhstan", dial: "7", iso2: "KZ" },
  { name: "Kenya", dial: "254", iso2: "KE" },
  { name: "Kiribati", dial: "686", iso2: "KI" },
  { name: "Kosovo", dial: "383", iso2: "XK" },
  { name: "Kuwait", dial: "965", iso2: "KW" },
  { name: "Kyrgyzstan", dial: "996", iso2: "KG" },
  { name: "Laos", dial: "856", iso2: "LA" },
  { name: "Latvia", dial: "371", iso2: "LV" },
  { name: "Lebanon", dial: "961", iso2: "LB" },
  { name: "Lesotho", dial: "266", iso2: "LS" },
  { name: "Liberia", dial: "231", iso2: "LR" },
  { name: "Libya", dial: "218", iso2: "LY" },
  { name: "Liechtenstein", dial: "423", iso2: "LI" },
  { name: "Lithuania", dial: "370", iso2: "LT" },
  { name: "Luxembourg", dial: "352", iso2: "LU" },
  { name: "Madagascar", dial: "261", iso2: "MG" },
  { name: "Malawi", dial: "265", iso2: "MW" },
  { name: "Malaysia", dial: "60", iso2: "MY" },
  { name: "Maldives", dial: "960", iso2: "MV" },
  { name: "Mali", dial: "223", iso2: "ML" },
  { name: "Malta", dial: "356", iso2: "MT" },
  { name: "Marshall Islands", dial: "692", iso2: "MH" },
  { name: "Mauritania", dial: "222", iso2: "MR" },
  { name: "Mauritius", dial: "230", iso2: "MU" },
  { name: "Mexico", dial: "52", iso2: "MX" },
  { name: "Micronesia", dial: "691", iso2: "FM" },
  { name: "Moldova", dial: "373", iso2: "MD" },
  { name: "Monaco", dial: "377", iso2: "MC" },
  { name: "Mongolia", dial: "976", iso2: "MN" },
  { name: "Montenegro", dial: "382", iso2: "ME" },
  { name: "Morocco", dial: "212", iso2: "MA" },
  { name: "Mozambique", dial: "258", iso2: "MZ" },
  { name: "Myanmar", dial: "95", iso2: "MM" },
  { name: "Namibia", dial: "264", iso2: "NA" },
  { name: "Nauru", dial: "674", iso2: "NR" },
  { name: "Nepal", dial: "977", iso2: "NP" },
  { name: "Netherlands", dial: "31", iso2: "NL" },
  { name: "New Zealand", dial: "64", iso2: "NZ" },
  { name: "Nicaragua", dial: "505", iso2: "NI" },
  { name: "Niger", dial: "227", iso2: "NE" },
  { name: "Nigeria", dial: "234", iso2: "NG" },
  { name: "North Korea", dial: "850", iso2: "KP" },
  { name: "North Macedonia", dial: "389", iso2: "MK" },
  { name: "Norway", dial: "47", iso2: "NO" },
  { name: "Oman", dial: "968", iso2: "OM" },
  { name: "Pakistan", dial: "92", iso2: "PK" },
  { name: "Palau", dial: "680", iso2: "PW" },
  { name: "Palestine", dial: "970", iso2: "PS" },
  { name: "Panama", dial: "507", iso2: "PA" },
  { name: "Papua New Guinea", dial: "675", iso2: "PG" },
  { name: "Paraguay", dial: "595", iso2: "PY" },
  { name: "Peru", dial: "51", iso2: "PE" },
  { name: "Philippines", dial: "63", iso2: "PH" },
  { name: "Poland", dial: "48", iso2: "PL" },
  { name: "Portugal", dial: "351", iso2: "PT" },
  { name: "Qatar", dial: "974", iso2: "QA" },
  { name: "Romania", dial: "40", iso2: "RO" },
  { name: "Russia", dial: "7", iso2: "RU" },
  { name: "Rwanda", dial: "250", iso2: "RW" },
  { name: "Saint Kitts and Nevis", dial: "1869", iso2: "KN" },
  { name: "Saint Lucia", dial: "1758", iso2: "LC" },
  { name: "Saint Vincent and the Grenadines", dial: "1784", iso2: "VC" },
  { name: "Samoa", dial: "685", iso2: "WS" },
  { name: "San Marino", dial: "378", iso2: "SM" },
  { name: "Sao Tome and Principe", dial: "239", iso2: "ST" },
  { name: "Saudi Arabia", dial: "966", iso2: "SA" },
  { name: "Senegal", dial: "221", iso2: "SN" },
  { name: "Serbia", dial: "381", iso2: "RS" },
  { name: "Seychelles", dial: "248", iso2: "SC" },
  { name: "Sierra Leone", dial: "232", iso2: "SL" },
  { name: "Singapore", dial: "65", iso2: "SG" },
  { name: "Slovakia", dial: "421", iso2: "SK" },
  { name: "Slovenia", dial: "386", iso2: "SI" },
  { name: "Solomon Islands", dial: "677", iso2: "SB" },
  { name: "Somalia", dial: "252", iso2: "SO" },
  { name: "South Africa", dial: "27", iso2: "ZA" },
  { name: "South Korea", dial: "82", iso2: "KR" },
  { name: "South Sudan", dial: "211", iso2: "SS" },
  { name: "Spain", dial: "34", iso2: "ES" },
  { name: "Sri Lanka", dial: "94", iso2: "LK" },
  { name: "Sudan", dial: "249", iso2: "SD" },
  { name: "Suriname", dial: "597", iso2: "SR" },
  { name: "Sweden", dial: "46", iso2: "SE" },
  { name: "Switzerland", dial: "41", iso2: "CH" },
  { name: "Syria", dial: "963", iso2: "SY" },
  { name: "Taiwan", dial: "886", iso2: "TW" },
  { name: "Tajikistan", dial: "992", iso2: "TJ" },
  { name: "Tanzania", dial: "255", iso2: "TZ" },
  { name: "Thailand", dial: "66", iso2: "TH" },
  { name: "Togo", dial: "228", iso2: "TG" },
  { name: "Tonga", dial: "676", iso2: "TO" },
  { name: "Trinidad and Tobago", dial: "1868", iso2: "TT" },
  { name: "Tunisia", dial: "216", iso2: "TN" },
  { name: "Turkey", dial: "90", iso2: "TR" },
  { name: "Turkmenistan", dial: "993", iso2: "TM" },
  { name: "Tuvalu", dial: "688", iso2: "TV" },
  { name: "Uganda", dial: "256", iso2: "UG" },
  { name: "Ukraine", dial: "380", iso2: "UA" },
  { name: "United Arab Emirates", dial: "971", iso2: "AE" },
  { name: "United Kingdom", dial: "44", iso2: "GB" },
  { name: "United States", dial: "1", iso2: "US" },
  { name: "Uruguay", dial: "598", iso2: "UY" },
  { name: "Uzbekistan", dial: "998", iso2: "UZ" },
  { name: "Vanuatu", dial: "678", iso2: "VU" },
  { name: "Vatican City", dial: "379", iso2: "VA" },
  { name: "Venezuela", dial: "58", iso2: "VE" },
  { name: "Vietnam", dial: "84", iso2: "VN" },
  { name: "Yemen", dial: "967", iso2: "YE" },
  { name: "Zambia", dial: "260", iso2: "ZM" },
  { name: "Zimbabwe", dial: "263", iso2: "ZW" },
];

const BY_NAME = new Map(DIAL_COUNTRIES.map((c) => [c.name.toLowerCase(), c]));

/** Longest dial codes first so "252" wins over "25". */
const BY_DIAL_LONGEST = [...DIAL_COUNTRIES].sort(
  (a, b) => b.dial.length - a.dial.length
);

export function dialCountryForName(countryName: string | null | undefined): DialCountry {
  const key = String(countryName ?? "").trim().toLowerCase();
  return BY_NAME.get(key) ?? BY_NAME.get("somalia")!;
}

export function searchDialCountries(query: string): DialCountry[] {
  const q = query.trim().toLowerCase().replace(/^\+/, "");
  const priorityIndex = new Map(
    PRIORITY.map((n, i) => [n.toLowerCase(), i] as const)
  );

  if (!q) {
    const rest = DIAL_COUNTRIES.filter(
      (c) => !priorityIndex.has(c.name.toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name));
    const top = PRIORITY.map((name) =>
      DIAL_COUNTRIES.find((c) => c.name === name)
    ).filter((c): c is DialCountry => !!c);
    return [...top, ...rest];
  }

  const scored = DIAL_COUNTRIES.map((c) => {
    const name = c.name.toLowerCase();
    let score = -1;
    if (name.startsWith(q)) score = 90;
    else if (name.includes(q)) score = 60;
    else if (c.dial.startsWith(q) || `+${c.dial}`.startsWith(q)) score = 80;
    else if (c.iso2.toLowerCase() === q) score = 85;
    if (score > 0 && priorityIndex.has(name)) score += 5;
    return { c, score };
  }).filter((x) => x.score >= 0);

  scored.sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name));
  return scored.map((x) => x.c);
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Strip a leading 0 from national numbers (common local trunk prefix). */
export function stripTrunkZero(national: string): string {
  const d = digitsOnly(national);
  return d.startsWith("0") ? d.slice(1) : d;
}

export function buildE164(dial: string, national: string): string {
  const d = digitsOnly(dial);
  const n = stripTrunkZero(national);
  if (!d || !n) return n ? `+${d}${n}` : d ? `+${d}` : "";
  return `+${d}${n}`;
}

export function splitPhone(
  phone: string | null | undefined,
  fallbackCountry?: string | null
): { country: DialCountry; national: string } {
  const fallback = dialCountryForName(fallbackCountry);
  const raw = String(phone ?? "").trim();
  if (!raw) return { country: fallback, national: "" };

  const digits = digitsOnly(raw);
  if (raw.startsWith("+") || digits.length >= 10) {
    for (const c of BY_DIAL_LONGEST) {
      if (digits.startsWith(c.dial) && digits.length > c.dial.length) {
        return { country: c, national: digits.slice(c.dial.length) };
      }
    }
  }

  return { country: fallback, national: stripTrunkZero(raw) };
}
