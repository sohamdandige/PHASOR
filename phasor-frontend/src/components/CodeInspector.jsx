import { useState } from 'react';
import { X, Download, Code2, FileText } from 'lucide-react';

function downloadFile(content, filename, lang) {
  const extMap = {
    python: 'py', javascript: 'js', typescript: 'ts', jsx: 'jsx', tsx: 'tsx',
    rust: 'rs', go: 'go', java: 'java', cpp: 'cpp', c: 'c', bash: 'sh',
    shell: 'sh', html: 'html', css: 'css', json: 'json', yaml: 'yaml',
    toml: 'toml', sql: 'sql', markdown: 'md',
  };
  const ext = extMap[lang?.toLowerCase()] || 'txt';
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `phasor-output.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CodeInspector({ file, onClose }) {
  if (!file) return null;

  const { language = 'code', code = '' } = file;
  const lines = code.split('\n');

  return (
    <aside
      className="flex flex-col h-full slide-in"
      style={{
        width: 320,
        minWidth: 320,
        background: '#121214',
        borderLeft: '1px solid #27272A',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid #27272A' }}
      >
        <Code2 size={14} style={{ color: '#7C3AED' }} />
        <span className="flex-1 text-sm font-medium truncate" style={{ color: '#F4F4F5' }}>
          File Inspector
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => downloadFile(code, null, language)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
            style={{ color: '#A1A1AA', background: '#18181B', border: '1px solid #27272A' }}
            onMouseEnter={e => e.currentTarget.style.color = '#F4F4F5'}
            onMouseLeave={e => e.currentTarget.style.color = '#A1A1AA'}
            title="Download file"
          >
            <Download size={11} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded transition-colors"
            style={{ color: '#A1A1AA' }}
            onMouseEnter={e => e.currentTarget.style.color = '#F4F4F5'}
            onMouseLeave={e => e.currentTarget.style.color = '#A1A1AA'}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Language badge + meta */}
      <div
        className="flex items-center gap-3 px-4 py-2 shrink-0"
        style={{ borderBottom: '1px solid #27272A', background: '#0d0d0f' }}
      >
        <span
          className="text-xs font-mono px-2 py-0.5 rounded"
          style={{ background: '#7C3AED22', color: '#7C3AED', border: '1px solid #7C3AED44' }}
        >
          {language}
        </span>
        <span className="text-xs" style={{ color: '#52525b' }}>
          {lines.length} lines
        </span>
      </div>

      {/* Code with line numbers */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs font-mono" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {lines.map((line, i) => (
              <tr
                key={i}
                className="group"
                onMouseEnter={e => e.currentTarget.style.background = '#18181B'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td
                  className="text-right pr-3 pl-4 py-0.5 select-none"
                  style={{
                    color: '#3f3f46',
                    minWidth: 40,
                    userSelect: 'none',
                    borderRight: '1px solid #1c1c1f',
                    lineHeight: '1.6',
                  }}
                >
                  {i + 1}
                </td>
                <td
                  className="px-4 py-0.5"
                  style={{ color: '#d4d4d8', whiteSpace: 'pre', lineHeight: '1.6' }}
                >
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Download footer */}
      <div className="px-4 py-3 shrink-0" style={{ borderTop: '1px solid #27272A' }}>
        <button
          onClick={() => downloadFile(code, null, language)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-opacity"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #2563EB)', color: '#fff' }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <Download size={14} />
          Download file
        </button>
      </div>
    </aside>
  );
}
