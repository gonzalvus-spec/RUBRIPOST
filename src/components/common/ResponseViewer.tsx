import { useMemo } from 'react';

export type ResponseLanguage = 'json' | 'xml' | 'plaintext';

type TokenKind =
  | 'plain'
  | 'key'
  | 'string'
  | 'number'
  | 'literal'
  | 'null'
  | 'punct'
  | 'tag'
  | 'attr'
  | 'comment';

interface Token {
  text: string;
  kind: TokenKind;
}

interface ResponseViewerProps {
  content: string;
  language: ResponseLanguage;
}

const JSON_PATTERN =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g;

const XML_TAG_PATTERN = /(<[^>]*>)/g;

function tokenizeJsonLine(line: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;

  for (const match of line.matchAll(JSON_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) {
      tokens.push({ text: line.slice(last, index), kind: 'plain' });
    }

    const [raw, text, colon, number, literal, punct] = match;

    if (text !== undefined) {
      tokens.push({ text, kind: colon ? 'key' : 'string' });
      if (colon) tokens.push({ text: colon, kind: 'punct' });
    } else if (number !== undefined) {
      tokens.push({ text: number, kind: 'number' });
    } else if (literal !== undefined) {
      tokens.push({
        text: literal,
        kind: literal === 'null' ? 'null' : 'literal',
      });
    } else if (punct !== undefined) {
      tokens.push({ text: punct, kind: 'punct' });
    }

    last = index + raw.length;
  }

  if (last < line.length) {
    tokens.push({ text: line.slice(last), kind: 'plain' });
  }

  return tokens;
}

function tokenizeTag(tag: string): Token[] {
  if (tag.startsWith('<!--')) {
    return [{ text: tag, kind: 'comment' }];
  }
  if (tag.startsWith('<?') || tag.startsWith('<!')) {
    return [{ text: tag, kind: 'tag' }];
  }

  const closing = tag.startsWith('</');
  const selfClosing = tag.endsWith('/>');
  const body = tag.slice(closing ? 2 : 1, tag.length - (selfClosing ? 2 : 1));
  const tokens: Token[] = [{ text: closing ? '</' : '<', kind: 'punct' }];

  const nameMatch = /^([\w:.-]+)/.exec(body);
  if (!nameMatch) {
    tokens.push({ text: body, kind: 'tag' });
  } else {
    tokens.push({ text: nameMatch[1], kind: 'tag' });
    const rest = body.slice(nameMatch[1].length);
    const attributePattern = /(\s+)([\w:.-]+)(\s*=\s*)("[^"]*"|'[^']*')/g;
    let last = 0;

    for (const match of rest.matchAll(attributePattern)) {
      const index = match.index ?? 0;
      if (index > last) {
        tokens.push({ text: rest.slice(last, index), kind: 'plain' });
      }
      tokens.push({ text: match[1], kind: 'plain' });
      tokens.push({ text: match[2], kind: 'attr' });
      tokens.push({ text: match[3], kind: 'punct' });
      tokens.push({ text: match[4], kind: 'string' });
      last = index + match[0].length;
    }

    if (last < rest.length) {
      tokens.push({ text: rest.slice(last), kind: 'plain' });
    }
  }

  tokens.push({ text: selfClosing ? '/>' : '>', kind: 'punct' });
  return tokens;
}

function tokenizeXmlLine(line: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;

  for (const match of line.matchAll(XML_TAG_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) {
      tokens.push({ text: line.slice(last, index), kind: 'plain' });
    }
    tokens.push(...tokenizeTag(match[1]));
    last = index + match[0].length;
  }

  if (last < line.length) {
    tokens.push({ text: line.slice(last), kind: 'plain' });
  }

  return tokens;
}

function tokenizeLine(line: string, language: ResponseLanguage): Token[] {
  if (language === 'json') return tokenizeJsonLine(line);
  if (language === 'xml') return tokenizeXmlLine(line);
  return [{ text: line, kind: 'plain' }];
}

/**
 * Visor de respuestas propio de Rubrifact: distinto del editor del body,
 * con numeración de líneas y resaltado de sintaxis en la paleta de la marca.
 */
export default function ResponseViewer({
  content,
  language,
}: ResponseViewerProps) {
  const lines = useMemo(() => content.split('\n'), [content]);

  return (
    <div
      className="response-view"
      role="region"
      aria-label="Cuerpo de la respuesta"
    >
      <div className="response-lines">
        {lines.map((line, index) => (
          <div className="response-line" key={index}>
            <span className="response-ln" aria-hidden="true">
              {index + 1}
            </span>
            <span className="response-code">
              {tokenizeLine(line, language).map((token, tokenIndex) => (
                <span
                  key={tokenIndex}
                  className={`response-token response-token-${token.kind}`}
                >
                  {token.text}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
