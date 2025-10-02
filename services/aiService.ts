import { GoogleGenAI, Type } from "@google/genai";
import type { AIAnalysisResult, Glossary, TranslationHistory, TranslationFile } from '../types';

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
  globalContext: Glossary,
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
Dla klucza '${translationKey}', użytkownik ręcznie zapisał poniższe wersje. Są to absolutnie ostateczne i poprawne tłumaczenia, które mają pierwszeństwo przed wszystkimi innymi regułami, włączając glosariusz. Każde odstępstwo od tej historii jest błędem krytycznym.
${historyEntries}
`;
        }
    }

    let glossaryString = "";
    if (globalContext && Object.keys(globalContext).length > 0) {
        const glossaryEntries = Object.entries(globalContext)
        .map(([key, translations]) => {
            const rules = Object.entries(translations)
            .map(([lang, value]) => `  - W języku '${lang}', termin ten MUSI być tłumaczony jako "${value}".`)
            .join('\n');
            return `- Dla terminu źródłowego "${key}":\n${rules}`;
        })
        .join('\n');
        
        glossaryString = `
**Glosariusz Terminologiczny (Wysoki Priorytet):**
Poniższe reguły są obowiązkowe. Mają one pierwszeństwo przed ogólnym kontekstem, ale niższy priorytet niż 'Wzorce Kontekstowe' i 'Historia Zmian'.
${glossaryEntries}
`;
    }

    const prompt = `Jesteś ekspertem lingwistą i specjalistą od lokalizacji. Twoim zadaniem jest szczegółowa ocena tłumaczeń dla interfejsu aplikacji. Twoje odpowiedzi (w polach 'feedback' i 'suggestion') MUSZĄ być w języku polskim.

**Hierarchia Ważności Informacji (od najważniejszej):**
1.  **Wzorce Kontekstowe Grupy:** Klucze wzorcowe zdefiniowane przez użytkownika dla tej grupy.
2.  **Historia Zmian:** Ostateczne, ręcznie zapisane przez użytkownika wersje.
3.  **Glosariusz Terminologiczny:** Zdefiniowane tłumaczenia dla konkretnych terminów.
4.  **Źródła Prawdy (Referencje):** Tłumaczenia w języku angielskim i polskim.
5.  **Kontekst Ogólny:** Opis dostarczony przez użytkownika.

${groupReferenceString}
${historyContextString}
${glossaryString}

**Źródła Prawdy (punkty odniesienia):**
- **Pierwszorzędne (angielski, ${englishTranslation?.lang || 'N/A'}):** "${englishTranslation?.value || 'N/A'}"
- **Drugorzędne (polski, ${polishTranslation.lang}):** "${polishTranslation.value}"

**Kontekst Ogólny:** "${context}"

**Zadanie:**
Dla każdego tłumaczenia z listy poniżej (włączając w to polski i angielski), oceń je, ściśle przestrzegając podanej hierarchii ważności. Pamiętaj, że nawet tłumaczenia referencyjne mogą zawierać błędy, które należy zidentyfikować i poprawić.

**W swojej ocenie, dla każdego języka:**
1.  **'evaluation'**: Użyj jednej z wartości: 'Good', 'Needs Improvement', lub 'Incorrect'. Wartości muszą pozostać w języku angielskim.
2.  **'feedback'**:
    -   Napisz zwięzłą i szczegółową opinię w języku polskim, która uzasadnia Twoją ocenę ('evaluation'). Użyj podstawowego markdownu (np. **pogrubienie**).
    -   Skup się wyłącznie na jakości tłumaczenia: jego poprawności gramatycznej, stylistycznej i zgodności z ogólnym kontekstem.
    -   **Nie wspominaj w komentarzu o "Glosariuszu", "Historii Zmian" ani o "Wzorcach Grupy".** Twoja ocena musi być oparta na tych regułach, ale uzasadnienie powinno dotyczyć samego tekstu. Na przykład, zamiast pisać "Niezgodne z glosariuszem", napisz "Słowo 'Zapisz' jest lepsze w tym kontekście niż 'Archiwizuj'".
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
  globalContext: Glossary,
  translationHistory: TranslationHistory,
  groupReferenceTranslations?: { key: string; translations: { lang: string; value: string }[] }[]
): Promise<AIAnalysisResult> => {
  
  const prompt = buildAnalysisPrompt(
    translationKey, context, polishTranslation, englishTranslation, translationsToReview,
    globalContext, translationHistory, groupReferenceTranslations
  );

  try {
    const response = await ai.models.generateContent({
      model: 'gem-2.5-flash',
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
      model: 'gem-2.5-flash',
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