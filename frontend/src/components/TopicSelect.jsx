import { useState, useRef, useEffect, useMemo } from 'react';
import { MagnifyingGlassIcon, ChevronDownIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { getSessionImageUrl } from '../config/sessionImages';

const TOPIC_GROUPS = [
  {
    label: 'Holidays',
    items: [
      'Festival Holiday',
      'National Holiday',
    ],
  },
  {
    label: 'Meditation & Relaxation',
    items: [
      'Meditation',
      'Trataka Kriya',
      'Yoga Nidra',
    ],
  },
  {
    label: 'Pranayama',
    items: [
      'Pranayama - Bandhas',
      'Pranayama - Cooling Techniques',
      'Pranayama - Jasmine Breathing',
      'Pranayama - Multiple',
      'Pranayama - Pranava',
    ],
  },
  {
    label: 'Specialty Yoga',
    items: [
      'Face Yoga',
      'Kids Yoga',
      'Partner Yoga',
      'Pilates',
      'Yoga Dance',
      'Yoga + Face Yoga',
      'Yoga + Mudita',
    ],
  },
  {
    label: 'Surya Namaskar',
    items: [
      '21 Sets Surya Namaskaras',
      '100 Asanas',
      '108 Surya Namaskaras',
      'Padma Sadana - 7 Sets',
      'Power Of Surya Namaskar - 1.5 Hr',
      'Power Of Surya Namaskar - 54 SN',
      'Surya Namaskar + Yoga',
    ],
  },
  {
    label: 'Yoga Focus Areas',
    items: [
      'Yoga - Balancing',
      'Yoga - Chest Opening',
      'Yoga - Hip Openers',
      'Yoga - Holdings',
      'Yoga - Repetition',
      'Yoga - Strengthening',
      'Yoga - Stretching',
      'Yoga - Weight Loss',
      'Yoga - Women Health',
    ],
  },
  {
    label: 'Yoga Styles',
    items: [
      'Ashtanga Vinyasa',
      'Chandra Namaskar + Yoga',
      'Moderate to Intense Traditional Yoga',
      'Power Yoga',
      'Therapeutic Yoga',
      'Traditional Yoga',
      'Vinyasa Yoga',
      'Yin Yoga',
    ],
  },
  {
    label: 'Yoga with Props',
    items: [
      'Yoga with property - Belt/Chunni/Strap',
      'Yoga with property - Blocks/Bottle',
      'Yoga with property - Chair',
      'Yoga with property - Wall',
    ],
  },
  {
    label: 'Intense & Special',
    items: [
      'Animal Walks',
      'Hip Openers - Intense',
      'Intense Yoga',
      'Intense Yoga 30 min, Meditaiton 20 min',
      'Intense Yoga with Bottles/Dumbbells',
      'Jasmine Breathing',
      'Nutrition',
      'Village Yoga',
      'Village Yoga - Intense',
      'Yoga With Wall - Intense',
    ],
  },
];

// Flat sorted list (used for searching)
const ALL_TOPICS = TOPIC_GROUPS.flatMap(g => g.items).sort((a, b) => a.localeCompare(b));

export default function TopicSelect({ value, onChange, id, required }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const itemRefs = useRef({});

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  // Focus search when opening
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  // Filter results
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return TOPIC_GROUPS;
    return TOPIC_GROUPS.map(g => ({
      ...g,
      items: g.items.filter(t => t.toLowerCase().includes(q)),
    })).filter(g => g.items.length > 0);
  }, [search]);

  // Build flat list of visible items for keyboard navigation
  const flatVisible = useMemo(() => {
    const items = [];
    filtered.forEach(g => g.items.forEach(t => items.push(t)));
    // Add "Others" at end if it matches search or search is empty
    const q = search.toLowerCase().trim();
    if (!q || 'others'.includes(q)) items.push('__others__');
    return items;
  }, [filtered, search]);

  // Reset highlight when search changes
  useEffect(() => {
    setHighlightIdx(0);
  }, [search]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIdx >= 0 && highlightIdx < flatVisible.length) {
      const key = flatVisible[highlightIdx];
      const el = itemRefs.current[key];
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightIdx, flatVisible]);

  function select(topic) {
    onChange(topic === '__others__' ? 'Others' : topic);
    setOpen(false);
    setSearch('');
    setHighlightIdx(-1);
  }

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx(i => Math.min(i + 1, flatVisible.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIdx >= 0 && highlightIdx < flatVisible.length) {
          select(flatVisible[highlightIdx]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setSearch('');
        break;
      default:
        break;
    }
  }

  const isOthers = value === 'Others';
  const displayValue = value || '';
  const showOthers = true;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        className="input"
        onClick={() => setOpen(!open)}
        onKeyDown={handleKeyDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textAlign: 'left',
          cursor: 'pointer',
          color: displayValue ? 'var(--text)' : 'var(--text-tertiary)',
          gap: 8,
          paddingRight: value ? 8 : 12,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, overflow: 'hidden' }}>
          {value && getSessionImageUrl(value) && (
            <img
              src={getSessionImageUrl(value)}
              alt=""
              style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
            />
          )}
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {displayValue || 'Select topic…'}
          </span>
        </span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {value && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: 'var(--border)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'background var(--transition-fast)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-light)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--border)'}
            >
              <XMarkIcon style={{ width: 12, height: 12 }} />
            </span>
          )}
          <ChevronDownIcon style={{
            width: 16,
            height: 16,
            color: 'var(--text-tertiary)',
            transition: 'transform var(--transition-fast)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }} />
        </span>
      </button>

      {/* Hidden native input for form required validation */}
      {required && (
        <input
          tabIndex={-1}
          autoComplete="off"
          value={value || ''}
          onChange={() => {}}
          required
          style={{
            position: 'absolute',
            opacity: 0,
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          animation: 'topicDropIn 0.18s ease-out',
        }}>
          {/* Search bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderBottom: '1px solid var(--border-light)',
            background: 'var(--bg)',
          }}>
            <MagnifyingGlassIcon style={{ width: 16, height: 16, color: 'var(--text-tertiary)', flexShrink: 0 }} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search topics…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 14,
                color: 'var(--text)',
                width: '100%',
                fontFamily: 'inherit',
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: 'var(--border)',
                  color: 'var(--text-secondary)',
                  flexShrink: 0,
                }}
              >
                <XMarkIcon style={{ width: 12, height: 12 }} />
              </button>
            )}
          </div>

          {/* Options list */}
          <div ref={listRef} role="listbox" style={{
            maxHeight: 280,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          }}>
            {filtered.length === 0 && !showOthers ? (
              <div style={{
                padding: '20px 16px',
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 13,
              }}>
                No topics found
              </div>
            ) : (
              <>
                {filtered.map(group => (
                  <div key={group.label}>
                    {/* Group header */}
                    <div style={{
                      padding: '8px 14px 4px',
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      userSelect: 'none',
                      position: 'sticky',
                      top: 0,
                      background: 'var(--bg-elevated)',
                      zIndex: 1,
                    }}>
                      {group.label}
                    </div>
                    {group.items.map(topic => {
                      const isSelected = value === topic;
                      const flatIdx = flatVisible.indexOf(topic);
                      const isHighlighted = flatIdx === highlightIdx;
                      const imageUrl = getSessionImageUrl(topic);
                      return (
                        <div
                          key={topic}
                          ref={el => { itemRefs.current[topic] = el; }}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => select(topic)}
                          onMouseEnter={() => setHighlightIdx(flatIdx)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '9px 14px',
                            cursor: 'pointer',
                            fontSize: 14,
                            color: isSelected ? 'var(--primary)' : 'var(--text)',
                            fontWeight: isSelected ? 600 : 400,
                            background: isHighlighted
                              ? 'var(--primary-light)'
                              : 'transparent',
                            transition: 'background 0.1s',
                          }}
                        >
                          {imageUrl && (
                            <img
                              src={imageUrl}
                              alt=""
                              style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                            />
                          )}
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {topic}
                          </span>
                          {isSelected && (
                            <CheckIcon style={{ width: 16, height: 16, color: 'var(--primary)', flexShrink: 0 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Others option */}
                {showOthers && (
                  <>
                    <div style={{
                      height: 1,
                      background: 'var(--border-light)',
                      margin: '4px 14px',
                    }} />
                    <div
                      ref={el => { itemRefs.current['__others__'] = el; }}
                      role="option"
                      aria-selected={isOthers}
                      onClick={() => select('__others__')}
                      onMouseEnter={() => setHighlightIdx(flatVisible.indexOf('__others__'))}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 14px',
                        cursor: 'pointer',
                        fontSize: 14,
                        color: isOthers ? 'var(--primary)' : 'var(--text-secondary)',
                        fontWeight: isOthers ? 600 : 500,
                        fontStyle: 'italic',
                        background: flatVisible.indexOf('__others__') === highlightIdx
                          ? 'var(--primary-light)'
                          : 'transparent',
                        transition: 'background 0.1s',
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ flex: 1 }}>Others (specify in instructions)</span>
                      {isOthers && (
                        <CheckIcon style={{ width: 16, height: 16, color: 'var(--primary)', flexShrink: 0 }} />
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes topicDropIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
