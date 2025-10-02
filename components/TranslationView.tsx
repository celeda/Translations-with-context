import React from 'react';
import type { TranslationFile, Glossary, TranslationHistory } from '../types';
import { TranslationAnalysisCard } from './TranslationAnalysisCard';

interface TranslationViewProps {
  files: TranslationFile[];
  selectedKey: string;
  onUpdateValue: (fileName: string, key: string, newValue: any) => void;
  context: string;
  onUpdateContext: (newContext: string) => void;
  globalContext: Glossary;
  onUpdateGlossary: (glossary: Glossary) => void;
  translationHistory: TranslationHistory;
}

export const TranslationView: React.FC<TranslationViewProps> = (props) => {
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 lg:p-8">
        <TranslationAnalysisCard 
            translationKey={props.selectedKey}
            files={props.files}
            context={props.context}
            globalContext={props.globalContext}
            translationHistory={props.translationHistory}
            onUpdateValue={props.onUpdateValue}
            onUpdateContext={props.onUpdateContext}
            onUpdateGlossary={props.onUpdateGlossary}
            showFilePreview={true}
        />
    </div>
  );
};
