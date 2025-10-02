export interface TranslationFile {
  name: string;
  data: Record<string, any>;
}

export interface AnalysisItem {
  language: string;
  evaluation: 'Good' | 'Needs Improvement' | 'Incorrect';
  feedback: string;
  suggestion?: string;
}

export interface AIAnalysisResult {
  analysis: AnalysisItem[];
}

// Maps a source term (e.g., Polish) to its translations in other languages.
// Example: { "zapisz": { "en": "Save", "de": "Speichern" } }
export type Glossary = Record<string, Record<string, string>>;

// Stores user's manual overrides for specific translation keys.
// This acts as a translation memory.
// Example: { "buttons.submit": { "en": "Submit Application" } }
export type TranslationHistory = Record<string, Record<string, string>>;
