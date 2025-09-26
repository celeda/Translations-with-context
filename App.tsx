import React, { useState, useMemo } from 'react';
import type { TranslationFile } from './types';
import { flattenObjectKeys, setValueByPath, getValueByPath } from './services/translationService';
import { FileUploader } from './components/FileUploader';
import { TranslationKeyList } from './components/TranslationKeyList';
import { TranslationView } from './components/TranslationView';
import { LogoIcon, DownloadIcon } from './components/Icons';

// Declare JSZip and saveAs for TypeScript since they are loaded from script tags
declare var JSZip: any;
declare var saveAs: any;

const App: React.FC = () => {
  const [translationFiles, setTranslationFiles] = useState<TranslationFile[]>([]);
  const [contexts, setContexts] = useState<Record<string, any>>({});
  const [allKeys, setAllKeys] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const handleFilesUpload = (uploadResult: { translationFiles: TranslationFile[], contexts: Record<string, string> }) => {
    setTranslationFiles(uploadResult.translationFiles);
    setContexts(uploadResult.contexts);

    const uploadedFiles = uploadResult.translationFiles;
    if (uploadedFiles.length > 0) {
      const allKeysSet = new Set<string>();
      uploadedFiles.forEach(file => {
        flattenObjectKeys(file.data).forEach(key => allKeysSet.add(key));
      });
      const sortedKeys = Array.from(allKeysSet).sort();
      setAllKeys(sortedKeys);
      setSelectedKey(sortedKeys[0] || null);
    } else {
      setAllKeys([]);
      setSelectedKey(null);
    }
  };

  const handleUpdateValue = (fileName: string, key: string, newValue: any) => {
    setTranslationFiles(prevFiles => {
      return prevFiles.map(file => {
        if (file.name === fileName) {
          const newData = setValueByPath(file.data, key, newValue);
          return { ...file, data: newData };
        }
        return file;
      });
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
      
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, 'translations.zip');

    } catch (error) {
      console.error("Failed to generate or download zip file:", error);
      alert("An error occurred while creating the zip file. Please check the console for details.");
    }
  };

  const hasFiles = useMemo(() => translationFiles.length > 0, [translationFiles]);

  return (
    <div className="bg-gray-900 text-gray-200 flex flex-col h-full">
        {!hasFiles ? (
          <main className="flex-grow flex items-center justify-center p-4">
            <div className="max-w-md w-full text-center">
              <div className="flex items-center justify-center space-x-3 mb-6">
                  <LogoIcon className="h-10 w-10 text-teal-400" />
                  <h1 className="text-3xl font-bold text-gray-100">Translation AI Assistant</h1>
              </div>
              <p className="text-gray-400 mb-8">Start by uploading your JSON translation files and the required `context.json` file to compare and analyze them with AI.</p>
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
                  <button
                      onClick={handleDownloadFiles}
                      className="w-full flex items-center justify-center space-x-2 text-sm bg-teal-600 hover:bg-teal-500 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
                  >
                      <DownloadIcon className="w-5 h-5" />
                      <span>Download All as ZIP</span>
                  </button>
              </div>
              <TranslationKeyList 
                keys={allKeys} 
                onSelectKey={setSelectedKey}
                selectedKey={selectedKey}
              />
            </aside>
            <main className="flex-1 overflow-hidden p-4 md:p-6 lg:p-8">
              {selectedKey ? (
                  <TranslationView 
                      files={translationFiles}
                      selectedKey={selectedKey}
                      onUpdateValue={handleUpdateValue}
                      context={getValueByPath(contexts, selectedKey) || ''}
                      onUpdateContext={(newContext) => handleUpdateContext(selectedKey, newContext)}
                  />
              ) : (
                  <div className="flex items-center justify-center h-full bg-gray-800/30 rounded-lg">
                      <p className="text-gray-500">Select a key from the left to see translations.</p>
                  </div>
              )}
            </main>
          </div>
        )}
    </div>
  );
};

export default App;