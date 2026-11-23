import { GoogleGenAI, Type } from '@google/genai';
import { getBloodBanksDirectory, searchAndMatchHospitals } from './queries.ts';
import type { FreshnessThresholds } from '../shared/freshness.ts';
import type {
  BedCategory,
  BloodGroup,
  HospiAssistantFilters,
  HospiAssistantResponse,
} from '../shared/types.ts';

const VALID_CITIES = ['Salem', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Chennai', 'Erode'];
const VALID_SPECIALTIES = [
  'Cardiology',
  'Neurology',
  'Oncology',
  'Orthopedics',
  'Pediatrics',
  'Nephrology',
  'Pulmonology',
  'Gastroenterology',
  'Obstetrics',
  'Gynecology',
  'General Medicine',
  'General Surgery',
  'Emergency Medicine',
  'Critical Care',
  'Trauma Care',
  'Organ Transplant',
];
const VALID_BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function parseNaturalQueryFallback(queryText: string): HospiAssistantFilters {
  const lower = queryText.toLowerCase();

  let city: string | undefined;
  const cityAliases: Array<[RegExp, string]> = [
    [/salem|சேலம்|சேலத்/, 'Salem'],
    [/coimbatore|kovai|peelamedu|கோயம்புத்தூர்|கோவை/, 'Coimbatore'],
    [/madurai|மதுரை/, 'Madurai'],
    [/trichy|tiruchirappalli|திருச்சி/, 'Tiruchirappalli'],
    [/chennai|madras|சென்னை/, 'Chennai'],
    [/erode|ஈரோடு|ஈரோட்/, 'Erode'],
  ];
  for (const [re, name] of cityAliases) {
    if (re.test(lower)) {
      city = name;
      break;
    }
  }

  let specialty: string | undefined;
  const specAliases: Array<[RegExp, string]> = [
    [/cardio|heart|இதய/, 'Cardiology'],
    [/neuro|brain|stroke|நரம்பியல்/, 'Neurology'],
    [/onco|cancer|புற்றுநோய்/, 'Oncology'],
    [/ortho|bone|fracture|எலும்பு/, 'Orthopedics'],
    [/pediatric|child|குழந்தை/, 'Pediatrics'],
    [/nephro|kidney|renal|சிறுநீரக/, 'Nephrology'],
    [/pulmo|lung|respiratory/, 'Pulmonology'],
    [/gastro/, 'Gastroenterology'],
    [/obstetric|gynec|maternity|மகப்பேறு/, 'Obstetrics'],
    [/trauma|accident|விபத்து/, 'Trauma Care'],
  ];
  for (const [re, name] of specAliases) {
    if (re.test(lower)) {
      specialty = name;
      break;
    }
  }

  const requireIcu = /\bicu\b|intensive care|ventilator|ஐசியு|தீவிர சிகிச்சை/.test(lower);
  const requireEmergency = /emergency|24\/7|24x7|urgent|casualty|அவசர/.test(lower);
  const requireAmbulance = /ambulance|ஆம்புலன்ஸ்/.test(lower);
  const requireTrauma = /trauma|accident|விபத்து/.test(lower);
  const requireDiagnostics = /diagnostic|scan|ct|mri|x-ray|lab|பரிசோதனை/.test(lower);
  const requireBloodBank = /blood|ரத்த|குருதி/.test(lower);

  let bloodGroup: BloodGroup | '' = '';
  for (const bg of VALID_BLOOD_GROUPS) {
    const escaped = bg.replace('+', '\\+');
    const re = new RegExp(`(^|\\s)${escaped}(\\s|$|[,.])`, 'i');
    if (re.test(queryText.trim())) {
      bloodGroup = bg;
      break;
    }
  }

  let bedType: BedCategory | '' = '';
  if (/general ward|general bed|பொது வார்டு/.test(lower)) bedType = 'General Ward';
  else if (/private room|தனி அறை/.test(lower)) bedType = 'Private Rooms';
  else if (/observation/.test(lower)) bedType = 'Emergency Observation';
  else if (requireIcu) bedType = 'ICU';

  const parts: string[] = [];
  if (city) parts.push(`City: ${city}`);
  if (specialty) parts.push(`Specialty: ${specialty}`);
  if (requireIcu) parts.push('ICU');
  if (requireEmergency) parts.push('24/7 Emergency');
  if (requireAmbulance) parts.push('Ambulance');
  if (requireTrauma) parts.push('Trauma Care');
  if (requireDiagnostics) parts.push('Diagnostics');
  if (requireBloodBank || bloodGroup) parts.push(bloodGroup ? `Blood Bank (${bloodGroup})` : 'Blood Bank');

  return {
    city,
    specialty,
    bed_type: bedType,
    blood_group: bloodGroup,
    require_icu: requireIcu,
    require_emergency: requireEmergency,
    require_ambulance: requireAmbulance,
    require_blood_bank: requireBloodBank || Boolean(bloodGroup),
    require_trauma: requireTrauma,
    require_diagnostics: requireDiagnostics,
    freshness_filter: 'ALL',
    intent_summary: parts.length > 0 ? parts.join(' · ') : `Keyword search: "${queryText.trim()}"`,
  };
}

export async function runHospiAssistantQuery(
  params: {
    query: string;
    language?: 'en' | 'ta';
    originLat?: number;
    originLng?: number;
  },
  thresholds: FreshnessThresholds
): Promise<HospiAssistantResponse> {
  const cleanedQuery = params.query.trim();
  const apiKey = process.env.GEMINI_API_KEY;

  let extracted: HospiAssistantFilters | null = null;
  let mode: 'ai' | 'fallback' = 'fallback';
  let fallbackReason: string | undefined;

  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const timeoutMs = 6000;
      const response = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Extract structured hospital discovery search filters from this user query (may be in English or Tamil).
Supported cities: ${VALID_CITIES.join(', ')}.
Supported specialties: ${VALID_SPECIALTIES.join(', ')}.
Supported bed_type: "General Ward", "ICU", "Emergency Observation", "Private Rooms".
Supported blood_group: ${VALID_BLOOD_GROUPS.join(', ')}.
Rules: Do not provide medical advice, diagnosis, or invent hospital names. Only map explicit needs to structured filters. If a field is not mentioned, leave it empty or false.
User query: "${cleanedQuery}"`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                city: { type: Type.STRING, nullable: true },
                area: { type: Type.STRING, nullable: true },
                specialty: { type: Type.STRING, nullable: true },
                bed_type: { type: Type.STRING, nullable: true },
                blood_group: { type: Type.STRING, nullable: true },
                require_icu: { type: Type.BOOLEAN },
                require_emergency: { type: Type.BOOLEAN },
                require_ambulance: { type: Type.BOOLEAN },
                require_blood_bank: { type: Type.BOOLEAN },
                require_trauma: { type: Type.BOOLEAN },
                require_diagnostics: { type: Type.BOOLEAN },
                intent_summary: { type: Type.STRING },
              },
              required: ['intent_summary'],
            },
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini extraction timed out after 6000ms')), timeoutMs)
        ),
      ]);

      const text = response.text?.trim();
      if (text) {
        const parsed = JSON.parse(text) as Partial<HospiAssistantFilters>;
        const matchedCity = parsed.city
          ? VALID_CITIES.find((c) => c.toLowerCase() === parsed.city!.toLowerCase())
          : undefined;
        const matchedSpec = parsed.specialty
          ? VALID_SPECIALTIES.find((s) => s.toLowerCase().includes(parsed.specialty!.toLowerCase()))
          : undefined;
        const validBed = (['General Ward', 'ICU', 'Emergency Observation', 'Private Rooms'] as const).find(
          (b) => b === parsed.bed_type
        );
        const validBlood = VALID_BLOOD_GROUPS.find((bg) => bg === parsed.blood_group);

        extracted = {
          city: matchedCity,
          area: parsed.area?.trim() || undefined,
          specialty: matchedSpec,
          bed_type: validBed || '',
          blood_group: validBlood || '',
          require_icu: Boolean(parsed.require_icu),
          require_emergency: Boolean(parsed.require_emergency),
          require_ambulance: Boolean(parsed.require_ambulance),
          require_blood_bank: Boolean(parsed.require_blood_bank || validBlood),
          require_trauma: Boolean(parsed.require_trauma),
          require_diagnostics: Boolean(parsed.require_diagnostics),
          freshness_filter: 'ALL',
          intent_summary: parsed.intent_summary || cleanedQuery,
        };
        mode = 'ai';
      }
    } catch (err) {
      console.warn('Hospi Assistant Gemini call fell back to deterministic parser:', err instanceof Error ? err.message : err);
      fallbackReason = 'AI extraction temporarily unavailable; deterministic rule-based parser used.';
    }
  } else {
    fallbackReason = 'Server GEMINI_API_KEY not configured; using deterministic rule-based parser.';
  }

  if (!extracted) {
    extracted = parseNaturalQueryFallback(cleanedQuery);
    mode = 'fallback';
  }

  const hasStructuredConstraint = Boolean(
    extracted.city ||
      extracted.area ||
      extracted.specialty ||
      extracted.bed_type ||
      extracted.require_icu ||
      extracted.require_emergency ||
      extracted.require_ambulance ||
      extracted.require_blood_bank ||
      extracted.require_trauma ||
      extracted.require_diagnostics
  );

  const hospitals = searchAndMatchHospitals(
    {
      query: hasStructuredConstraint ? undefined : cleanedQuery,
      city: extracted.city,
      area: extracted.area,
      specialty: extracted.specialty,
      bed_type: extracted.bed_type,
      require_icu: extracted.require_icu,
      require_emergency: extracted.require_emergency,
      require_ambulance: extracted.require_ambulance,
      require_blood_bank: extracted.require_blood_bank,
      require_trauma: extracted.require_trauma,
      require_diagnostics: extracted.require_diagnostics,
      freshness_filter: 'ALL',
      originLat: params.originLat,
      originLng: params.originLng,
      sort_by: typeof params.originLat === 'number' ? 'distance' : 'relevance',
    },
    thresholds
  );

  const bloodRecords =
    extracted.require_blood_bank || extracted.blood_group
      ? getBloodBanksDirectory(
          {
            city: extracted.city,
            blood_group: extracted.blood_group || undefined,
          },
          thresholds
        ).slice(0, 24)
      : [];

  const isTamil = params.language === 'ta';
  const explanation =
    hospitals.length > 0
      ? isTamil
        ? `உங்கள் தேடலின் அடிப்படையில் (${extracted.intent_summary}) ${hospitals.length} சரிபார்க்கப்பட்ட மருத்துவமனைகள் தரவுத்தளத்திலிருந்து கண்டறியப்பட்டன. நேரடி படுக்கை எண்ணிக்கையை உறுதிப்படுத்த மருத்துவமனையை நேரடியாக அழைக்கவும்.`
        : `Matched ${hospitals.length} verified hospital record${hospitals.length === 1 ? '' : 's'} from HOSPIFIND SQLite based on: ${extracted.intent_summary}. Please call the hospital desk directly to confirm live bed or blood availability.`
      : isTamil
      ? `கண்டறியப்பட்ட வடிப்பான்களுக்கு (${extracted.intent_summary}) நேரடி பொருத்தங்கள் இல்லை. நகரம் அல்லது சிறப்புத் தேவையை மாற்றி மீண்டும் முயற்சிக்கவும்.`
      : `No verified hospital records matched all extracted filters (${extracted.intent_summary}). Try broadening the city or facility requirement.`;

  return {
    mode,
    fallbackReason,
    extractedFilters: extracted,
    explanation,
    hospitals,
    bloodRecords,
  };
}
