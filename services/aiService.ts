import { GoogleGenAI, Type } from "@google/genai";
import type { AIAnalysisResult } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

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
  
  const translationsString = translationsToReview
    .map(t => `- Language: ${t.lang}, Translation: "${t.value}"`)
    .join('\n');

  let prompt: string;

  if (englishTranslation) {
    prompt = `Jesteś ekspertem lingwistą i specjalistą od lokalizacji. Twoim zadaniem jest szczegółowa ocena tłumaczeń na podstawie dostarczonego kontekstu i źródeł prawdy. Twoje odpowiedzi (w polach 'feedback' i 'suggestion') MUSZĄ być w języku polskim.

**Źródła prawdy:**
- **Pierwszorzędne (angielski, ${englishTranslation.lang}):** "${englishTranslation.value}"
- **Drugorzędne (polski, ${polishTranslation.lang}):** "${polishTranslation.value}"

**Kontekst:** "${context}"

**Zadanie:**
Dla każdego tłumaczenia z listy poniżej, porównaj je z oboma źródłami prawdy (angielskim i polskim).

**W swojej ocenie, dla każdego języka:**
1.  **'evaluation'**: Użyj jednej z wartości: 'Good', 'Needs Improvement', lub 'Incorrect'. Te wartości muszą pozostać w języku angielskim.
2.  **'feedback'**:
    -   Napisz szczegółową opinię w języku polskim.
    -   Jeśli występują różnice w stosunku do tłumaczenia angielskiego lub polskiego, **podaj konkretne przykłady** (np. "W tłumaczeniu niemieckim użyto słowa 'X', podczas gdy w angielskim źródle jest 'Y', co zmienia znaczenie na...").
    -   Wskaż, czy tłumaczenie jest zgodne z podanym kontekstem.
3.  **'suggestion'**:
    -   Jeśli ocena to 'Needs Improvement' lub 'Incorrect', podaj **konkretną sugestię poprawki** w języku polskim, która będzie lepszym tłumaczeniem.
    -   Krótko uzasadnij, dlaczego Twoja sugestia jest lepsza.
    -   Jeśli tłumaczenie jest 'Good', pole 'suggestion' może być pominięte lub pozostać puste.

**Tłumaczenia do oceny:**
${translationsString}

Zwróć odpowiedź w ustrukturyzowanym formacie JSON, zgodnie z podanym schematem.`;
  } else {
    // Fallback to original prompt if no English file is provided
    prompt = `Jesteś ekspertem lingwistą i specjalistą od lokalizacji. Twoim zadaniem jest ocena tłumaczeń na podstawie dostarczonego kontekstu. Tłumaczenie polskie jest prawidłowym odniesieniem. Twoje odpowiedzi (w polach 'feedback' i 'suggestion') MUSZĄ być w języku polskim.

Kontekst: "${context}"

Prawidłowe polskie (${polishTranslation.lang}) tłumaczenie: "${polishTranslation.value}"

Proszę ocenić następujące tłumaczenia na podstawie kontekstu i polskiego odniesienia. Dla każdego z nich podaj:
1. 'evaluation' (ocenę) jako jeden z następujących ciągów znaków: 'Good', 'Needs Improvement', 'Incorrect'. Te wartości muszą pozostać w języku angielskim.
2. Krótki 'feedback' (opinię) w języku polskim, wyjaśniający Twoje uzasadnienie.
3. Jeśli ocena to 'Needs Improvement' lub 'Incorrect', podaj 'suggestion' (sugestię) lepszego tłumaczenia w języku polskim. Jeśli tłumaczenie jest 'Good', pole 'suggestion' może być pominięte lub być pustym ciągiem znaków.

Tłumaczenia do oceny:
${translationsString}

Zwróć odpowiedź w ustrukturyzowanym formacie JSON, zgodnie z podanym schematem.`;
  }


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
    // In case the API returns a markdown-wrapped JSON
    const cleanJsonText = jsonText.replace(/^```json\s*|```$/g, '');
    const parsed = JSON.parse(cleanJsonText);
    return parsed as AIAnalysisResult;

  } catch (error) {
    console.error("Error analyzing translations with AI:", error);
    throw new Error("Failed to get analysis from AI. Please check the console for more details.");
  }
};