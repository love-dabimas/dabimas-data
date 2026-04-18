import { Fragment, type ReactNode } from "react";

export const collectHighlightTerms = (...groups: Array<string | string[] | undefined>) => {
  const terms = groups
    .flatMap((group) => {
      if (!group) {
        return [];
      }

      return Array.isArray(group) ? group : [group];
    })
    .map((term) => term.trim())
    .filter(Boolean);

  return [...new Set(terms)].sort((left, right) => right.length - left.length);
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const renderHighlightedText = (
  value: string,
  terms: string[]
): ReactNode => {
  if (!value) {
    return value;
  }

  if (terms.length === 0) {
    return value;
  }

  const nodes: ReactNode[] = [];
  let remaining = value;
  let key = 0;

  while (remaining.length > 0) {
    const match = terms
      .map((term) => ({
        term,
        match: remaining.match(new RegExp(escapeRegExp(term)))
      }))
      .filter(
        (result): result is { term: string; match: RegExpMatchArray } =>
          result.match !== null
      )
      .sort((left, right) => (left.match.index ?? 0) - (right.match.index ?? 0))[0];

    if (!match || match.match.index === undefined) {
      nodes.push(<Fragment key={`text-${key++}`}>{remaining}</Fragment>);
      break;
    }

    const start = match.match.index;
    const end = start + match.term.length;

    if (start > 0) {
      nodes.push(
        <Fragment key={`text-${key++}`}>{remaining.slice(0, start)}</Fragment>
      );
    }

    nodes.push(
      <mark key={`mark-${key++}`} className="result-highlight">
        {remaining.slice(start, end)}
      </mark>
    );
    remaining = remaining.slice(end);
  }

  return <>{nodes}</>;
};
