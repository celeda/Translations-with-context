
import { GoogleGenAI, Type } from "@google/genai";
import type { AIAnalysisResult, TranslationHistory, TranslationFile } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    analysis: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          language: { type: Type.STRING },
          evaluation: { 
            type: Type.STRING,
            enum: ['Good', 'Needs Improvement', 'Incorrect'],
          },
          feedback: { type: Type.STRING },
          suggestion: { type: Type.STRING },
        },
        required: ["language", "evaluation", "feedback"]
      },
    },
  },
  required: ["analysis"]
};

const polishFileFinder = (f: { name: string }) => f.name.toLowerCase().includes('pl') || f.name.toLowerCase().includes('polish');

export const buildAnalysisPrompt = (
  translationKey: string,
  context: string,
  polishTranslation: { lang: string; value: string },
  englishTranslation: { lang: string; value: string } | null,
  translationsToReview: { lang: string; value: string }[],
  translationHistory: TranslationHistory,
  groupReferenceTranslations?: { key: string; translations: { lang: string; value: string }[] }[]
): string => {
    const allTranslationsToAnalyze = [
        polishTranslation,
        ...(englishTranslation ? [englishTranslation] : []),
        ...translationsToReview
    ];

    const translationsString = allTranslationsToAnalyze
        .map(t => `- Language: ${t.lang}, Translation: "${t.value}"`)
        .join('\n');

    let groupReferenceString = "";
    if (groupReferenceTranslations && groupReferenceTranslations.length > 0) {
        const referenceEntries = groupReferenceTranslations.map(ref => {
            const plTranslation = ref.translations.find(t => polishFileFinder({name: t.lang}));
            return `- Klucz '${ref.key}' (wartość PL: "${plTranslation?.value || 'N/A'}") jest absolutnym wzorcem dla tego zadania. Terminologia i frazowanie z tego klucza muszą być ściśle stosowane.`;
        }).join('\n');

        groupReferenceString = `
**Wzorce Kontekstowe Grupy (PRIORYTET KRYTYCZNY):**
Poniższe klucze i ich wartości zostały oznaczone przez użytkownika jako absolutny wzorzec dla tej grupy. Mają one najwyższy możliwy priorytet, ponad Historią i Glosariuszem. Każde odstępstwo od terminologii użytej w tych wzorcach jest błędem krytycznym.
${referenceEntries}
`;
    }

    let historyContextString = "";
    if (translationHistory && translationHistory[translationKey]) {
        const keyHistory = translationHistory[translationKey];
        const historyEntries = Object.entries(keyHistory)
        .map(([lang, value]) => `- Dla języka '${lang}', ostateczna, zatwierdzona przez użytkownika wersja to: "${value}".`)
        .join('\n');
        
        if (historyEntries) {
        historyContextString = `
**Historia Zmian (NAJWYŻSZY PRIORYTET):**
Dla klucza '${translationKey}', użytkownik ręcznie zapisał poniższe wersje. Są to absolutnie ostateczne i poprawne tłumaczenia, które mają pierwszeństwo przed wszystkimi innymi regułami. Każde odstępstwo od tej historii jest błędem krytycznym.
`;
        }
    }

    const prompt = `Jesteś światowej klasy ekspertem lingwistycznym, specjalizującym się w lokalizacji oprogramowania. Twoja praca wymaga absolutnej precyzji. Twoje odpowiedzi (w polach 'feedback' i 'suggestion') MUSZĄ być w języku polskim.

**KRYTYCZNE INSTRUKCJE ZADANIA (NAJWYŻSZY PRIORYTET):**
1.  **ABSOLUTNE ŹRÓDŁO PRAWDY:** Tłumaczenie w języku polskim (PL) jest **jedynym i ostatecznym** punktem odniesienia. Wszystkie inne tłumaczenia, włącznie z angielskim, muszą być oceniane **WYŁĄCZNIE** pod kątem zgodności z wersją polską pod względem znaczenia, tonu i kontekstu.
2.  **ROLA JĘZYKA ANGIELSKIEGO:** Tłumaczenie angielskie (EN) służy **jedynie jako dodatkowy kontekst**, który może pomóc w zrozumieniu intencji, ale **NIGDY** nie może być traktowane jako wzorzec, jeśli jest niezgodne z wersją polską.
3.  **ZAKAZ INNYCH REFERENCJI:** Pod żadnym pozorem nie używaj żadnego innego języka (np. włoskiego, niemieckiego, hiszpańskiego) jako punktu odniesienia w swojej ocenie. Twoja analiza musi być zakotwiczona w polskim tekście. Każde odwołanie do innego języka jako wzorca jest **błędem krytycznym**.

Poza powyższymi regułami, obowiązuje następująca hierarchia ważności informacji:
1.  **Wzorce Kontekstowe Grupy:** Klucze wzorcowe zdefiniowane przez użytkownika. Mają one bezwzględny priorytet.
2.  **Historia Zmian:** Ostateczne, ręcznie zapisane przez użytkownika wersje.
3.  **Źródło Prawdy (Polski):** Jak zdefiniowano w krytycznych instrukcjach.
4.  **Kontekst Ogólny:** Opis dostarczony przez użytkownika.

${groupReferenceString}
${historyContextString}

**ABSOLUTNE ŹRÓDŁO PRAWDY (POLSKI - ${polishTranslation.lang}):**
"${polishTranslation.value}"

**DODATKOWY PUNKT ODNIESIENIA (ANGIELSKI - ${englishTranslation?.lang || 'N/A'}):**
"${englishTranslation?.value || 'N/A'}"

**Kontekst Ogólny:** "${context}"

**Zadanie:**
Dla każdego tłumaczenia z listy poniżej, wykonaj rygorystyczną ocenę, ściśle trzymając się podanych instrukcji. Porównaj każde tłumaczenie z **polską wersją referencyjną**.

**W swojej ocenie, dla każdego języka:**
1.  **'evaluation'**: Użyj jednej z wartości: 'Good', 'Needs Improvement', lub 'Incorrect'. Wartości muszą pozostać w języku angielskim.
2.  **'feedback'**:
    -   Napisz zwięzłą i szczegółową opinię w języku polskim, która uzasadnia Twoją ocenę ('evaluation'). Użyj podstawowego markdownu (np. **pogrubienie**).
    -   Skup się wyłącznie na jakości tłumaczenia.
    -   **Nie wspominaj w komentarzu o "Glosariuszu", "Historii Zmian" ani o "Wzorcach Grupy".** Twoja ocena musi być oparta na tych regułach, ale uzasadnienie powinno dotyczyć samego tekstu.
3.  **'suggestion'**:
    -   Jeśli ocena to 'Needs Improvement' lub 'Incorrect', podaj **TYLKO I WYŁĄCZNIE sugerowany tekst tłumaczenia**.
    -   Pole 'suggestion' nie może zawierać żadnych dodatkowych opisów, cudzysłowów ani uzasadnień.
    -   Jeśli tłumaczenie jest 'Good', pomiń pole 'suggestion'.

**Tłumaczenia do oceny:**
${translationsString}

Zwróć odpowiedź w ustrukturyzowanym formacie JSON, zgodnie z podanym schematem.`;

    return prompt;
};

