import React from 'react';

export default function PresetSelect({label,options,value,onChange,disabled,loading=false,embeddedName}) {
  if (embeddedName !== undefined) return <select aria-label={label} value="" disabled title="Using the project’s embedded preset"><option value="">{embeddedName}</option></select>;
  return <select aria-label={label} value={value || ''} onChange={event => onChange(event.target.value)} disabled={disabled || options.length === 0}>
    {!value && <option value="">{loading ? 'Loading presets…' : 'No compatible presets'}</option>}
    {value && !options.some(option => option.id === value) && <option value={value}>Unavailable preset — select a replacement</option>}
    {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
  </select>;
}
