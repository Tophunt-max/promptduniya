import type { ReactNode } from 'react';

/**
 * Minimal markdown renderer.
 *
 * Deliberately not `dangerouslySetInnerHTML`: the source is parsed into React
 * elements, so article content can never inject markup or script. It supports
 * exactly the subset the CMS documents — headings, lists, blockquotes, fenced
 * code, bold, italic, inline code and links.
 */

type Segment = string | ReactNode;

function renderInline(text: string, keyPrefix: string): Segment[] {
  const out: Segment[] = [];
  // Order matters: code first so ** inside code is not treated as bold.
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) out.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-i${index++}`;

    if (token.startsWith('`')) {
      out.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      if (linkMatch) {
        const href = linkMatch[2]!;
        const isExternal = /^https?:\/\//.test(href);
        out.push(
          <a
            key={key}
            href={href}
            {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        out.push(token);
      }
    } else {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

export function ArticleBody({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];

  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
  let quoteLines: string[] = [];
  let codeLines: string[] | null = null;
  let key = 0;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ');
    blocks.push(<p key={`p${key++}`}>{renderInline(text, `p${key}`)}</p>);
    paragraph = [];
  }

  function flushList() {
    if (listItems.length === 0) return;
    const items = listItems.map((item, index) => (
      <li key={`li${index}`}>{renderInline(item, `l${key}-${index}`)}</li>
    ));
    blocks.push(
      listOrdered ? <ol key={`ol${key++}`}>{items}</ol> : <ul key={`ul${key++}`}>{items}</ul>,
    );
    listItems = [];
  }

  function flushQuote() {
    if (quoteLines.length === 0) return;
    blocks.push(
      <blockquote
        key={`q${key++}`}
        className="my-5 border-l-3 border-brand-400 pl-4 italic text-[var(--text-secondary)]"
      >
        {renderInline(quoteLines.join(' '), `q${key}`)}
      </blockquote>,
    );
    quoteLines = [];
  }

  function flushAll() {
    flushParagraph();
    flushList();
    flushQuote();
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      if (codeLines === null) {
        flushAll();
        codeLines = [];
      } else {
        blocks.push(
          <pre
            key={`pre${key++}`}
            className="prompt-box my-5 overflow-x-auto px-4 py-3.5 text-[0.8125rem] leading-relaxed"
          >
            <code>{codeLines.join('\n')}</code>
          </pre>,
        );
        codeLines = null;
      }
      continue;
    }

    if (codeLines !== null) {
      codeLines.push(rawLine);
      continue;
    }

    if (line.trim() === '') {
      flushAll();
      continue;
    }

    if (line.startsWith('### ')) {
      flushAll();
      blocks.push(<h3 key={`h3${key++}`}>{renderInline(line.slice(4), `h${key}`)}</h3>);
      continue;
    }
    if (line.startsWith('## ')) {
      flushAll();
      blocks.push(<h2 key={`h2${key++}`}>{renderInline(line.slice(3), `h${key}`)}</h2>);
      continue;
    }
    if (line.startsWith('# ')) {
      flushAll();
      blocks.push(<h2 key={`h1${key++}`}>{renderInline(line.slice(2), `h${key}`)}</h2>);
      continue;
    }

    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      quoteLines.push(line.slice(2));
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line.trimStart());
    if (bullet) {
      flushParagraph();
      flushQuote();
      if (listOrdered && listItems.length > 0) flushList();
      listOrdered = false;
      listItems.push(bullet[1]!);
      continue;
    }

    const numbered = /^\d+\.\s+(.*)$/.exec(line.trimStart());
    if (numbered) {
      flushParagraph();
      flushQuote();
      if (!listOrdered && listItems.length > 0) flushList();
      listOrdered = true;
      listItems.push(numbered[1]!);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }

  flushAll();

  return <div className="prose-article">{blocks}</div>;
}
