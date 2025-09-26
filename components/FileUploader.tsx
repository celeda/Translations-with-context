import React, { useState, useCallback } from 'react';
import type { TranslationFile } from '../types';
import { UploadIcon } from './Icons';

interface FileUploaderProps {
  onFilesUploaded: (result: { translationFiles: TranslationFile[], contexts: Record<string, string> }) => void;
  compact?: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFilesUploaded, compact = false }) => {
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFiles = useCallback(async (fileList: FileList) => {
    setError(null);
    const filesArray = Array.from(fileList);
    const translationFiles: TranslationFile[] = [];
    let contexts: Record<string, string> = {};
    const defaultResult = { translationFiles: [], contexts: {} };

    const hasContextJson = filesArray.some(file => file.name === 'context.json');
    if (!hasContextJson) {
      setError('`context.json` is required. Please include it in your upload.');
      onFilesUploaded(defaultResult);
      return;
    }

    const hasTranslationFiles = filesArray.some(file => file.name !== 'context.json' && file.name.endsWith('.json'));
    if (!hasTranslationFiles) {
        setError('Please upload at least one translation file along with `context.json`.');
        onFilesUploaded(defaultResult);
        return;
    }

    for (const file of filesArray) {
      if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        setError(`File "${file.name}" is not a valid JSON file.`);
        onFilesUploaded(defaultResult);
        return;
      }
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (file.name === 'context.json') {
          if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
            contexts = data;
          } else {
            setError(`File "context.json" has an invalid format. It must be a JSON object.`);
            onFilesUploaded(defaultResult);
            return;
          }
        } else {
          const fileName = file.name.replace('.json', '');
          translationFiles.push({ name: fileName, data });
        }
      } catch (err) {
        setError(`Error parsing "${file.name}". Please ensure it's valid JSON.`);
        onFilesUploaded(defaultResult);
        return;
      }
    }
    onFilesUploaded({ translationFiles, contexts });
  }, [onFilesUploaded]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      processFiles(event.target.files);
    }
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      processFiles(event.dataTransfer.files);
    }
  }, [processFiles]);
  
  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragEnter = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  if (compact) {
    return (
        <div>
            <label htmlFor="file-upload-compact" className="w-full flex items-center justify-center cursor-pointer text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium py-2 px-4 rounded-md transition-colors duration-200">
                Upload New Files
            </label>
            <input 
                id="file-upload-compact" 
                type="file" 
                multiple 
                accept=".json" 
                onChange={handleFileChange} 
                className="hidden"
            />
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </div>
    );
  }

  return (
    <div className="w-full">
      <label
        htmlFor="file-upload"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        className={`flex flex-col items-center justify-center w-full h-48 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer transition-colors duration-300 ${isDragging ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700/50'}`}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <UploadIcon className="w-10 h-10 mb-3 text-gray-400" />
          <p className="mb-2 text-sm text-gray-400">
            <span className="font-semibold text-teal-400">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-gray-500">A `context.json` file is required</p>
        </div>
        <input 
          id="file-upload" 
          type="file" 
          multiple 
          accept=".json" 
          onChange={handleFileChange} 
          className="hidden"
        />
      </label>
      {error && <p className="text-red-400 text-sm mt-4 text-center">{error}</p>}
    </div>
  );
};