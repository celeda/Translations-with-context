import React, { useState, useEffect, useMemo } from 'react';
import type { TranslationFile, AIAnalysisResult, AnalysisItem } from '../types';
import { getValueByPath, getLineNumber } from '../services/translationService';
import { analyzeTranslations } from '../services/aiService';
import { CheckIcon, EditIcon, ClipboardIcon, SparklesIcon, PanelOpenIcon, PanelCloseIcon } from './Icons';
import { JsonFileViewer } from './JsonFileViewer';

interface TranslationViewProps {
  files: TranslationFile[];
  selectedKey: string;
  onUpdateValue: (fileName: string, key: string, newValue: any) => void;
  context: string;
  onUpdateContext: (newContext: string) => void;
}

interface ValueDisplayProps {
  value: any;
  onSave: (newValue: any) => void;
}

const ValueDisplay: React.FC<ValueDisplayProps> = ({ value, onSave }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedValue, setEditedValue] = useState('');
    const [error, setError] = useState<string | null>(null);

    const isObjectOrArray = typeof value === 'object' && value !== null;

    const handleEditClick = () => {
        const initialValue = value === undefined || value === null ? '' : value;
        setEditedValue(isObjectOrArray ? JSON.stringify(initialValue, null, 2) : String(initialValue));
        setIsEditing(true);
        setError(null);
    };

    const handleCancelClick = () => {
        setIsEditing(false);
        setError(null);
    };

    const handleSaveClick = () => {
        let newValue;
        if (isObjectOrArray) {
            try {
                newValue = JSON.parse(editedValue);
                setError(null);
            } catch (e) {
                setError('Invalid JSON format.');
                return;
            }
        } else if (typeof value === 'number') {
            newValue = parseFloat(editedValue);
            if (isNaN(newValue)) {
                setError('Invalid number format.');
                return;
            }
        } else if (typeof value === 'boolean') {
            if (editedValue.toLowerCase() === 'true') {
                newValue = true;
            } else if (editedValue.toLowerCase() === 'false') {
                newValue = false;
            } else {
                setError('Must be "true" or "false".');
                return;
            }
        } else {
             newValue = editedValue;
        }

        onSave(newValue);
        setIsEditing(false);
    };

    let displayValue: React.ReactNode;
    
    if (value === undefined) {
        displayValue = <span className="text-gray-500 italic">Not found</span>;
    } else if (value === null) {
        displayValue = <span className="text-purple-400">null</span>;
    } else if (isObjectOrArray) {
        displayValue = <pre className="text-sm whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre>;
    } else if (typeof value === 'string') {
        displayValue = <p className="text-base text-green-300 whitespace-pre-wrap break-words">"{value}"</p>;
    } else if (typeof value === 'number') {
        displayValue = <p className="text-base text-blue-300">{value}</p>;
    } else if (typeof value === 'boolean') {
        displayValue = <p className="text-base text-purple-400">{String(value)}</p>;
    } else {
        displayValue = <p className="text-base">{String(value)}</p>;
    }

    if (isEditing) {
        const InputComponent = isObjectOrArray || (typeof value === 'string' && value.length > 60) ? 'textarea' : 'input';
        const rows = isObjectOrArray ? Math.max(8, editedValue.split('\n').length) : 3;
        return (
            <div className="flex-1 min-w-0 p-3 space-y-2 bg-gray-900/50 rounded-md">
                <InputComponent
                    value={editedValue}
                    onChange={(e) => setEditedValue(e.target.value)}
                    rows={rows}
                    className="w-full bg-gray-800 border border-gray-600 rounded-md p-2 text-gray-200 font-mono text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition"
                    autoFocus
                />
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <div className="flex justify-end space-x-2">
                    <button onClick={handleCancelClick} className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium py-1 px-2 rounded-md transition-colors duration-200">
                        Cancel
                    </button>
                    <button onClick={handleSaveClick} className="text-xs bg-teal-600 hover:bg-teal-500 text-white font-medium py-1 px-2 rounded-md transition-colors duration-200">
                        Save
                    </button>
                </div>
            </div>
        )
    }
    
    return (
        <div className="flex-1 min-w-0 relative group">
            <div className="absolute top-1 right-1 flex space-x-1">
                 {value !== undefined && (
                    <button
                        onClick={handleEditClick}
                        className="p-1 rounded-md bg-gray-700/50 hover:bg-gray-600 text-gray-400 hover:text-white transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Edit value"
                    >
                        <EditIcon className="w-4 h-4" />
                    </button>
                )}
            </div>
            <div className="flex items-start">
                 <div className="flex-1 min-w-0">{displayValue}</div>
            </div>
        </div>
    );
};

const EvaluationBadge: React.FC<{ evaluation: 'Good' | 'Needs Improvement' | 'Incorrect' }> = ({ evaluation }) => {
  const baseClasses = "text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full inline-block";
  const styles = {
    'Good': "bg-green-900 text-green-300",
    'Needs Improvement': "bg-yellow-900 text-yellow-300",
    'Incorrect': "bg-red-900 text-red-300",
  };
  return <span className={`${baseClasses} ${styles[evaluation]}`}>{evaluation}</span>;
};

