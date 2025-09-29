import { GoogleGenAI, Type } from "@google/genai";
import type { AIAnalysisResult } from '../types';

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
  context: string,
  polishTranslation: { lang: string; value: string },
  englishTranslation: { lang: string; value: string } | null,
  translationsToReview: { lang: string; value: string }[],
  model: string
): Promise<AIAnalysisResult> => {
  
  const allTranslationsToAnalyze = [
    polishTranslation,
    ...(englishTranslation ? [englishTranslation] : []),
    ...translationsToReview
  ];

  const translationsString = allTranslationsToAnalyze
    .map(t => `- Language: ${t.lang}, Translation: "${t.value}"`)
    .join('\n');

  let prompt: string;

  if (englishTranslation) {
    prompt = `Jesteś ekspertem lingwistą i specjalistą od lokalizacji. Twoim zadaniem jest szczegółowa ocena tłumaczeń dla interfejsu aplikacji. Twoje odpowiedzi (w polach 'feedback' i 'suggestion') MUSZĄ być w języku polskim.

**Źródła prawdy (punkty odniesienia):**
- **Pierwszorzędne (angielski, ${englishTranslation.lang}):** "${englishTranslation.value}"
- **Drugorzędne (polski, ${polishTranslation.lang}):** "${polishTranslation.value}"

**Kontekst:** "${context}"

**Zadanie:**
Dla każdego tłumaczenia z listy poniżej (włączając w to polski i angielski), oceń je pod kątem obu źródeł prawdy. Pamiętaj, że nawet tłumaczenia referencyjne (polski i angielski) mogą zawierać błędy, takie jak literówki czy błędy gramatyczne, które należy zidentyfikować i poprawić.

**W swojej ocenie, dla każdego języka:**
1.  **'evaluation'**: Użyj jednej z wartości: 'Good', 'Needs Improvement', lub 'Incorrect'. Te wartości muszą pozostać w języku angielskim.
2.  **'feedback'**:
    -   Napisz szczegółową opinię w języku polskim. Użyj podstawowego markdownu, aby poprawić czytelność (np. **pogrubienie**, listy z '-').
    -   Jeśli występują różnice w stosunku do tłumaczenia angielskiego lub polskiego, podaj konkretne przykłady.
    -   Wskaż, czy tłumaczenie jest zgodne z podanym kontekstem.
3.  **'suggestion'**:
    -   Jeśli ocena to 'Needs Improvement' lub 'Incorrect', podaj **TYLKO I WYŁĄCZNIE sugerowany tekst tłumaczenia**.
    -   Pole 'suggestion' nie może zawierać żadnych dodatkowych opisów, cudzysłowów ani uzasadnień.
    -   Sugestie MUSZĄ być **krótkie i zwięzłe**, odpowiednie dla interfejsu aplikacji (np. etykiety przycisków).
    -   Jeśli tłumaczenie jest 'Good', pomiń pole 'suggestion'.

**Tłumaczenia do oceny:**
${translationsString}

Zwróć odpowiedź w ustrukturyzowanym formacie JSON, zgodnie z podanym schematem.`;
  } else {
    // Fallback to original prompt if no English file is provided
    prompt = `Jesteś ekspertem lingwistą i specjalistą od lokalizacji, oceniającym tłumaczenia dla interfejsu aplikacji. Twoje odpowiedzi (w polach 'feedback' i 'suggestion') MUSZĄ być w języku polskim.

**Kontekst:** "${context}"

**Prawidłowe polskie (${polishTranslation.lang}) tłumaczenie (źródło prawdy):** "${polishTranslation.value}"

**Zadanie:**
Oceń poniższe tłumaczenia, używając polskiego tłumaczenia jako źródła prawdy. Pamiętaj, że nawet polskie tłumaczenie referencyjne może zawierać błędy (np. literówki, błędy gramatyczne), które należy zidentyfikować i poprawić.

**Dla każdego tłumaczenia:**
1.  **'evaluation'**: Użyj jednej z wartości: 'Good', 'Needs Improvement', lub 'Incorrect' (wartości muszą pozostać po angielsku).
2.  **'feedback'**: Napisz zwięzłą opinię w języku polskim. Użyj podstawowego markdownu dla lepszej czytelności (np. **pogrubienie**).
3.  **'suggestion'**:
    -   Jeśli ocena nie jest 'Good', podaj **TYLKO I WYŁĄCZNIE sugerowany tekst tłumaczenia**.
    -   Pole 'suggestion' nie może zawierać żadnych dodatkowych opisów, cudzysłowów ani uzasadnień.
    -   Sugestie MUSZĄ być **krótkie i zwięzle**, odpowiednie dla interfejsu aplikacji.
    -   Jeśli tłumaczenie jest 'Good', pomiń pole 'suggestion'.

**Tłumaczenia do oceny:**
${translationsString}

Zwróć odpowiedź w ustrukturyzowanym formacie JSON, zgodnie z podanym schematem.`;
  }


  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });

    const jsonText = response.text.trim();
    // In case the API returns a markdown-wrapped JSON
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