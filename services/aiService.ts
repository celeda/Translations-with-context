import { GoogleGenAI, Type } from "@google/genai";
import type { AIAnalysisResult, Glossary, TranslationHistory } from '../types';

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

export const analyzeTranslations = async (
  translationKey: string,
  context: string,
  polishTranslation: { lang: string; value: string },
  englishTranslation: { lang: string; value: string } | null,
  translationsToReview: { lang: string; value: string }[],
  model: string,
  globalContext: Glossary,
  translationHistory: TranslationHistory
): Promise<AIAnalysisResult> => {
  
  const apiKey = process.env.API_KEY as string;
  if (!apiKey) {
    throw new Error("API key is not configured. Please check your environment variables.");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  const allTranslationsToAnalyze = [
    polishTranslation,
    ...(englishTranslation ? [englishTranslation] : []),
    ...translationsToReview
  ];

  const translationsString = allTranslationsToAnalyze
    .map(t => `- Language: ${t.lang}, Translation: "${t.value}"`)
    .join('\n');

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
Poniższe reguły są obowiązkowe. Mają one pierwszeństwo przed ogólnym kontekstem, ale niższy priorytet niż 'Historia Zmian'.
${glossaryEntries}
`;
  }

  const prompt = `Jesteś ekspertem lingwistą i specjalistą od lokalizacji. Twoim zadaniem jest szczegółowa ocena tłumaczeń dla interfejsu aplikacji. Twoje odpowiedzi (w polach 'feedback' i 'suggestion') MUSZĄ być w języku polskim.

**Hierarchia Ważności Informacji (od najważniejszej):**
1.  **Historia Zmian:** Ostateczne, ręcznie zapisane przez użytkownika wersje.
2.  **Glosariusz Terminologiczny:** Zdefiniowane tłumaczenia dla konkretnych terminów.
3.  **Źródła Prawdy (Referencje):** Tłumaczenia w języku angielskim i polskim.
4.  **Kontekst Ogólny:** Opis dostarczony przez użytkownika.

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
    -   Napisz szczegółową opinię w języku polskim. Użyj podstawowego markdownu (np. **pogrubienie**).
    -   **Krytycznie ważne:** Potwierdź, czy tłumaczenie jest zgodne z **Historią Zmian**. Jeśli nie, to jest błąd.
    -   Następnie sprawdź zgodność z **Glosariuszem**. Zignorowanie reguły z glosariusza to błąd.
    -   Na końcu oceń zgodność z ogólnym kontekstem i źródłami prawdy.
3.  **'suggestion'**:
    -   Jeśli ocena to 'Needs Improvement' lub 'Incorrect', podaj **TYLKO I WYŁĄCZNIE sugerowany tekst tłumaczenia**.
    -   Pole 'suggestion' nie może zawierać żadnych dodatkowych opisów, cudzysłowów ani uzasadnień.
    -   Jeśli tłumaczenie jest 'Good', pomiń pole 'suggestion'.

**Tłumaczenia do oceny:**
${translationsString}

Zwróć odpowiedź w ustrukturyzowanym formacie JSON, zgodnie z podanym schematem.`;

  try {
    const response = await ai.models.generateContent({
      model: model,
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
