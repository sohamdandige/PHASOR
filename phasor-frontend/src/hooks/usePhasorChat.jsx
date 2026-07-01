import { useState, useRef, useCallback } from 'react';
import { askStream, friendlyError } from '../api/phasor';

// Pipeline phases that map to SSE events from the backend:
//   start → answers_complete → debates_complete → done / error
export const PHASES = {
  IDLE: 'idle',
  ROUTING: 'routing',       // start event received
  ANSWERING: 'answering',   // waiting for answers_complete
  DEBATING: 'debating',     // waiting for debates_complete
  SYNTHESIZING: 'synthesizing', // waiting for done
  DONE: 'done',
  ERROR: 'error',
};

// Friendly terminal log lines shown during loading — maps phase → lines
export const PHASE_LOGS = {
  routing:     ['> Initializing pipeline...', '> Resolving model roster...'],
  answering:   ['> Dispatching independent queries...', '> Awaiting parallel model responses...', '> Collecting answers [OK]'],
  debating:    ['> Starting pairwise adversarial critique...', '> Cross-examining model responses...', '> Debate round complete [OK]'],
  synthesizing:['> Forwarding evidence to synthesis model...', '> Running consensus arbitration...', '> Compiling final verdict [OK]'],
};

export function usePhasorChat({ token, byokConfig }) {
  const [messages, setMessages] = useState([]); // { id, role, content, answers, debates, verdict, error }
  const [phase, setPhase] = useState(PHASES.IDLE);
  const [terminalLogs, setTerminalLogs] = useState([]);
  const abortRef = useRef(null);
  const logTimersRef = useRef([]);

  const appendLog = useCallback((lines) => {
    setTerminalLogs(prev => [...prev, ...lines]);
  }, []);

  const clearLogTimers = useCallback(() => {
    logTimersRef.current.forEach(clearTimeout);
    logTimersRef.current = [];
  }, []);

  const send = useCallback(async (query, attachments = []) => {
    if (phase !== PHASES.IDLE && phase !== PHASES.DONE && phase !== PHASES.ERROR) return;

    // Build history from last 5 user/assistant pairs
    const history = messages
      .filter(m => m.role === 'user' || (m.role === 'assistant' && m.verdict))
      .slice(-10)
      .map(m => ({
        role: m.role,
        content: m.role === 'user' ? m.content : m.verdict,
      }));

    // Optimistic user message
    const userMsgId = Date.now();
    const fullQuery = attachments.length
      ? `${query}\n\n${attachments.map(a => `[Attached: ${a.name}]\n${a.content}`).join('\n\n')}`
      : query;

    setMessages(prev => [...prev, {
      id: userMsgId,
      role: 'user',
      content: fullQuery,
    }]);

    // Placeholder assistant message
    const assistantMsgId = userMsgId + 1;
    setMessages(prev => [...prev, {
      id: assistantMsgId,
      role: 'assistant',
      pending: true,
    }]);

    setPhase(PHASES.ROUTING);
    setTerminalLogs([]);
    appendLog(PHASE_LOGS.routing);

    const controller = askStream({
      query: fullQuery,
      history,
      byok_config: byokConfig || null,
      token,
      onEvent: (eventName, data) => {
        switch (eventName) {
          case 'start':
            setPhase(PHASES.ANSWERING);
            clearLogTimers();
            appendLog(PHASE_LOGS.answering);
            break;

          case 'answers_complete':
            setPhase(PHASES.DEBATING);
            clearLogTimers();
            appendLog(PHASE_LOGS.debating);
            // Partially populate the assistant message with answers
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId
                ? { ...m, answers: data.answers }
                : m
            ));
            break;

          case 'debates_complete':
            setPhase(PHASES.SYNTHESIZING);
            clearLogTimers();
            appendLog(PHASE_LOGS.synthesizing);
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId
                ? { ...m, debates: data.debates }
                : m
            ));
            break;

          case 'done':
            setPhase(PHASES.DONE);
            clearLogTimers();
            setTerminalLogs([]);
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    pending: false,
                    answers: data.answers,
                    debates: data.debates,
                    verdict: data.verdict,
                  }
                : m
            ));
            break;

          case 'error':
            setPhase(PHASES.ERROR);
            clearLogTimers();
            setTerminalLogs([]);
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    pending: false,
                    error: data.message || data.error || 'Pipeline error',
                  }
                : m
            ));
            break;

          default:
            break;
        }
      },
      onError: (err) => {
        setPhase(PHASES.ERROR);
        clearLogTimers();
        setTerminalLogs([]);
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, pending: false, error: friendlyError(err) }
            : m
        ));
      },
    });

    abortRef.current = controller;
  }, [phase, messages, token, byokConfig, appendLog, clearLogTimers]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    clearLogTimers();
    setPhase(PHASES.IDLE);
    setTerminalLogs([]);
    // Remove the pending assistant message
    setMessages(prev => prev.filter(m => !m.pending));
  }, [clearLogTimers]);

  const clearMessages = useCallback(() => {
    cancel();
    setMessages([]);
    setPhase(PHASES.IDLE);
  }, [cancel]);

  const isStreaming = phase !== PHASES.IDLE && phase !== PHASES.DONE && phase !== PHASES.ERROR;

  return { messages, phase, terminalLogs, isStreaming, send, cancel, clearMessages };
}
