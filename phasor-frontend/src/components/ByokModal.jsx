import { useState } from 'react';
import { X, Plus, Trash2, Key, Cpu } from 'lucide-react';

export default function ByokModal({ open, current, onSave, onClose }) {
  const [apiKey, setApiKey] = useState(current?.api_key || '');
  const [models, setModels] = useState(current?.models || ['', '']);
  const [synthesisModel, setSynthesisModel] = useState(current?.synthesis_model || '');
  const [error, setError] = useState('');

  if (!open) return null;

  const addModel = () => {
    if (models.length < 5) setModels(prev => [...prev, '']);
  };
  const removeModel = (i) => {
    if (models.length > 2) setModels(prev => prev.filter((_, idx) => idx !== i));
  };
  const setModel = (i, v) => setModels(prev => prev.map((m, idx) => idx === i ? v : m));

  const handleSave = () => {
    setError('');
    if (!apiKey.trim()) return setError('API key is required');
    const cleanModels = models.map(m => m.trim()).filter(Boolean);
    if (cleanModels.length < 2) return setError('At least 2 model slugs are required');
    const synthModel = synthesisModel.trim() || cleanModels[0];
    onSave({ api_key: apiKey.trim(), models: cleanModels, synthesis_model: synthModel });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(9,9,11,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl overflow-hidden fade-up"
        style={{ background: '#18181B', border: '1px solid #27272A' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid #27272A' }}>
          <Key size={16} style={{ color: '#7C3AED' }} />
          <h2 className="text-sm font-semibold flex-1" style={{ color: '#F4F4F5' }}>
            Bring Your Own Key (BYOK)
          </h2>
          <button onClick={onClose} style={{ color: '#52525b' }}>
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* API Key */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#A1A1AA' }}>
              OpenRouter API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-or-..."
              className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono"
              style={{
                background: '#09090B',
                border: '1px solid #27272A',
                color: '#F4F4F5',
                caretColor: '#7C3AED',
              }}
            />
          </div>

          {/* Models */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#A1A1AA' }}>
              Debater models (2–5 OpenRouter slugs)
            </label>
            <div className="space-y-2">
              {models.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center text-xs font-mono shrink-0"
                    style={{ background: '#27272A', color: '#7C3AED' }}
                  >
                    {i + 1}
                  </div>
                  <input
                    value={m}
                    onChange={e => setModel(i, e.target.value)}
                    placeholder={`e.g. google/gemini-2.0-flash`}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs outline-none font-mono"
                    style={{
                      background: '#09090B',
                      border: '1px solid #27272A',
                      color: '#F4F4F5',
                      caretColor: '#7C3AED',
                    }}
                  />
                  {models.length > 2 && (
                    <button onClick={() => removeModel(i)} style={{ color: '#52525b' }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {models.length < 5 && (
              <button
                onClick={addModel}
                className="mt-2 flex items-center gap-1.5 text-xs transition-colors"
                style={{ color: '#7C3AED' }}
              >
                <Plus size={12} />
                Add model
              </button>
            )}
          </div>

          {/* Synthesis model */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#A1A1AA' }}>
              Synthesis model (defaults to first debater)
            </label>
            <input
              value={synthesisModel}
              onChange={e => setSynthesisModel(e.target.value)}
              placeholder="e.g. anthropic/claude-3-5-sonnet"
              className="w-full px-3 py-1.5 rounded-lg text-xs outline-none font-mono"
              style={{
                background: '#09090B',
                border: '1px solid #27272A',
                color: '#F4F4F5',
                caretColor: '#7C3AED',
              }}
            />
          </div>

          {error && (
            <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4" style={{ borderTop: '1px solid #27272A' }}>
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm transition-colors"
            style={{ background: '#27272A', color: '#A1A1AA' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 btn-gradient py-2 rounded-lg text-sm text-white font-medium"
          >
            Save BYOK config
          </button>
        </div>
      </div>
    </div>
  );
}
