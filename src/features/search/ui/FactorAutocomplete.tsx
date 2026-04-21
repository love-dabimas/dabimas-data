import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from "react";
import type { FactorOption } from "@/features/horses/model/types";
import { FactorBadge } from "@/features/search/ui/FactorBadge";

interface FactorAutocompleteProps {
  id: string;
  options: FactorOption[];
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

// 祖先検索も余分な空白や大小文字差を無視して候補を探す。
const normalize = (value: string) => value.trim().toLocaleLowerCase("ja");

export const FactorAutocomplete = ({
  id,
  options,
  placeholder,
  value,
  onChange
}: FactorAutocompleteProps) => {
  // 候補一覧の外クリックで閉じるための基準要素。
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    // 外部から値が変わったら表示文字列も合わせる。
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    // メニューを開いているときだけ外側クリック監視を行う。
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  // id・表示名・バッジ文字のどれで打っても候補へたどり着けるようにする。
  const filteredOptions = useMemo(() => {
    const query = normalize(inputValue);

    if (!query) {
      return options;
    }

    return options.filter((option) => {
      const normalizedId = normalize(option.id);
      const normalizedName = normalize(option.name);
      const normalizedBadges = (option.badges ?? []).map((badge) => normalize(badge));

      return (
        normalizedId.includes(query) ||
        normalizedName.includes(query) ||
        normalizedBadges.some((badge) => badge.includes(query))
      );
    });
  }, [inputValue, options]);

  // 現在値から完全一致の候補を逆引きし、選択済みバッジ表示に使う。
  const resolvedOption = useMemo(
    () =>
      options.find(
        (option) => option.id === value.trim() || option.name === value.trim()
      ) ?? null,
    [options, value]
  );

  // 選択時は祖先 id を正として親へ返す。
  const handleSelect = (nextOption: FactorOption) => {
    setInputValue(nextOption.id);
    onChange(nextOption.id);
    setIsOpen(false);
  };

  // キーボードでは Escape / Enter のみ対応し、最初の候補を素早く選べるようにする。
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (event.key === "Enter" && filteredOptions[0]) {
      event.preventDefault();
      handleSelect(filteredOptions[0]);
    }
  };

  return (
    <div ref={rootRef} className="factor-autocomplete">
      <div className={`factor-autocomplete__control ${isOpen ? "is-open" : ""}`}>
        <input
          id={id}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          autoComplete="off"
          className="text-input factor-autocomplete__input"
          enterKeyHint="search"
          placeholder={placeholder}
          role="combobox"
          spellCheck={false}
          type="text"
          value={inputValue}
          onChange={(event) => {
            const nextValue = event.target.value;
            // 入力途中でも祖先名をそのまま親 state へ返し、モーダル内表示を同期する。
            setInputValue(nextValue);
            onChange(nextValue);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleInputKeyDown}
        />

        {resolvedOption?.badges && resolvedOption.badges.length > 0 ? (
          // 選択済み候補の因子バッジを入力欄横へ出し、内容を即確認できるようにする。
          <div className="factor-autocomplete__selected-badges" aria-hidden="true">
            {resolvedOption.badges.map((badge, index) => (
              <FactorBadge
                key={`${resolvedOption.id}-${index}-${badge}-selected`}
                label={badge}
                compact
              />
            ))}
          </div>
        ) : null}

        {inputValue ? (
          <button
            aria-label="祖先指定をクリア"
            className="factor-autocomplete__clear"
            type="button"
            onClick={() => {
              setInputValue("");
              onChange("");
              setIsOpen(false);
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div id={listboxId} className="factor-autocomplete__menu" role="listbox">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => {
              // 選択中の候補は入力値と id / name のどちらで一致しても強調表示する。
              const isSelected =
                option.id === value.trim() || option.name === value.trim();

              return (
                <button
                  key={option.id}
                  aria-selected={isSelected}
                  className={`factor-autocomplete__option ${
                    isSelected ? "is-selected" : ""
                  }`}
                  role="option"
                  type="button"
                  onClick={() => handleSelect(option)}
                >
                  <div className="factor-autocomplete__option-main">
                    <span className="factor-autocomplete__option-label">
                      {option.name}
                    </span>
                    {option.badges && option.badges.length > 0 ? (
                      // 候補一覧でも因子バッジを見せて選び間違いを減らす。
                      <span className="factor-autocomplete__badges">
                        {option.badges.map((badge, index) => (
                          <FactorBadge
                            key={`${option.id}-${index}-${badge}`}
                            label={badge}
                            compact
                          />
                        ))}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="factor-autocomplete__empty">
              一致する祖先名がありません。
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
