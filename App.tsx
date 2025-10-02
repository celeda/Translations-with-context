import React, { useState, useMemo } from 'react';
import type { TranslationFile, Glossary, TranslationHistory, TranslationGroup } from './types';
import { flattenObjectKeys, setValueByPath, getValueByPath } from './services/translationService';
import { FileUploader } from './components/FileUploader';
import { TranslationKeyList } from './components/TranslationKeyList';
import { TranslationView } from './components/TranslationView';
import { GlossaryModal } from './components/GlossaryModal';
import { ValueSearchPanel } from './components/ValueSearchPanel';
import { ValueSearchResultsView } from './components/ValueSearchResultsView';
import { GroupsView } from './components/GroupsView';
import { LogoIcon, DownloadIcon, BookOpenIcon, ListBulletIcon, SearchIcon, CollectionIcon } from './components/Icons';

// Declare JSZip and saveAs for TypeScript since they are loaded from script tags
declare var JSZip: any;
declare var saveAs: any;

type ActiveView = 'keys' | 'search' | 'groups';

const App: React.FC = () => {
  const [translationFiles, setTranslationFiles] = useState<TranslationFile[]>([]);
  const [contexts, setContexts] = useState<Record<string, any>>({});
  const [globalContext, setGlobalContext] = useState<Glossary>({});
  const [translationHistory, setTranslationHistory] = useState<TranslationHistory>({});
  const [translationGroups, setTranslationGroups] = useState<TranslationGroup[]>([]);
  const [allKeys, setAllKeys] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isGlossaryOpen, setIsGlossaryOpen] = useState(false);
  
  const [activeView, setActiveView] = useState<ActiveView>('keys');
  const [searchQuery, setSearchQuery] = useState<{ term: string; lang: string } | null>(null);
  const [searchResults, setSearchResults] = useState<string[]>([]);

  const handleFilesUpload = (uploadResult: { translationFiles: TranslationFile[], contexts: Record<string, string>, glossary: Glossary, history: TranslationHistory, groups: TranslationGroup[] }) => {
    setTranslationFiles(uploadResult.translationFiles);
    setContexts(uploadResult.contexts);
    setGlobalContext(uploadResult.glossary);
    setTranslationHistory(uploadResult.history);
    setTranslationGroups(uploadResult.groups);

    const uploadedFiles = uploadResult.translationFiles;
    if (uploadedFiles.length > 0) {
      const allKeysSet = new Set<string>();
      uploadedFiles.forEach(file => {
        flattenObjectKeys(file.data).forEach(key => allKeysSet.add(key));
      });
      const sortedKeys = Array.from(allKeysSet).sort();
      setAllKeys(sortedKeys);
      setSelectedKey(sortedKeys[0] || null);
      // Reset search state on new upload
      setActiveView('keys');
      setSearchResults([]);
      setSearchQuery(null);
    } else {
      setAllKeys([]);
      setSelectedKey(null);
    }
  };

  const handleUpdateValueAndHistory = (fileName: string, key: string, newValue: any) => {
    // Update the main translation file data
    setTranslationFiles(prevFiles => {
      return prevFiles.map(file => {
        if (file.name === fileName) {
          const newData = setValueByPath(file.data, key, newValue);
          return { ...file, data: newData };
        }
        return file;
      });
    });

    // Update the translation history with the user's manual override
    setTranslationHistory(prevHistory => {
      const newHistoryForKey = { ...prevHistory[key], [fileName]: newValue };
      return { ...prevHistory, [key]: newHistoryForKey };
    });
  };


  const handleUpdateContext = (key: string, newContext: string) => {
    setContexts(prevContexts => {
      const currentValue = getValueByPath(prevContexts, key);
      if (currentValue === newContext) {
        return prevContexts;
      }
      const newContexts = setValueByPath(prevContexts, key, newContext);
      return newContexts;
    });
  };

  const handleValueSearch = (term: string, lang: string) => {
    if (!term || !lang) {
      setSearchResults([]);
      setSearchQuery(null);
      return;
    }

    const sourceFile = translationFiles.find(f => f.name === lang);
    if (!sourceFile) return;

    const results = allKeys.filter(key => {
      const value = getValueByPath(sourceFile.data, key);
      return value && typeof value === 'string' && value.toLowerCase().includes(term.toLowerCase());
    });

    setSearchQuery({ term, lang });
    setSearchResults(results);
    setActiveView('search'); // Switch view to show results
  };

  const handleDownloadFiles = async () => {
    if (translationFiles.length === 0) return;

    try {
      const zip = new JSZip();

      translationFiles.forEach(file => {
        const jsonString = JSON.stringify(file.data, null, 2);
        zip.file(`${file.name}.json`, jsonString);
      });

      if (Object.keys(contexts).length > 0) {
        const contextString = JSON.stringify(contexts, null, 2);
        zip.file('context.json', contextString);
      }
      
      if (Object.keys(globalContext).length > 0) {
        const glossaryString = JSON.stringify(globalContext, null, 2);
        zip.file('glossary.json', glossaryString);
      }
      
      if (Object.keys(translationHistory).length > 0) {
        const historyString = JSON.stringify(translationHistory, null, 2);
        zip.file('history.json', historyString);
      }

      if (translationGroups.length > 0) {
          const groupsString = JSON.stringify(translationGroups, null, 2);
          zip.file('groups.json', groupsString);
      }
      
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, 'translations.zip');

    } catch (error) {
      console.error("Failed to generate or download zip file:", error);
      alert("An error occurred while creating the zip file. Please check the console for details.");
    }
  };

  const hasFiles = useMemo(() => translationFiles.length > 0, [translationFiles]);

  const mainContent = () => {
    switch (activeView) {
      case 'keys':
        return selectedKey ? (
          <TranslationView 
              files={translationFiles}
              selectedKey={selectedKey}
              onUpdateValue={handleUpdateValueAndHistory}
              context={getValueByPath(contexts, selectedKey) || ''}
              onUpdateContext={(newContext) => handleUpdateContext(selectedKey, newContext)}
              globalContext={globalContext}
              onUpdateGlossary={setGlobalContext}
              translationHistory={translationHistory}
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-800/30 rounded-lg m-8">
            <p className="text-gray-500">Select a key from the left to see translations.</p>
          </div>
        );
      case 'search':
        return (
          <ValueSearchResultsView
              keys={searchResults}
              searchQuery={searchQuery}
              files={translationFiles}
              contexts={contexts}
              globalContext={globalContext}
              translationHistory={translationHistory}
              onUpdateValue={handleUpdateValueAndHistory}
              onUpdateContext={handleUpdateContext}
              onUpdateGlossary={setGlobalContext}
          />
        );
      case 'groups':
        return (
           <GroupsView
                allKeys={allKeys}
                files={translationFiles}
                contexts={contexts}
                globalContext={globalContext}
                translationHistory={translationHistory}
                groups={translationGroups}
                onUpdateGroups={setTranslationGroups}
                onUpdateValue={handleUpdateValueAndHistory}
                onUpdateContext={handleUpdateContext}
                onUpdateGlossary={setGlobalContext}
            />
        );
      default:
        return (
            <div className="flex items-center justify-center h-full bg-gray-800/30 rounded-lg m-8">
                <p className="text-gray-500">Select a view from the left panel.</p>
            </div>
        );
    }
  };


  return (
    <>
      <GlossaryModal 
        isOpen={isGlossaryOpen}
        onClose={() => setIsGlossaryOpen(false)}
        glossary={globalContext}
        onUpdateGlossary={setGlobalContext}
        languages={translationFiles.map(f => f.name)}
      />
      <div className="bg-gray-900 text-gray-200 flex flex-col h-full">
          {!hasFiles ? (
            <main className="flex-grow flex items-center justify-center p-4">
              <div className="max-w-md w-full text-center">
                <div className="flex items-center justify-center space-x-3 mb-6">
                    <LogoIcon className="h-10 w-10 text-teal-400" />
                    <h1 className="text-3xl font-bold text-gray-100">Translation AI Assistant</h1>
                </div>
                <p className="text-gray-400 mb-8">Start by uploading your JSON translation files and `context.json`. You can also include `glossary.json`, `history.json` and `groups.json`.</p>
                <FileUploader onFilesUploaded={handleFilesUpload} />
              </div>
            </main>
          ) : (
            <div className="flex h-full w-full">
              <aside className="w-96 flex-shrink-0 bg-gray-800/50 border-r border-gray-700 flex flex-col h-full">
                <div className="p-4 border-b border-gray-700 flex-shrink-0">
                    <div className="flex items-center space-x-3">
                        <LogoIcon className="h-8 w-8 text-teal-400" />
                        <h1 className="text-xl font-bold text-gray-100 truncate">Translation AI Assistant</h1>
                    </div>
                </div>
                <div className="p-4 border-b border-gray-700 flex flex-col gap-4 flex-shrink-0">
                    <FileUploader onFilesUploaded={handleFilesUpload} compact={true} />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                          onClick={handleDownloadFiles}
                          className="w-full flex items-center justify-center space-x-2 text-sm bg-teal-600 hover:bg-teal-500 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
                      >
                          <DownloadIcon className="w-5 h-5" />
                          <span>Download ZIP</span>
                      </button>
                      <button
                          onClick={() => setIsGlossaryOpen(true)}
                          className="w-full flex items-center justify-center space-x-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium py-2 px-4 rounded-md transition-colors duration-200"
                      >
                          <BookOpenIcon className="w-5 h-5" />
                          <span>Glossary</span>
                      </button>
                    </div>
                </div>
                <div className="flex border-b border-gray-700 flex-shrink-0">
                    <button
                        onClick={() => setActiveView('keys')}
                        className={`flex-1 flex items-center justify-center space-x-2 p-3 text-sm font-medium transition-colors ${activeView === 'keys' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}
                    >
                        <ListBulletIcon className="w-5 h-5" />
                        <span>Keys</span>
                    </button>
                    <button
                        onClick={() => setActiveView('search')}
                        className={`flex-1 flex items-center justify-center space-x-2 p-3 text-sm font-medium transition-colors ${activeView === 'search' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}
                    >
                        <SearchIcon className="w-5 h-5" />
                        <span>Search</span>
                    </button>
                     <button
                        onClick={() => setActiveView('groups')}
                        className={`flex-1 flex items-center justify-center space-x-2 p-3 text-sm font-medium transition-colors ${activeView === 'groups' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}
                    >
                        <CollectionIcon className="w-5 h-5" />
                        <span>Groups</span>
                    </button>
                </div>

                {activeView === 'keys' ? (
                  <TranslationKeyList 
                    keys={allKeys} 
                    onSelectKey={setSelectedKey}
                    selectedKey={selectedKey}
                  />
                ) : activeView === 'search' ? (
                  <ValueSearchPanel 
                    onSearch={handleValueSearch}
                    languages={translationFiles.map(f => f.name)}
                  />
                ) : null}
                {/* Groups view has its own sidebar */}
                {activeView !== 'groups' && activeView !== 'keys' && activeView !== 'search' && (
                     <div className="p-4 text-center text-gray-500 text-sm">
                        Select a view.
                    </div>
                )}
              </aside>
              <main className="flex-1 overflow-hidden">
                {mainContent()}
              </main>
            </div>
          )}
      </div>
    </>
  );
};

export default App;