export const analyzeTranslations = async (
  translationKey: string,
  context: string,
  polishTranslation: { lang: string; value: string },
  englishTranslation: { lang: string; value: string } | null,
  translationsToReview: { lang: string; value: string }[],
  translationHistory: TranslationHistory,
  groupReferenceTranslations?: { key: string; translations: { lang: string; value: string }[] }[]
): Promise<AIAnalysisResult> => {
  
  const prompt = buildAnalysisPrompt(
    translationKey, context, polishTranslation, englishTranslation, translationsToReview,
    translationHistory, groupReferenceTranslations
  );

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });

    const jsonText = response.text.trim();
    const cleanJsonText = jsonText.replace(/^```json\s*|```$/g, '');
    const parsed = JSON.parse(cleanJsonText);
    return parsed as AIAnalysisResult;

  } catch (error) {
    console.error("Error analyzing translations with AI:", error);
    const errorMessage = String(error);

    if (errorMessage.includes("PERMISSION_DENIED") || errorMessage.includes("403")) {
        throw new Error("AI analysis failed due to a permission error. Please ensure the API key is valid and has the necessary permissions enabled.");
    }

    if (errorMessage.toLowerCase().includes("api key not valid")) {
        throw new Error("AI analysis failed: The provided API key is not valid. Please check your API key and try again.");
    }

    throw new Error("Failed to get analysis from AI. An unknown error occurred. Please check the console for more details.");
  }
};

export const buildGenerateContextPrompt = (
  translationKey: string,
  translations: { lang: string; value: string }[],
): string => {
  const translationsString = translations
    .map(t => `- Language: ${t.lang}, Translation: "${t.value}"`)
    .join('\n');

  const prompt = `Jesteś specjalistą od UX i lokalizacji. Twoim zadaniem jest stworzenie krótkiego, ale precyzyjnego opisu kontekstu dla klucza tłumaczenia w aplikacji. Opis musi być w języku polskim. Na podstawie nazwy klucza i jego istniejących wartości, opisz, gdzie i w jakim celu ten tekst może być używany w interfejsie użytkownika.

Klucz: "${translationKey}"

Istniejące Tłumaczenia:
${translationsString}

Sugerowany Kontekst (odpowiedz TYLKO I WYŁĄCZNIE sugerowanym tekstem opisu, bez żadnych dodatkowych wstępów, formatowania markdown, cudzysłowów czy nagłówków typu "Sugerowany Kontekst:"):`;
  
  return prompt;
};


export const generateContextForKey = async (
  translationKey: string,
  translations: { lang: string; value: string }[]
): Promise<string> => {
  
  const prompt = buildGenerateContextPrompt(translationKey, translations);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text.trim();

  } catch (error) {
    console.error("Error generating context with AI:", error);
    const errorMessage = String(error);

    if (errorMessage.includes("PERMISSION_DENIED") || errorMessage.includes("403")) {
        throw new Error("AI context suggestion failed due to a permission error. Please ensure the API key is valid and has the necessary permissions enabled.");
    }

    if (errorMessage.toLowerCase().includes("api key not valid")) {
        throw new Error("AI context suggestion failed: The provided API key is not valid. Please check your API key and try again.");
    }

    throw new Error("Failed to get context suggestion from AI. An unknown error occurred. Please check the console for more details.");
  }
};