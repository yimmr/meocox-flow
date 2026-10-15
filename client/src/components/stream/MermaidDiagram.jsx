import { useEffect, useId, useState } from 'react';

let mermaidPromise;
let renderSequence = 0;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'dark'
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

export default function MermaidDiagram({ source }) {
  const reactId = useId();
  const [result, setResult] = useState({ status: 'loading', svg: '', error: '' });

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}-${renderSequence++}`;
    setResult({ status: 'loading', svg: '', error: '' });

    loadMermaid()
      .then((mermaid) => mermaid.render(id, source))
      .then(({ svg }) => {
        if (!cancelled) setResult({ status: 'ready', svg, error: '' });
      })
      .catch((error) => {
        if (!cancelled) {
          setResult({
            status: 'error',
            svg: '',
            error: error instanceof Error ? error.message : '图表语法无法解析'
          });
        }
      });

    return () => { cancelled = true; };
  }, [reactId, source]);

  return (
    <figure className="chat-markdown-diagram">
      {result.status === 'ready' ? (
        <div
          className="chat-markdown-diagram-canvas"
          role="img"
          aria-label="Mermaid 图表"
          dangerouslySetInnerHTML={{ __html: result.svg }}
        />
      ) : result.status === 'loading' ? (
        <div className="chat-markdown-diagram-status">正在生成图表…</div>
      ) : (
        <div className="chat-markdown-diagram-error">
          图表渲染失败：{result.error}
        </div>
      )}
      <details className="chat-markdown-diagram-source">
        <summary>查看图表源码</summary>
        <pre><code>{source}</code></pre>
      </details>
    </figure>
  );
}
