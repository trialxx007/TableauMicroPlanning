import React, { useState, useRef, useEffect } from 'react';
import { Pencil, Check } from 'lucide-react';

interface EditableItemNameProps {
  value?: string;
  defaultValue: string;
  onSave: (newName: string) => void;
  className?: string;
  prefix?: string;
}

export const EditableItemName: React.FC<EditableItemNameProps> = ({
  value,
  defaultValue,
  onSave,
  className = '',
  prefix,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(value || defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(value || defaultValue);
  }, [value, defaultValue]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    setIsEditing(false);
    const trimmed = text.trim();
    if (trimmed && trimmed !== defaultValue) {
      onSave(trimmed);
    } else {
      // Revert to default
      onSave('');
      setText(defaultValue);
    }
  };

  const displayName = value && value.trim() ? value : defaultValue;

  if (isEditing) {
    return (
      <div className="inline-flex items-center gap-1">
        {prefix && <span className="text-slate-400 font-mono text-xs">{prefix}</span>}
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSave();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setText(displayName);
              setIsEditing(false);
            }
          }}
          onBlur={handleSave}
          placeholder={defaultValue}
          className="text-xs font-bold text-slate-900 bg-white border-2 border-slate-900 rounded px-2 py-1 focus:outline-hidden shadow-xs min-w-[140px] max-w-[220px]"
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="p-1 text-emerald-600 hover:text-emerald-800 rounded cursor-pointer"
          title="Valider"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={`group inline-flex items-center gap-1.5 cursor-pointer py-1 px-1.5 rounded hover:bg-slate-200/80 transition-all ${className}`}
      title="Cliquer pour personnaliser le nom"
    >
      {prefix && <span className="text-slate-400 font-mono text-xs">{prefix}</span>}
      <span className="font-bold text-slate-900 text-xs truncate max-w-[180px] sm:max-w-[240px]">
        {displayName}
      </span>
      <Pencil className="w-3 h-3 text-slate-400 group-hover:text-slate-900 transition-colors opacity-70 group-hover:opacity-100 shrink-0" />
    </div>
  );
};
