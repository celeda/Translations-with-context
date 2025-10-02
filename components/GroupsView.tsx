import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { TranslationFile, Glossary, TranslationHistory, TranslationGroup, AIAnalysisResult } from '../types';
import { getValueByPath } from '../services/translationService';
import { analyzeTranslations, buildAnalysisPrompt } from '../services/aiService';
import { SearchIcon, PlusCircleIcon, SparklesIcon, CollectionIcon, TrashIcon, EditIcon, StarIcon, CodeBracketIcon } from './Icons';
import { TranslationAnalysisCard } from './TranslationAnalysisCard';
import { PromptViewerModal } from './PromptViewerModal';

interface GroupsViewProps {
    allKeys: string[];
    files: TranslationFile[];
    contexts: Record<string, any>;
    globalContext: Glossary;
    translationHistory: TranslationHistory;
    groups: TranslationGroup[];
    onUpdateGroups: (groups: TranslationGroup[]) => void;
    onUpdateValue: (fileName: string, key: string, newValue: any) => void;
    onUpdateContext: (key: string, newContext: string) => void;
    onUpdateGlossary: (glossary: Glossary) => void;
}

const polishFileFinder = (f: TranslationFile) => f.name.toLowerCase().includes('pl') || f.name.toLowerCase().includes('polish');