export const TranslationView: React.FC<TranslationViewProps> = ({ files, selectedKey, onUpdateValue, context: parentContext, onUpdateContext }) => {
  const [previewFileIndex, setPreviewFileIndex] = useState(0);
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
  const [localContext, setLocalContext] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');

  const polishFile = useMemo(() => files.find(f => f.name.toLowerCase().includes('pl') || f.name.toLowerCase().includes('polish')), [files]);
  const englishFile = useMemo(() => files.find(f => f.name.toLowerCase().includes('en') || f.name.toLowerCase().includes('english')), [files]);

  useEffect(() => {
    if (previewFileIndex >= files.length && files.length > 0) {
        setPreviewFileIndex(0);
    }
  }, [files, previewFileIndex]);

  useEffect(() => {
      setAnalysisResult(null);
      setError(null);
      setLocalContext(parentContext || '');
  }, [selectedKey, parentContext]);

  const analysisMap = useMemo(() => {
    if (!analysisResult) {
      return new Map<string, AnalysisItem>();
    }
    return new Map(analysisResult.analysis.map(item => [item.language, item]));
  }, [analysisResult]);

  const handleContextBlur = () => {
    if (localContext !== parentContext) {
        onUpdateContext(localContext);
    }
  };

  const handleAnalyze = async () => {
    if (localContext !== parentContext) {
        onUpdateContext(localContext);
    }

    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);

    if (!polishFile) {
        setError("A Polish translation file (e.g., 'pl.json') is required as a reference for analysis.");
        setIsLoading(false);
        return;
    }
    
    if (!localContext.trim()) {
        setError("Context is required for AI analysis. Please add a context for this key first.");
        setIsLoading(false);
        return;
    }

    const polishValue = String(getValueByPath(polishFile.data, selectedKey) || '');
    const englishTranslation = englishFile ? { lang: englishFile.name, value: String(getValueByPath(englishFile.data, selectedKey) || '') } : null;

    const otherTranslations = files
        .filter(f => f.name !== polishFile.name && f.name !== englishFile?.name)
        .map(f => ({
            lang: f.name,
            value: String(getValueByPath(f.data, selectedKey) || ''),
        }));

    try {
        const result = await analyzeTranslations(
            localContext, 
            { lang: polishFile.name, value: polishValue }, 
            englishTranslation,
            otherTranslations, 
            selectedModel
        );
        setAnalysisResult(result);
    } catch (e: any) {
        setError(e.message || "An unknown error occurred.");
    } finally {
        setIsLoading(false);
    }
  };

  const previewFile = files[previewFileIndex];
  
  const handleCopyToClipboard = () => {
    const tsvContent = files.map(file => {
        const value = getValueByPath(file.data, selectedKey);
        let valueString: string;
        
        if (typeof value === 'object' && value !== null) {
            valueString = JSON.stringify(value);
        } else if (value === undefined || value === null) {
            valueString = "";
        } else {
            valueString = String(value);
        }
        const sanitizedValue = valueString.replace(/\t|\n|\r/g, ' ');
        return `${file.name}\t${sanitizedValue}`;
    }).join('\n');

    navigator.clipboard.writeText(tsvContent).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex-grow flex flex-col bg-gray-800/50 rounded-lg overflow-hidden h-full">
      <div className="p-4 border-b border-gray-700 flex flex-col space-y-4">
        <div>
            <h2 className="text-lg font-semibold text-gray-100">Translation Key</h2>
            <p className="text-teal-400 font-mono break-all mt-1">{selectedKey}</p>
        </div>
        <div>
            <label htmlFor="ai-context" className="block text-sm font-medium text-gray-300 mb-2">
                Context for AI Analysis
            </label>
            <textarea
                id="ai-context"
                rows={3}
                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-gray-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition"
                placeholder="e.g., This key is used on a button for saving a user's profile."
                value={localContext}
                onChange={(e) => setLocalContext(e.target.value)}
                onBlur={handleContextBlur}
            />
        </div>
        <div className="flex items-end justify-between gap-4">
            <div>
                <label htmlFor="ai-model" className="block text-sm font-medium text-gray-300 mb-2">
                    AI Model
                </label>
                <select
                    id="ai-model"
                    className="bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-gray-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                >
                    <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                </select>
            </div>
            <button 
                onClick={handleAnalyze}
                disabled={!localContext.trim() || isLoading}
                className="flex items-center space-x-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <SparklesIcon className="w-5 h-5"/>
                <span>{isLoading ? 'Analyzing...' : 'Analyze with AI'}</span>
            </button>
        </div>
      </div>
      
      <div className="flex-grow p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden min-h-0">
        <div className={`flex flex-col animate-fade-in overflow-hidden ${!isPreviewVisible ? 'lg:col-span-2' : ''}`}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-md font-semibold text-gray-300">Values by Language</h3>
               <div className="flex items-center space-x-2">
                 <button
                    onClick={handleCopyToClipboard}
                    className={`text-xs font-medium py-1 px-3 rounded-md transition-all duration-200 flex items-center space-x-1.5 ${
                        copied
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    }`}
                  >
                    {copied ? ( <> <CheckIcon className="w-4 h-4" /> <span>Copied!</span> </> ) 
                    : ( <> <ClipboardIcon className="w-4 h-4" /> <span>Copy</span> </> )}
                 </button>
                 <button
                    onClick={() => setIsPreviewVisible(!isPreviewVisible)}
                    className="hidden lg:flex items-center space-x-2 text-xs font-medium py-1 px-2 rounded-md transition-all duration-200 bg-gray-700 hover:bg-gray-600 text-gray-200"
                    title={isPreviewVisible ? 'Hide file preview' : 'Show file preview'}
                >
                    {isPreviewVisible ? <PanelCloseIcon className="w-4 h-4" /> : <PanelOpenIcon className="w-4 h-4" />}
                </button>
              </div>
            </div>
             {error && (
                <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-md mb-4">
                    <h3 className="font-bold">Analysis Failed</h3>
                    <p className="text-sm">{error}</p>
                </div>
            )}
            <div className="overflow-y-auto flex-grow -mr-2 pr-2">
              <table className="w-full text-left">
                  <thead className="sticky top-0 bg-gray-800/90 backdrop-blur-sm z-10">
                      <tr>
                          <th className="p-3 w-32 font-semibold text-sm text-gray-400">Language</th>
                          <th className="p-3 font-semibold text-sm text-gray-400">Value</th>
                          <th className="p-3 w-2/5 font-semibold text-sm text-gray-400">AI Analysis</th>
                      </tr>
                  </thead>
                  <tbody>
                  {files.map((file, index) => {
                      const value = getValueByPath(file.data, selectedKey);
                      const lineNumber = getLineNumber(file.data, selectedKey);
                      const handleSave = (newValue: any) => onUpdateValue(file.name, selectedKey, newValue);
                      const isActive = index === previewFileIndex;
                      
                      const rowClasses = [
                          'group', 'cursor-pointer', 'transition-colors', 'duration-200',
                          isActive ? 'bg-gray-700/50' : 'hover:bg-gray-700/30'
                      ].join(' ');
                      
                      const isPolishReference = file.name === polishFile?.name;
                      const isEnglishReference = file.name === englishFile?.name;
                      const analysis = analysisMap.get(file.name);

                      return (
                          <tr 
                              key={file.name} 
                              onClick={() => setPreviewFileIndex(index)}
                              className={rowClasses}
                          >
                            <td className={`p-3 w-32 align-top ${isActive ? 'border-l-2 border-teal-500' : 'border-l-2 border-transparent'}`}>
                              <div className="flex flex-col">
                                <span className="font-bold text-sm truncate text-gray-400" title={file.name}>{file.name}</span>
                                <span className="text-xs font-mono text-gray-500 mt-1">
                                    {lineNumber !== null ? `L${lineNumber}` : 'N/A'}
                                </span>
                              </div>
                            </td>
                            <td className="p-3 align-top">
                              <ValueDisplay value={value} onSave={handleSave} />
                            </td>
                            <td className="p-3 align-top text-sm">
                                {isLoading && !isPolishReference && !isEnglishReference && (
                                    <div className="flex items-center space-x-2 text-gray-400">
                                        <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                                        <span>Analyzing...</span>
                                    </div>
                                )}
                                {(isPolishReference || isEnglishReference) && (
                                    <div className="text-xs text-gray-500 italic">
                                        {isEnglishReference ? 'Primary Reference (EN)' : 'Secondary Reference (PL)'}
                                    </div>
                                )}
                                {analysis && (
                                    <div className="space-y-2">
                                        <div><EvaluationBadge evaluation={analysis.evaluation} /></div>
                                        <p className="text-gray-300">{analysis.feedback}</p>
                                        {analysis.suggestion && analysis.suggestion.trim() !== '' && (
                                            <div className="mt-2 p-2 bg-gray-900/50 rounded-md border border-gray-700">
                                                <p className="text-xs text-gray-400 mb-1">Suggestion:</p>
                                                <p className="font-mono text-teal-300 text-xs mb-2">"{analysis.suggestion}"</p>
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onUpdateValue(file.name, selectedKey, analysis.suggestion);
                                                    }}
                                                    className="text-xs bg-teal-700 hover:bg-teal-600 text-white font-semibold py-1 px-2 rounded-md transition-colors"
                                                >
                                                    Apply Suggestion
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </td>
                          </tr>
                      );
                  })}
                  </tbody>
              </table>
            </div>
        </div>
        
        <div className={`hidden ${isPreviewVisible ? 'lg:flex' : 'lg:hidden'} flex-col animate-fade-in overflow-hidden`}>
            <h3 className="text-md font-semibold text-gray-300 mb-3">File Preview: <span className="font-bold text-teal-400">{previewFile?.name}</span></h3>
            {previewFile ? (
                <JsonFileViewer jsonData={previewFile.data} selectedKey={selectedKey} />
            ) : (
                <div className="flex items-center justify-center h-full bg-gray-900/70 rounded-lg border border-gray-700">
                    <p className="text-gray-500">Select a language to preview the file.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};