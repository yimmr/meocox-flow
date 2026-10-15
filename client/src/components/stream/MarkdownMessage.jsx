import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MermaidDiagram from './MermaidDiagram.jsx';

function preserveLineBreaks(markdown) {
  let insideFence = false;
  return markdown.split('\n').map((line) => {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      insideFence = !insideFence;
      return line;
    }
    if (insideFence || !line.trim() || /^\s*(#{1,6}\s|>|[-*+]\s|\d+\.\s)/.test(line)) {
      return line;
    }
    return `${line}  `;
  }).join('\n');
}

/** Shared, safely parsed Markdown presentation for conversation messages. */
export default function MarkdownMessage({ children, className = '' }) {
  const content = preserveLineBreaks(typeof children === 'string' ? children : '');
  return (
    <div className={`chat-markdown ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a href={href} target="_blank" rel="noreferrer" className="chat-markdown-link">
              {linkChildren}
            </a>
          ),
          table: ({ children: tableChildren }) => (
            <div className="chat-markdown-table-wrap">
              <table>{tableChildren}</table>
            </div>
          ),
          pre: ({ children: preChildren }) => {
            const codeElement = Array.isArray(preChildren) ? preChildren[0] : preChildren;
            const language = codeElement?.props?.className || '';
            if (/\blanguage-mermaid\b/.test(language)) {
              const diagramSource = codeElement.props.children;
              const source = Array.isArray(diagramSource) ? diagramSource.join('') : String(diagramSource || '');
              return <MermaidDiagram source={source.trim()} />;
            }
            return <pre>{preChildren}</pre>;
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
