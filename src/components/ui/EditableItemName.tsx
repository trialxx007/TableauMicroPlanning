import React, { useState, useRef, useEffect } from 'react';
import { Pencil, Check } from 'lucide-react';

interface EditableItemNameProps {
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  onSave: (newName: string) => void;
  className?: string;
  prefix?: string;
  disabled?: boolean;
}

export const EditableItemName: React.FC<EditableItemNameProps> = ({
  value,
  defaultValue = '',
  placeholder = 'Nom...',
  onSave,
  className = '',
  prefix,
  disabled = false,
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

  useEffect(() => {
    if (disabled) {
      setIsEditing(false);
      setText(value || defaultValue);
    }
  }, [disabled, value, defaultValue]);

  const handleSave = () => {
    setIsEditing(false);
    const trimmed = text.trim();
    if (trimmed && trimmed !== defaultValue) {
      onSave(trimmed);
    } else {
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
          disabled={disabled}
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
          placeholder={placeholder || defaultValue}
          className="text-sm font-bold text-slate-900 bg-white border-2 border-slate-900 rounded px-2 py-1 focus:outline-hidden shadow-xs min-w-[160px] max-w-[260px] disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            if (!disabled) handleSave();
          }}
          disabled={disabled}
          className="p-1 text-emerald-600 hover:text-emerald-800 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          title="Valider"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => {
        if (!disabled) setIsEditing(true);
      }}
      className={`group inline-flex items-center gap-1 py-0 px-1 rounded transition-all ${disabled ? 'cursor-default' : 'cursor-pointer hover:bg-slate-200/80'} ${className}`}
      title="Cliquer pour personnaliser le nom"
    >
      {prefix && <span className="text-slate-400 font-mono text-[11px]">{prefix}</span>}
      <span
        className={`font-bold text-sm truncate max-w-[160px] sm:max-w-[220px] ${displayName ? 'text-slate-900' : 'text-slate-400 italic'}`}
      >
        {displayName || placeholder}
      </span>
      <Pencil className="w-2.5 h-2.5 text-slate-400 group-hover:text-slate-900 transition-colors opacity-70 group-hover:opacity-100 shrink-0" />
    </div>
  );
};