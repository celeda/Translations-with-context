
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

// Stores user's manual overrides for specific translation keys.
// This acts as a translation memory.
// Example: { "buttons.submit": { "en": "Submit Application" } }
export type TranslationHistory = Record<string, Record<string, string>>;

export interface TranslationGroup {
  id: string;
  name: string;
  context: string;
  keys: string[];
  referenceKeys: string[];
}

// FIX: Add Glossary type definition.
// Defines the structure for the multi-language glossary.
// Example: { "Submit": { "pl": "Zatwierdź", "de": "Senden" } }
export type Glossary = Record<string, Record<string, string>>;

// FIX: Add BulkTranslationSuggestion type definition.
export interface BulkTranslationSuggestion {
    key: string;
    suggestions: Record<string, string>;
}