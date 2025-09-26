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