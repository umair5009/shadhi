import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useDebouncedValue } from '@/lib/hooks';
import { Spinner } from '@/components/ui/Feedback';

/**
 * Search-as-you-type picker.
 * @param {{
 *   queryKey: string, fetchOptions: (q: string) => Promise<any[]>, onSelect: (option: any) => void,
 *   renderOption: (option: any) => import('react').ReactNode, placeholder?: string, minLength?: number,
 *   emptyText?: string, footer?: (close: () => void, text: string) => import('react').ReactNode, autoFocus?: boolean, invalid?: boolean, id?: string
 * }} props
 */
export function AsyncCombobox({ queryKey, fetchOptions, onSelect, renderOption, placeholder = 'Search…', minLength = 0, emptyText = 'No matches', footer, autoFocus, invalid, id }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebouncedValue(text.trim(), 250);
  const listId = useId();
  const wrapper = useRef(null);

  const results = useQuery({
    queryKey: ['combobox', queryKey, q],
    queryFn: () => fetchOptions(q),
    enabled: open && q.length >= minLength,
    placeholderData: keepPreviousData,
    staleTime: 10 * 1000,
  });
  const options = q.length >= minLength ? (results.data ?? []) : [];

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!wrapper.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const choose = (option) => {
    onSelect(option);
    setText('');
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter' && open && options[active]) {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="combobox" ref={wrapper}>
      <div className="search-input" style={{ minWidth: 0 }}>
        <Search size={16} aria-hidden />
        <input
          id={id}
          className="input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          value={text}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && (
        <ul className="combobox__list" id={listId} role="listbox">
          {results.isFetching && options.length === 0 && (
            <li className="combobox__empty">
              <Spinner size={16} /> Searching…
            </li>
          )}
          {q.length < minLength && <li className="combobox__empty">Type at least {minLength} characters to search</li>}
          {!results.isFetching && q.length >= minLength && options.length === 0 && <li className="combobox__empty">{emptyText}</li>}
          {options.map((option, index) => (
            <li
              key={option._id}
              role="option"
              aria-selected={index === active}
              className="combobox__option"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
            >
              {renderOption(option)}
            </li>
          ))}
          {footer && <li>{footer(() => setOpen(false), text)}</li>}
        </ul>
      )}
    </div>
  );
}
