import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from "react";
import type { ChildLineOption } from "@/features/search/model/childLineOption";

interface ChildLineAutocompleteProps {
  id: string;
  options: ChildLineOption[];
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

interface ChildLineGroup {
  parentCode: string;
  parentLabel: string;
  options: ChildLineOption[];
}

// 入力値比較は大文字小文字や前後空白の揺れを吸収して行う。
const normalize = (value: string) => value.trim().toLocaleLowerCase("ja");

// 並び順はそのままに、同じ親系統が連続する候補を 1 グループへまとめる。
const groupChildLineOptions = (options: ChildLineOption[]) => {
  const groups: ChildLineGroup[] = [];

  for (const option of options) {
    const lastGroup = groups[groups.length - 1];

    if (
      lastGroup &&
      lastGroup.parentCode === option.parentCode &&
      lastGroup.parentLabel === option.parentLabel
    ) {
      lastGroup.options.push(option);
      continue;
    }

    groups.push({
      parentCode: option.parentCode,
      parentLabel: option.parentLabel,
      options: [option]
    });
  }

  return groups;
};

export const ChildLineAutocomplete = ({
  id,
  options,
  placeholder,
  value,
  onChange
}: ChildLineAutocompleteProps) => {
  // 入力欄と候補一覧の外側クリック判定に使う。
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    // 親コンポーネントから値が変わったときは入力表示も追従させる。
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    // 候補一覧を開いている間だけ外側クリック監視を有効にする。
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

  // 完全一致した候補があれば prefix バッジに親系統コードを出す。
  const resolvedOption = useMemo(
    () => options.find((option) => option.value === value.trim()) ?? null,
    [options, value]
  );

  // 入力文字列に一致する候補だけへ絞り込み、表示用グループへ再構成する。
  const filteredGroups = useMemo(() => {
    const query = normalize(inputValue);

    if (!query) {
      return groupChildLineOptions(options);
    }

    const filteredOptions = options.filter((option) => {
      const normalizedValue = normalize(option.value);
      const normalizedParentCode = normalize(option.parentCode);
      const normalizedParentLabel = normalize(option.parentLabel);

      return (
        normalizedValue.includes(query) ||
        normalizedParentCode.includes(query) ||
        normalizedParentLabel.includes(query)
      );
    });

    return groupChildLineOptions(filteredOptions);
  }, [inputValue, options]);

  const hasMatches = filteredGroups.some((group) => group.options.length > 0);

  // 候補クリックや Enter 選択時は入力欄表示・親 state・開閉状態を同時に更新する。
  const handleSelect = (nextValue: string) => {
    setInputValue(nextValue);
    onChange(nextValue);
    setIsOpen(false);
  };

  // Escape で閉じ、Enter で先頭候補を採用する最低限のキーボード操作を用意する。
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (event.key === "Enter" && filteredGroups[0]?.options[0]) {
      event.preventDefault();
      handleSelect(filteredGroups[0].options[0].value);
    }
  };

  return (
    <div ref={rootRef} className="line-autocomplete">
      <div className={`line-autocomplete__control ${isOpen ? "is-open" : ""}`}>
        <span
          aria-hidden="true"
          className={`line-autocomplete__prefix ${
            resolvedOption ? "" : "is-placeholder"
          }`}
        >
          {resolvedOption?.parentCode || "--"}
        </span>

        <input
          id={id}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          autoComplete="off"
          className="text-input line-autocomplete__input"
          placeholder={placeholder}
          role="combobox"
          type="text"
          value={inputValue}
          onChange={(event) => {
            const nextValue = event.target.value;
            // 自由入力中も即座に親へ伝え、検索条件表示などへ反映できるようにする。
            setInputValue(nextValue);
            onChange(nextValue);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleInputKeyDown}
        />

        {inputValue ? (
          <button
            aria-label="子系統をクリア"
            className="line-autocomplete__clear"
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
        <div
          id={listboxId}
          className="line-autocomplete__menu"
          role="listbox"
        >
          {hasMatches ? (
            filteredGroups.map((group) => (
              <section
                key={`${group.parentCode}-${group.parentLabel}`}
                className="line-autocomplete__group"
              >
                <header className="line-autocomplete__group-header">
                  <span className="line-autocomplete__group-badge">
                    {group.parentCode}
                  </span>
                  {/* グループ見出しには親系統の正式名を出して文脈を補う。 */}
                  <span>{group.parentLabel}</span>
                </header>

                <div className="line-autocomplete__group-list">
                  {group.options.map((option) => {
                    const isSelected = option.value === value;

                    return (
                      <button
                        key={`${group.parentCode}-${option.value}`}
                        aria-selected={isSelected}
                        className={`line-autocomplete__option ${
                          isSelected ? "is-selected" : ""
                        }`}
                        role="option"
                        type="button"
                        onClick={() => handleSelect(option.value)}
                      >
                        <span className="line-autocomplete__option-badge">
                          {option.parentCode}
                        </span>
                        <span className="line-autocomplete__option-label">
                          {option.value}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <div className="line-autocomplete__empty">一致する子系統がありません。</div>
          )}
        </div>
      ) : null}
    </div>
  );
};