export const GroupsView: React.FC<GroupsViewProps> = (props) => {
    const { allKeys, files, contexts, groups, onUpdateGroups } = props;
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
    
    // State for creating/editing a group
    const [formState, setFormState] = useState({
        name: '',
        context: '',
        searchQuery: '',
        selectedKeys: new Set<string>(),
        referenceKeys: new Set<string>(),
    });
    
    // State for viewing/analyzing a group
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisData, setAnalysisData] = useState<Record<string, {
        result: AIAnalysisResult | null;
        error: string | null;
    }>>({});
    
    const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
    const [generatedPrompt, setGeneratedPrompt] = useState('');
    const [promptModalSubtitle, setPromptModalSubtitle] = useState('');

    const polishFile = useMemo(() => files.find(polishFileFinder), [files]);

    useEffect(() => {
        if (mode === 'list') {
            if (groups.length > 0 && !groups.some(g => g.id === selectedGroupId)) {
                setSelectedGroupId(groups[0].id);
            } else if (groups.length === 0) {
                setSelectedGroupId(null);
            }
        }
    }, [groups, selectedGroupId, mode]);

    const resetForm = () => {
        setFormState({
            name: '', context: '', searchQuery: '',
            selectedKeys: new Set(), referenceKeys: new Set(),
        });
    };

    const handleStartCreating = () => {
        resetForm();
        setMode('create');
    };
    
    const handleStartEditing = (group: TranslationGroup) => {
        setFormState({
            name: group.name,
            context: group.context,
            searchQuery: '',
            selectedKeys: new Set(group.keys),
            referenceKeys: new Set(group.referenceKeys),
        });
        setSelectedGroupId(group.id);
        setMode('edit');
    };

    const handleCancelForm = () => {
        resetForm();
        setMode('list');
    };
    
    const handleSelectGroup = (groupId: string) => {
        setSelectedGroupId(groupId);
        setAnalysisData({});
        setIsAnalyzing(false);
        setMode('list');
    };

    const handleDeleteGroup = (groupId: string) => {
        const updatedGroups = groups.filter(g => g.id !== groupId);
        onUpdateGroups(updatedGroups);
        if (selectedGroupId === groupId) {
            setSelectedGroupId(updatedGroups.length > 0 ? updatedGroups[0].id : null);
        }
    };
    
    const handleSaveGroup = () => {
        const { name, context, selectedKeys, referenceKeys } = formState;
        if (!name.trim() || !context.trim() || selectedKeys.size === 0) {
            alert("Group name, context, and at least one selected key are required.");
            return;
        }

        if (mode === 'create') {
            const newGroup: TranslationGroup = {
                id: String(Date.now()),
                name: name.trim(),
                context: context.trim(),
                keys: Array.from(selectedKeys),
                referenceKeys: Array.from(referenceKeys),
            };
            onUpdateGroups([...groups, newGroup]);
            handleSelectGroup(newGroup.id);
        } else if (mode === 'edit' && selectedGroupId) {
            const updatedGroups = groups.map(g => 
                g.id === selectedGroupId ? {
                    ...g,
                    name: name.trim(),
                    context: context.trim(),
                    keys: Array.from(selectedKeys),
                    referenceKeys: Array.from(referenceKeys),
                } : g
            );
            onUpdateGroups(updatedGroups);
            handleSelectGroup(selectedGroupId);
        }
    };

    const searchResults = useMemo(() => {
        const query = formState.searchQuery.trim();
        const baseKeys = mode === 'edit' ? Array.from(formState.selectedKeys) : allKeys;
        if (!query) return mode === 'edit' ? baseKeys : [];

        const lowercasedQuery = query.toLowerCase();
        
        return allKeys.filter(key => {
            if (mode === 'edit' && formState.selectedKeys.has(key)) return true;

            const keyMatch = key.toLowerCase().includes(lowercasedQuery);
            if (keyMatch) return true;

            if (polishFile) {
                const value = getValueByPath(polishFile.data, key);
                if (typeof value === 'string' && value.toLowerCase().includes(lowercasedQuery)) {
                    return true;
                }
            }
            return false;
        });
    }, [formState.searchQuery, formState.selectedKeys, allKeys, polishFile, mode]);
    
    const toggleKeySelection = (key: string) => {
        const newSelected = new Set(formState.selectedKeys);
        const newReferences = new Set(formState.referenceKeys);
        if (newSelected.has(key)) {
            newSelected.delete(key);
            newReferences.delete(key); // Also remove from references if deselected
        } else {
            newSelected.add(key);
        }
        setFormState(s => ({ ...s, selectedKeys: newSelected, referenceKeys: newReferences }));
    };
    
    const toggleReferenceKey = (key: string) => {
        const newReferences = new Set(formState.referenceKeys);
        if (newReferences.has(key)) {
            newReferences.delete(key);
        } else {
             // A key must be selected to be a reference
            if (formState.selectedKeys.has(key)) {
                newReferences.add(key);
            }
        }
        setFormState(s => ({ ...s, referenceKeys: newReferences }));
    };

    const handleShowPrompt = (group: TranslationGroup) => {
        if (group.keys.length === 0) return;
        const sampleKey = group.keys[0];
        
        if (!polishFile) return;
        const englishFile = props.files.find(f => f.name.toLowerCase().includes('en') || f.name.toLowerCase().includes('english'));

        const referenceTranslations = group.referenceKeys.map(refKey => ({
            key: refKey,
            translations: files.map(f => ({ lang: f.name, value: String(getValueByPath(f.data, refKey) || '') }))
        }));
        
        const polishValue = String(getValueByPath(polishFile.data, sampleKey) || '');
        const englishTranslation = englishFile ? { lang: englishFile.name, value: String(getValueByPath(englishFile.data, sampleKey) || '') } : null;
        const otherTranslations = props.files
            .filter(f => f.name !== polishFile.name && f.name !== englishFile?.name)
            .map(f => ({ lang: f.name, value: String(getValueByPath(f.data, sampleKey) || '') }));
            
        const prompt = buildAnalysisPrompt(
            sampleKey, group.context, { lang: polishFile.name, value: polishValue }, englishTranslation, otherTranslations,
            props.globalContext, props.translationHistory, referenceTranslations
        );

        setGeneratedPrompt(prompt);
        setPromptModalSubtitle(`This is an example prompt for the first key in the group: '${sampleKey}'`);
        setIsPromptModalOpen(true);
    };

    const handleAnalyzeGroup = async (group: TranslationGroup) => {
        setIsAnalyzing(true);
        setAnalysisData({});

        if (!polishFile) {
            alert("Polish reference file not found.");
            setIsAnalyzing(false);
            return;
        }

        const englishFile = props.files.find(f => f.name.toLowerCase().includes('en') || f.name.toLowerCase().includes('english'));
        
        const referenceTranslations = group.referenceKeys.map(refKey => ({
            key: refKey,
            translations: files.map(f => ({ lang: f.name, value: String(getValueByPath(f.data, refKey) || '') }))
        }));

        const analysisPromises = group.keys.map(key => {
            const polishValue = String(getValueByPath(polishFile.data, key) || '');
            const englishTranslation = englishFile ? { lang: englishFile.name, value: String(getValueByPath(englishFile.data, key) || '') } : null;
            const otherTranslations = props.files
                .filter(f => f.name !== polishFile.name && f.name !== englishFile?.name)
                .map(f => ({ lang: f.name, value: String(getValueByPath(f.data, key) || '') }));
            
            return analyzeTranslations(
                key, group.context, { lang: polishFile.name, value: polishValue }, englishTranslation, otherTranslations,
                props.globalContext, props.translationHistory, referenceTranslations
            )
            .then(result => ({ key, status: 'fulfilled', value: result }))
            .catch(error => ({ key, status: 'rejected', reason: error as Error }));
        });
        
        const results = await Promise.all(analysisPromises);
        const newAnalysisData: typeof analysisData = {};

        for (const result of results) {
            if (!result) continue;
            if (!newAnalysisData[result.key]) {
                newAnalysisData[result.key] = { result: null, error: null };
            }
// FIX: Using property existence check ('in' operator) to safely narrow the union type.
// This is more robust if type inference for the discriminated union on 'status' fails.
            if (result.status === 'fulfilled' && 'value' in result) {
                 newAnalysisData[result.key].result = result.value;
            } else if ('reason' in result) {
                 newAnalysisData[result.key].error = (result.reason as Error).message;
            }
        }
        setAnalysisData(newAnalysisData);
        setIsAnalyzing(false);
    };

    const renderGroupList = () => (
        <aside className="w-96 flex-shrink-0 bg-gray-800/50 border-r border-gray-700 flex flex-col h-full">
            <div className="p-4 border-b border-gray-700">
                <button onClick={handleStartCreating} className="w-full flex items-center justify-center space-x-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 px-4 rounded-md transition-colors">
                    <PlusCircleIcon className="w-5 h-5"/>
                    <span>Create New Group</span>
                </button>
            </div>
            <div className="flex-grow overflow-y-auto">
                {groups.length > 0 ? (
                    <ul>
                        {groups.map(group => (
                            <li key={group.id}>
                                <button
                                    onClick={() => handleSelectGroup(group.id)}
                                    className={`w-full text-left px-4 py-3 text-sm transition-colors duration-150 group flex justify-between items-center ${
                                        selectedGroupId === group.id && mode === 'list'
                                        ? 'bg-teal-500/20 text-teal-300 font-semibold'
                                        : 'text-gray-300 hover:bg-gray-700/50'
                                    }`}
                                >
                                    <span className="truncate pr-2">{group.name}</span>
                                    <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-xs bg-gray-700 rounded-full px-2 py-0.5 opacity-100 group-hover:opacity-0">{group.keys.length}</span>
                                        <EditIcon
                                            onClick={(e) => { e.stopPropagation(); handleStartEditing(group); }}
                                            className="w-4 h-4 text-gray-400 hover:text-teal-400"
                                        />
                                        <TrashIcon 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                                            className="w-4 h-4 text-gray-400 hover:text-red-400"
                                        />
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="p-4 text-center text-gray-500 text-sm mt-4">No groups created yet.</div>
                )}
            </div>
        </aside>
    );

    const renderContent = () => {
        if (mode === 'create' || mode === 'edit') {
            return renderGroupForm();
        }

        const selectedGroup = groups.find(g => g.id === selectedGroupId);
        if (selectedGroup) {
            return renderViewGroup(selectedGroup);
        }

        return (
            <div className="flex items-center justify-center h-full text-center">
                <div>
                    <CollectionIcon className="w-16 h-16 mx-auto text-gray-600"/>
                    <h2 className="mt-4 text-xl font-semibold text-gray-300">Context Groups</h2>
                    <p className="mt-2 text-gray-500">Select a group from the list or create a new one to begin.</p>
                </div>
            </div>
        );
    };
    
    const renderGroupForm = () => (
        <div className="flex flex-col h-full bg-gray-900">
            <div className="p-4 border-b border-gray-700 bg-gray-800/50 space-y-4 flex-shrink-0">
                <h2 className="text-lg font-semibold text-gray-100">{mode === 'create' ? 'Create a New Context Group' : `Editing Group: ${formState.name}`}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="text" placeholder="Group Name*" value={formState.name} onChange={e => setFormState(s=>({...s, name: e.target.value}))} className="bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-gray-200" />
                    <input type="text" placeholder="Group Context*" value={formState.context} onChange={e => setFormState(s=>({...s, context: e.target.value}))} className="bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-gray-200" />
                </div>
                 <div className="relative">
                    <input type="text" placeholder="Search to add/filter keys..." value={formState.searchQuery} onChange={e => setFormState(s=>({...s, searchQuery: e.target.value}))} className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 pl-10 pr-4 text-gray-200"/>
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><SearchIcon className="h-5 w-5 text-gray-400" /></div>
                </div>
            </div>
            <div className="flex-grow overflow-y-auto">
                <table className="w-full text-sm text-left">
                    <thead className="sticky top-0 bg-gray-800 z-10">
                        <tr>
                            <th className="p-2 w-12 text-center"><input type="checkbox" className="rounded" onChange={(e) => setFormState(s => ({...s, selectedKeys: e.target.checked ? new Set(searchResults) : new Set()}))} checked={searchResults.length > 0 && formState.selectedKeys.size >= searchResults.length}/></th>
                            <th className="p-2 w-12 text-center">Ref</th>
                            <th className="p-2">Key</th>
                            <th className="p-2">Polish Value</th>
                            <th className="p-2">Key Context</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/50">
                        {searchResults.map(key => (
                            <tr key={key} className={`transition-colors ${formState.selectedKeys.has(key) ? 'bg-teal-900/20' : 'hover:bg-gray-800/50'}`}>
                                <td className="p-2 text-center"><input type="checkbox" className="rounded" checked={formState.selectedKeys.has(key)} onChange={() => toggleKeySelection(key)}/></td>
                                <td className="p-2 text-center">
                                    <button onClick={() => toggleReferenceKey(key)} disabled={!formState.selectedKeys.has(key)} className="disabled:opacity-20 disabled:cursor-not-allowed">
                                        <StarIcon className={`w-5 h-5 transition-colors ${formState.referenceKeys.has(key) ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-500'}`} />
                                    </button>
                                </td>
                                <td className="p-2 font-mono text-teal-300">{key}</td>
                                <td className="p-2 text-gray-300">{polishFile ? String(getValueByPath(polishFile.data, key) || 'N/A') : 'N/A'}</td>
                                <td className="p-2 text-gray-400 italic">
                                    <input type="text" value={getValueByPath(contexts, key) || ''} onChange={(e) => props.onUpdateContext(key, e.target.value)} className="w-full bg-transparent p-1 border border-transparent hover:border-gray-600 focus:border-teal-500 rounded"/>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {formState.searchQuery && searchResults.length === 0 && <p className="p-4 text-center text-gray-500">No results found.</p>}
            </div>
             <div className="p-4 border-t border-gray-700 flex-shrink-0 bg-gray-800/50 flex justify-between items-center">
                <p className="text-sm text-gray-400">{formState.selectedKeys.size} key(s) selected, {formState.referenceKeys.size} as reference(s)</p>
                <div className="flex space-x-2">
                    <button onClick={handleCancelForm} className="bg-gray-600 hover:bg-gray-500 text-white font-medium py-2 px-4 rounded-md">Cancel</button>
                    <button onClick={handleSaveGroup} disabled={!formState.name || formState.selectedKeys.size === 0} className="bg-teal-600 hover:bg-teal-500 text-white font-medium py-2 px-4 rounded-md disabled:bg-gray-600">Save Group</button>
                </div>
            </div>
        </div>
    );

    const renderViewGroup = (group: TranslationGroup) => (
         <div className="flex flex-col h-full">
            <PromptViewerModal
                isOpen={isPromptModalOpen}
                onClose={() => setIsPromptModalOpen(false)}
                prompt={generatedPrompt}
                title="Sample AI Prompt"
                subtitle={promptModalSubtitle}
            />
            <div className="p-4 border-b border-gray-700 flex-shrink-0 bg-gray-800/50 space-y-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-100">
                            Group: <span className="text-teal-400">{group.name}</span> ({group.keys.length} keys)
                        </h2>
                        <div className="flex items-center space-x-2 mt-2">
                            {group.referenceKeys.map(key => (
                                <div key={key} className="flex items-center space-x-1 bg-yellow-900/50 text-yellow-300 text-xs font-semibold px-2 py-1 rounded-full" title="Reference Key">
                                    <StarIcon className="w-3 h-3"/>
                                    <span>{key}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <button onClick={() => handleStartEditing(group)} className="flex items-center space-x-2 text-sm bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-3 rounded-md transition-colors">
                        <EditIcon className="w-4 h-4" />
                        <span>Edit Group</span>
                    </button>
                </div>
                <div className="flex items-end justify-between gap-4">
                    <div className="flex-grow space-y-2">
                         <p className="text-sm text-gray-400 bg-gray-900 p-2 rounded-md border border-gray-700">
                           <span className="font-semibold text-gray-300">Context: </span> "{group.context}"
                        </p>
                    </div>
                    <div className="flex items-end space-x-2">
                         <button
                            onClick={() => handleShowPrompt(group)}
                            disabled={isAnalyzing}
                            className="p-2 text-sm bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-md transition-colors disabled:bg-gray-600"
                            title="Show sample prompt"
                        >
                            <CodeBracketIcon className="w-5 h-5"/>
                        </button>
                        <button 
                            onClick={() => handleAnalyzeGroup(group)}
                            disabled={isAnalyzing}
                            className="flex items-center space-x-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:bg-gray-600"
                        >
                            <SparklesIcon className="w-5 h-5"/>
                            <span>{isAnalyzing ? 'Analyzing...' : 'Analyze Group'}</span>
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex-grow overflow-y-auto p-4 lg:p-6 space-y-6 bg-gray-900">
                {group.keys.map(key => {
                    const keyAnalysis = analysisData[key];
                    return (
                        <TranslationAnalysisCard
                            key={key}
                            translationKey={key}
                            files={props.files}
                            context={group.context} 
                            globalContext={props.globalContext}
                            translationHistory={props.translationHistory}
                            onUpdateValue={props.onUpdateValue}
                            onUpdateContext={() => {}}
                            onUpdateGlossary={props.onUpdateGlossary}
                            showFilePreview={false}
                            showAnalysisControls={false}
                            analysisResult={keyAnalysis?.result}
                            error={keyAnalysis?.error}
                            isLoading={isAnalyzing && !keyAnalysis}
                        />
                    );
                })}
            </div>
        </div>
    );

    return (
        <div className="flex h-full w-full">
            {renderGroupList()}
            <main className="flex-1 overflow-hidden">
                {renderContent()}
            </main>
        </div>
    );
};
