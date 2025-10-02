import React, { useState, useEffect } from 'react';
import type { Glossary } from '../types';
import { BookOpenIcon, CloseIcon, CheckIcon, EditIcon, TrashIcon, PlusCircleIcon } from './Icons';

interface GlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  glossary: Glossary;
  onUpdateGlossary: (glossary: Glossary) => void;
}

export const GlossaryModal: React.FC<GlossaryModalProps> = ({ isOpen, onClose, glossary, onUpdateGlossary }) => {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editedValue, setEditedValue] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setEditingKey(null);
      setError(null);
      setNewKey('');
      setNewValue('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleEdit = (key: string, value: string) => {
    setEditingKey(key);
    setEditedValue(value);
  };

  const handleSave = (key: string) => {
    const newGlossary = { ...glossary, [key]: editedValue };
    onUpdateGlossary(newGlossary);
    setEditingKey(null);
  };

  const handleDelete = (key: string) => {
    const { [key]: _, ...newGlossary } = glossary;
    onUpdateGlossary(newGlossary);
  };

  const handleAdd = () => {
    if (!newKey.trim()) {
        setError('Source term cannot be empty.');
        return;
    }
    if (glossary.hasOwnProperty(newKey)) {
        setError('This term already exists in the glossary.');
        return;
    }
    setError(null);
    onUpdateGlossary({ ...glossary, [newKey.trim()]: newValue.trim() });
    setNewKey('');
    setNewValue('');
  };


  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <BookOpenIcon className="w-6 h-6 text-teal-400" />
            <h2 className="text-lg font-semibold text-white">Translation Glossary</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition">
            <CloseIcon className="w-5 h-5" />
          </button>
        </header>
        
        <div className="p-6 overflow-y-auto flex-grow">
          <div className="space-y-4">
             {Object.keys(glossary).length === 0 ? (
                <div className="text-center text-gray-500 py-10">
                    <p>Your glossary is empty.</p>
                    <p className="text-sm mt-1">Add new terms below to ensure translation consistency.</p>
                </div>
            ) : (
                <table className="w-full text-left">
                    <thead>
                        <tr>
                            <th className="p-2 font-semibold text-sm text-gray-400">Source Term (PL)</th>
                            <th className="p-2 font-semibold text-sm text-gray-400">Translation/Note</th>
                            <th className="p-2 w-28 font-semibold text-sm text-gray-400">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(glossary).map(([key, value]) => (
                            <tr key={key} className="border-b border-gray-700 last:border-b-0">
                                {editingKey === key ? (
                                    <>
                                        <td className="p-2 text-sm text-gray-300">{key}</td>
                                        <td className="p-2">
                                            <input 
                                                type="text"
                                                value={editedValue}
                                                onChange={e => setEditedValue(e.target.value)}
                                                className="w-full bg-gray-900 border border-gray-600 rounded-md py-1 px-2 text-gray-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition"
                                            />
                                        </td>
                                        <td className="p-2">
                                            <div className="flex space-x-2">
                                                <button onClick={() => handleSave(key)} className="p-1.5 rounded-md bg-teal-600 hover:bg-teal-500 text-white transition-colors" title="Save">
                                                    <CheckIcon className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => setEditingKey(null)} className="p-1.5 rounded-md bg-gray-600 hover:bg-gray-500 text-white transition-colors" title="Cancel">
                                                    <CloseIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td className="p-2 text-sm font-semibold text-gray-300">{key}</td>
                                        {/* FIX: Explicitly convert value to string to handle `unknown` type from Object.entries */}
                                        <td className="p-2 text-sm text-gray-400">{String(value)}</td>
                                        <td className="p-2">
                                            <div className="flex space-x-2">
                                                {/* FIX: Explicitly convert value to string to match `handleEdit` signature */}
                                                <button onClick={() => handleEdit(key, String(value))} className="p-1.5 rounded-md bg-gray-700/80 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors" title="Edit">
                                                    <EditIcon className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDelete(key)} className="p-1.5 rounded-md bg-gray-700/80 hover:bg-red-600/50 text-gray-300 hover:text-red-300 transition-colors" title="Delete">
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
          </div>
        </div>
        <footer className="p-4 border-t border-gray-700 bg-gray-800/50 flex-shrink-0">
            <h3 className="text-md font-semibold text-gray-200 mb-3">Add New Entry</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <input 
                    type="text"
                    placeholder="Source Term (e.g., in Polish)"
                    value={newKey}
                    onChange={(e) => { setNewKey(e.target.value); setError(null); }}
                    className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-gray-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition"
                />
                <input 
                    type="text"
                    placeholder="Translation or Note"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-gray-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition"
                />
            </div>
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
            <button 
                onClick={handleAdd}
                className="w-full mt-3 flex items-center justify-center space-x-2 text-sm bg-teal-600 hover:bg-teal-500 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
            >
                <PlusCircleIcon className="w-5 h-5"/>
                <span>Add to Glossary</span>
            </button>
        </footer>
      </div>
    </div>
  );
};
