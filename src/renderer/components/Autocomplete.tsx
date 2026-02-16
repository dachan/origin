import React, { useRef, useEffect } from 'react';

interface AutocompleteProps {
  items: string[];
  selectedIndex: number;
  onSelect: (item: string) => void;
}

const Autocomplete: React.FC<AutocompleteProps> = ({
  items,
  selectedIndex,
  onSelect,
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
      selectedEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (items.length === 0) return null;

  return (
    <div className="autocomplete-dropdown" ref={listRef}>
      {items.map((item, index) => (
        <div
          key={`${item}-${index}`}
          className={`autocomplete-item ${index === selectedIndex ? 'selected' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent textarea blur
            onSelect(item);
          }}
        >
          <span className="autocomplete-text">{item}</span>
        </div>
      ))}
    </div>
  );
};

export default Autocomplete;
