import React from 'react';
import type { TranslationFile, Glossary, TranslationHistory } from '../types';
import { TranslationAnalysisCard } from './TranslationAnalysisCard';
import { getValueByPath } from '../services/translationService';

interface ValueSearchResultsViewProps {
  keys: string[];
  searchQuery: { term: string; lang: string } | null;
  files: TranslationFile[];
  contexts: Record<string, any>;
  globalContext: Glossary;
  translationHistory: TranslationHistory;
  onUpdateValue: (fileName: string, key: string, newValue: any) => void;
  onUpdateContext: (key: string, newContext: string) => void;
  onUpdateGlossary: (glossary: Glossary) => void;
}

export const ValueSearchResultsView: React.FC<ValueSearchResultsViewProps> = ({ keys, searchQuery, ...props }) => {
    if (!searchQuery) {
        return (
            <div className="flex items-center justify-center h-full bg-gray-800/30 rounded-lg m-8">
                <p className="text-gray-500">Perform a search by value from the left panel.</p>
            </div>
        );
    }
    
    if (keys.length === 0) {
        return (
            <div className="flex items-center justify-center h-full bg-gray-800/30 rounded-lg m-8">
                <p className="text-gray-500">No results found for "{searchQuery.term}" in language "{searchQuery.lang}".</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b border-gray-700 flex-shrink-0 bg-gray-800/50">
                <h2 className="text-lg font-semibold text-gray-100">
                    {keys.length} result(s) for <span className="text-teal-400 font-semibold">"{searchQuery.term}"</span> in language <span className="text-teal-400 font-semibold">{searchQuery.lang}</span>
                </h2>
            </div>
            <div className="flex-grow overflow-y-auto p-4 lg:p-6 space-y-6 bg-gray-900">
                {keys.map(key => (
                    <TranslationAnalysisCard
                        key={key}
                        translationKey={key}
                        files={props.files}
                        context={getValueByPath(props.contexts, key) || ''}
                        globalContext={props.globalContext}
                        translationHistory={props.translationHistory}
                        onUpdateValue={props.onUpdateValue}
                        onUpdateContext={(newContext) => props.onUpdateContext(key, newContext)}
                        onUpdateGlossary={props.onUpdateGlossary}
                        showFilePreview={false}
                    />
                ))}
            </div>
        </div>
    );
};
